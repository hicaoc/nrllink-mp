// BLE 配网页面：通过蓝牙连接 NRL-ESP32-CFG 设备，读取/写入 WiFi 与服务器配置。
//
// 设备端协议（Nordic UART Service 风格，见固件 src/lib/ble_config.cpp）：
//   Service : 6E400001-B5A3-F393-E0A9-E50E24DCCA9E
//   RX(写)  : 6E400002-...  手机写命令，命令以 \n 结尾
//   TX(通知): 6E400003-...  设备以 notify 逐行回复（如 WIFI_SSID=xxx / OK SET / ERR SET）
// 命令：GET / SET KEY=VALUE / SAVE / APPLY / REBOOT / RESET_NET

const TARGET_NAME = 'NRL-ESP32-CFG';
const SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
const RX_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E'; // write
const TX_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'; // notify

// ---- 编解码工具 ----------------------------------------------------------
function strToBytes(str) {
  // UTF-8 编码（SSID/密码可能含中文）。
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) {
      bytes.push(c);
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff) {
      // 代理对
      const c2 = str.charCodeAt(++i);
      c = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
      bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f),
                 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return bytes;
}

function bytesToStr(bytes) {
  // UTF-8 解码。
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i];
    if (b < 0x80) { out += String.fromCharCode(b); i += 1; }
    else if (b >= 0xf0) {
      const cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) |
                 ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
      const u = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (u >> 10), 0xdc00 + (u & 0x3ff));
      i += 4;
    } else if (b >= 0xe0) {
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
      i += 3;
    } else {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    }
  }
  return out;
}

function ab2str(buffer) {
  return bytesToStr(Array.from(new Uint8Array(buffer)));
}

function normUuid(u) {
  return (u || '').toUpperCase();
}

Page({
  data: {
    phase: 'idle',          // idle | scanning | connecting | connected
    statusText: '未连接',
    scanning: false,
    devices: [],            // { deviceId, name, RSSI }
    connectedName: '',
    busy: false,
    scanningWifi: false,    // 正在让设备扫描周边 WiFi
    wifiList: [],           // 设备扫描到的 WiFi：{ ssid, rssi }
    log: [],                // 设备回复日志
    form: {
      wifi_ssid: '',
      wifi_pass: '',
      server_host: '',
      server_port: '',
      channel: '',
      callsign: '',
      call_ssid: '',
    },
  },

  // 运行时（不放 data，避免频繁 setData）
  _deviceId: '',
  _rxCharId: '',
  _txCharId: '',
  _serviceId: '',
  _rxBuffer: '',            // notify 行缓冲
  _waiters: [],             // 等待 OK/ERR 的回调队列
  _scanResults: null,       // WiFi 扫描累积（非 null 时表示扫描进行中）
  _wifiStateWaiter: null,   // APPLY 后等待 GOT_IP / FAILED
  _provisionSucceeded: false,

  onLoad() {
    this._onCharChange = this._onCharChange.bind(this);
    this._onConnState = this._onConnState.bind(this);
  },

  onUnload() {
    this._teardown();
  },

  // ---- 扫描 --------------------------------------------------------------
  async startScan() {
    if (this.data.scanning) return;
    this.setData({ devices: [], scanning: true, phase: 'scanning', statusText: '正在打开蓝牙…' });
    try {
      await this._wx('openBluetoothAdapter');
    } catch (e) {
      this.setData({ scanning: false, phase: 'idle', statusText: '蓝牙不可用，请检查手机蓝牙是否开启' });
      wx.showToast({ title: '请开启手机蓝牙', icon: 'none' });
      return;
    }

    wx.onBluetoothDeviceFound((res) => {
      const updates = {};
      (res.devices || []).forEach((d) => {
        const name = d.name || d.localName || '';
        if (name.indexOf(TARGET_NAME) === -1) return;
        const list = this.data.devices.slice();
        if (!list.find((x) => x.deviceId === d.deviceId)) {
          list.push({ deviceId: d.deviceId, name, RSSI: d.RSSI });
          updates.devices = list;
        }
      });
      if (updates.devices) this.setData(updates);
    });

    try {
      await this._wx('startBluetoothDevicesDiscovery', {
        allowDuplicatesKey: false,
        powerLevel: 'high',
      });
      this.setData({ statusText: '正在搜索 ' + TARGET_NAME + '…' });
    } catch (e) {
      this.setData({ scanning: false, phase: 'idle', statusText: '启动搜索失败' });
      return;
    }

    // 12 秒后自动停止搜索。
    this._scanTimer = setTimeout(() => this.stopScan(), 12000);
  },

  async stopScan() {
    if (this._scanTimer) { clearTimeout(this._scanTimer); this._scanTimer = null; }
    try { await this._wx('stopBluetoothDevicesDiscovery'); } catch (e) {}
    const text = this.data.devices.length ? '搜索完成，请选择设备' : '未找到设备，请确认设备已上电且未连上 WiFi';
    this.setData({ scanning: false, statusText: this.data.phase === 'connected' ? this.data.statusText : text });
  },

  // ---- 连接 --------------------------------------------------------------
  async connectDevice(e) {
    const deviceId = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name || TARGET_NAME;
    await this.stopScan();
    this.setData({ phase: 'connecting', statusText: '正在连接…', busy: true });

    try {
      await this._wx('createBLEConnection', { deviceId, timeout: 10000 });
      this._deviceId = deviceId;

      wx.onBLEConnectionStateChange(this._onConnState);

      // 尽量协商更大的 MTU（Android 有效；iOS 自动协商，失败可忽略）。
      try { await this._wx('setBLEMTU', { deviceId, mtu: 185 }); } catch (e2) {}

      await this._discover(deviceId);

      // 订阅 notify。
      wx.onBLECharacteristicValueChange(this._onCharChange);
      await this._wx('notifyBLECharacteristicValueChange', {
        deviceId,
        serviceId: this._serviceId,
        characteristicId: this._txCharId,
        state: true,
      });

      this.setData({
        phase: 'connected',
        connectedName: name,
        statusText: '已连接：' + name,
        busy: false,
      });

      // 部分机型刚开启 notify 时会漏掉紧随其后的第一包，稍作等待再读取。
      await new Promise((r) => setTimeout(r, 400));
      // 先读当前配置，再读取设备已缓存的 WiFi 列表（串行，避免回复交叠）。
      await this.loadConfig();
      await this.loadWifiList();
    } catch (err) {
      console.error('connect failed', err);
      this.setData({ phase: 'idle', busy: false, statusText: '连接失败：' + (err && err.errMsg || err) });
      this._teardown();
    }
  },

  async _discover(deviceId) {
    const svc = await this._wx('getBLEDeviceServices', { deviceId });
    const service = (svc.services || []).find((s) => normUuid(s.uuid) === SERVICE_UUID);
    if (!service) throw new Error('未找到配网服务');
    this._serviceId = service.uuid;

    const chr = await this._wx('getBLEDeviceCharacteristics', {
      deviceId, serviceId: service.uuid,
    });
    (chr.characteristics || []).forEach((c) => {
      const u = normUuid(c.uuid);
      if (u === RX_UUID) this._rxCharId = c.uuid;
      else if (u === TX_UUID) this._txCharId = c.uuid;
    });
    if (!this._rxCharId || !this._txCharId) throw new Error('未找到配网特征值');
  },

  _onConnState(res) {
    if (res.deviceId === this._deviceId && !res.connected) {
      this.setData({
        phase: 'idle',
        connectedName: '',
        statusText: this._provisionSucceeded ? '配网成功，设备已切换到 WiFi' : '连接已断开',
      });
      this._rejectAllWaiters('连接断开');
    }
  },

  // ---- notify 接收 -------------------------------------------------------
  // 固件每次 sendLine() 通过一次 notify 发送一整行，且不带换行符。因此每个
  // 回调即一行。仍保留对换行的兼容拆分，以防未来固件改为带换行的合并发送。
  _onCharChange(res) {
    if (normUuid(res.characteristicId) !== TX_UUID) return;
    const chunk = ab2str(res.value);
    if (/[\r\n]/.test(chunk)) {
      chunk.split(/[\r\n]+/).forEach((line) => {
        const t = line.trim();
        if (t) this._handleLine(t);
      });
    } else {
      const t = chunk.trim();
      if (t) this._handleLine(t);
    }
  },

  _handleLine(line) {
    // 写入日志。
    const log = this.data.log.slice(-40);
    log.push(line);
    this.setData({ log });

    // 解析 KEY=VALUE 填表单。
    const eq = line.indexOf('=');
    if (eq > 0 && !/^(OK|ERR)/.test(line)) {
      const key = line.slice(0, eq).trim().toUpperCase();
      const val = line.slice(eq + 1);
      if (key === 'WIFI_STATE') {
        this._handleWifiState(val);
        return;
      }
      // WiFi 扫描结果：WIFI=<ssid>,<rssi>（SSID 可能含逗号，rssi 取最后一个逗号之后）
      if (key === 'WIFI' && this._scanResults) {
        const c = val.lastIndexOf(',');
        const ssid = c >= 0 ? val.slice(0, c) : val;
        const rssi = c >= 0 ? parseInt(val.slice(c + 1), 10) : 0;
        if (ssid) this._scanResults.push({ ssid, rssi: isNaN(rssi) ? 0 : rssi });
        return;
      }
      const f = {};
      if (key === 'WIFI_SSID') f['form.wifi_ssid'] = val;
      else if (key === 'SERVER_HOST') f['form.server_host'] = val;
      else if (key === 'SERVER_PORT') f['form.server_port'] = val;
      else if (key === 'CHANNEL') f['form.channel'] = val;
      else if (key === 'CALLSIGN') f['form.callsign'] = val;
      else if (key === 'CALL_SSID') f['form.call_ssid'] = val;
      if (Object.keys(f).length) this.setData(f);
    }

    // 完成信号：OK xxx / ERR xxx 触发等待中的命令回调。
    if (/^(OK|ERR)\b/.test(line)) {
      const w = this._waiters.shift();
      if (w) {
        clearTimeout(w.timer);
        if (line.indexOf('OK') === 0) w.resolve(line);
        else w.reject(new Error(line));
      }
    }
  },

  // ---- 写命令（分片 ≤20 字节 + \n），等待 OK/ERR ------------------------
  // 关键：必须在写之前注册等待者，否则设备回复极快时，notify 可能在“写完成”
  // 与“注册等待者”之间到达，导致回复被丢弃、等待者永远超时。
  _sendCommand(cmd, { expectReply = true, timeout = 5000 } = {}) {
    return new Promise((resolve, reject) => {
      if (!this._rxCharId) { reject(new Error('未连接')); return; }

      let waiter = null;
      if (expectReply) {
        const timer = setTimeout(() => {
          const i = this._waiters.indexOf(waiter);
          if (i !== -1) this._waiters.splice(i, 1);
          reject(new Error('设备无响应（超时）'));
        }, timeout);
        waiter = { resolve, reject, timer };
        this._waiters.push(waiter); // 先注册，再写
      }

      const bytes = strToBytes(cmd).concat([0x0a]); // 追加换行
      const writeChunks = async () => {
        for (let off = 0; off < bytes.length; off += 20) {
          const chunk = bytes.slice(off, off + 20);
          await this._wx('writeBLECharacteristicValue', {
            deviceId: this._deviceId,
            serviceId: this._serviceId,
            characteristicId: this._rxCharId,
            value: new Uint8Array(chunk).buffer,
          });
        }
      };

      writeChunks().then(() => {
        if (!expectReply) resolve('');
      }).catch((e) => {
        if (waiter) {
          const i = this._waiters.indexOf(waiter);
          if (i !== -1) this._waiters.splice(i, 1);
          clearTimeout(waiter.timer);
        }
        reject(e);
      });
    });
  },

  _rejectAllWaiters(reason) {
    while (this._waiters.length) {
      const w = this._waiters.shift();
      clearTimeout(w.timer);
      w.reject(new Error(reason));
    }
    if (this._wifiStateWaiter) {
      clearTimeout(this._wifiStateWaiter.timer);
      this._wifiStateWaiter.reject(new Error(reason));
      this._wifiStateWaiter = null;
    }
  },

  _handleWifiState(value) {
    const state = String(value || '');
    if (state.indexOf('CONNECTING') === 0) {
      this.setData({ statusText: '配置已保存，正在连接 WiFi…' });
      return;
    }
    const waiter = this._wifiStateWaiter;
    if (!waiter) return;
    clearTimeout(waiter.timer);
    this._wifiStateWaiter = null;
    if (state.indexOf('GOT_IP') === 0) {
      this._provisionSucceeded = true;
      waiter.resolve(state);
    }
    else waiter.reject(new Error(state.indexOf('FAILED') === 0 ? 'WiFi 连接失败，请检查密码和信号' : state));
  },

  _waitForWifiResult(timeout = 65000) {
    if (this._wifiStateWaiter) {
      clearTimeout(this._wifiStateWaiter.timer);
      this._wifiStateWaiter.reject(new Error('新的配网操作已开始'));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this._wifiStateWaiter && this._wifiStateWaiter.timer === timer) {
          this._wifiStateWaiter = null;
        }
        reject(new Error('等待设备连接 WiFi 超时'));
      }, timeout);
      this._wifiStateWaiter = { resolve, reject, timer };
    });
  },

  // ---- 业务动作 ----------------------------------------------------------
  async loadConfig() {
    if (this.data.busy) return;
    this.setData({ busy: true, statusText: '读取配置中…' });
    try {
      await this._sendCommand('GET', { timeout: 5000 });
      this.setData({ statusText: '已读取当前配置' });
    } catch (e) {
      this.setData({ statusText: '读取失败：' + e.message });
      wx.showToast({ title: '读取失败', icon: 'none' });
    } finally {
      this.setData({ busy: false });
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['form.' + field]: e.detail.value });
  },

  // 向设备请求 WiFi 列表：cmd='LIST' 读设备已缓存的扫描结果（秒回），
  // cmd='SCAN' 触发设备重新扫描（约 1.5-2s）。两者都回传 WIFI=ssid,rssi。
  async _requestWifi(cmd, timeout) {
    if (!this._rxCharId) return -1;
    this._scanResults = [];
    try {
      await this._sendCommand(cmd, { timeout });
      const total = this._mergeWifi(this._scanResults);
      return total;
    } finally {
      this._scanResults = null;
    }
  },

  // 连接后自动读取设备已有的 WiFi 列表（进入 AP 配网时已扫描过一份）。
  async loadWifiList() {
    if (!this._rxCharId) return;
    try {
      await this._requestWifi('LIST', 4000);
    } catch (e) {
      // 旧固件不支持 LIST 会返回 ERR/超时，忽略即可，用户可手动扫描。
    }
  },

  // 重新扫描：让设备重新扫描周边 WiFi。
  async scanWifi() {
    if (this.data.busy || this.data.scanningWifi) return;
    if (!this._rxCharId) { wx.showToast({ title: '请先连接设备', icon: 'none' }); return; }
    this.setData({ scanningWifi: true, statusText: '设备扫描 WiFi 中…' });
    try {
      const total = await this._requestWifi('SCAN', 10000);
      this.setData({ statusText: total > 0 ? ('共 ' + total + ' 个网络') : '未扫描到 WiFi' });
      if (total === 0) wx.showToast({ title: '设备未扫描到 WiFi', icon: 'none' });
    } catch (e) {
      this.setData({ statusText: '扫描失败：' + e.message });
      wx.showToast({ title: '扫描失败', icon: 'none' });
    } finally {
      this.setData({ scanningWifi: false });
    }
  },

  // 从扫描列表中选择一个 SSID 填入表单。
  selectWifi(e) {
    const ssid = e.currentTarget.dataset.ssid;
    if (ssid) this.setData({ 'form.wifi_ssid': ssid });
  },

  _validate() {
    const f = this.data.form;
    if (!f.wifi_ssid) return 'WiFi 名称不能为空';
    if (f.server_port && (!/^\d+$/.test(f.server_port) || +f.server_port < 1 || +f.server_port > 65535))
      return '服务器端口需为 1-65535';
    if (f.channel && (!/^\d+$/.test(f.channel) || +f.channel > 7)) return '信道需为 0-7';
    if (f.call_ssid && (!/^\d+$/.test(f.call_ssid) || +f.call_ssid > 255)) return '呼号 SSID 需为 0-255';
    return '';
  },

  // 新固件用 BEGIN/APPLY 原子提交 WiFi；BEGIN 不支持时回退旧协议。
  async _saveConfig(reboot) {
    const err = this._validate();
    if (err) { wx.showToast({ title: err, icon: 'none' }); return; }
    if (this.data.busy) return;
    this.setData({ busy: true, statusText: '保存中…' });
    this._provisionSucceeded = false;

    const f = this.data.form;
    const otherCmds = [
      ['SERVER_HOST', f.server_host],
      ['SERVER_PORT', f.server_port],
      ['CHANNEL', f.channel],
      ['CALLSIGN', f.callsign],
      ['CALL_SSID', f.call_ssid],
    ];
    try {
      let transactional = true;
      try {
        await this._sendCommand('BEGIN', { timeout: 4000 });
      } catch (e) {
        transactional = false;
      }

      const wifiCmds = [['WIFI_SSID', f.wifi_ssid]];
      // 必须先发 SSID 再发密码。相同 SSID 留空表示保留密码；新 SSID
      // 留空则按开放网络处理。
      if (f.wifi_pass) wifiCmds.push(['WIFI_PASS', f.wifi_pass]);
      const cmds = wifiCmds.concat(otherCmds);
      for (const [k, v] of cmds) {
        if (v === '' || v === undefined || v === null) continue;
        await this._sendCommand('SET ' + k + '=' + v, { timeout: 6000 });
      }

      if (transactional) {
        const wifiResult = this._waitForWifiResult();
        try {
          await this._sendCommand('APPLY', { timeout: 6000 });
        } catch (applyError) {
          if (this._wifiStateWaiter) {
            clearTimeout(this._wifiStateWaiter.timer);
            this._wifiStateWaiter.reject(applyError);
            this._wifiStateWaiter = null;
          }
          await wifiResult.catch(() => {});
          throw applyError;
        }
        this.setData({ statusText: '配置已保存，正在连接 WiFi…' });
        const state = await wifiResult;
        const comma = state.indexOf(',');
        const ip = comma >= 0 ? state.slice(comma + 1) : '';
        this.setData({ statusText: ip ? `配网成功，设备 IP：${ip}` : '配网成功' });
        wx.showToast({ title: 'WiFi 连接成功', icon: 'success' });
      }
      if (reboot && !transactional) {
        await this._sendCommand('REBOOT', { expectReply: true, timeout: 3000 }).catch(() => {});
        this.setData({ statusText: '已保存，设备正在重启' });
        wx.showToast({ title: '已保存并重启', icon: 'success' });
      } else if (!transactional) {
        this.setData({ statusText: '配置已保存' });
        wx.showToast({ title: '保存成功', icon: 'success' });
      }
    } catch (e) {
      this.setData({ statusText: '保存失败：' + e.message });
      wx.showModal({ title: '保存失败', content: e.message, showCancel: false });
    } finally {
      this.setData({ busy: false });
    }
  },

  saveConfig() { this._saveConfig(false); },
  saveAndReboot() { this._saveConfig(true); },

  async disconnect() {
    await this._teardown();
    this.setData({ phase: 'idle', connectedName: '', statusText: '已断开', log: [] });
  },

  // ---- 清理 --------------------------------------------------------------
  async _teardown() {
    if (this._scanTimer) { clearTimeout(this._scanTimer); this._scanTimer = null; }
    this._rejectAllWaiters('断开');
    try { wx.offBLECharacteristicValueChange(this._onCharChange); } catch (e) {}
    try { wx.offBLEConnectionStateChange(this._onConnState); } catch (e) {}
    if (this._deviceId) {
      try { await this._wx('closeBLEConnection', { deviceId: this._deviceId }); } catch (e) {}
    }
    try { await this._wx('stopBluetoothDevicesDiscovery'); } catch (e) {}
    try { await this._wx('closeBluetoothAdapter'); } catch (e) {}
    this._deviceId = '';
    this._rxCharId = '';
    this._txCharId = '';
    this._serviceId = '';
    this._rxBuffer = '';
  },

  // Promise 包装 wx.xxx。
  _wx(method, options = {}) {
    return new Promise((resolve, reject) => {
      wx[method](Object.assign({}, options, { success: resolve, fail: reject }));
    });
  },

  // 合并若干 { ssid, rssi } 进 wifiList：按 ssid 去重（保留信号更强者），
  // 按 rssi 降序，重算显示用 label。
  _mergeWifi(items) {
    const map = {};
    (this.data.wifiList || []).forEach((w) => { map[w.ssid] = w.rssi; });
    (items || []).forEach((w) => {
      if (!w.ssid) return;
      if (map[w.ssid] === undefined || w.rssi > map[w.ssid]) map[w.ssid] = w.rssi;
    });
    const list = Object.keys(map)
      .map((ssid) => ({ ssid, rssi: map[ssid], label: map[ssid] + ' dBm' }))
      .sort((a, b) => b.rssi - a.rssi);
    this.setData({ wifiList: list });
    return list.length;
  },
});
