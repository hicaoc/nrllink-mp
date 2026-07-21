// 局域网 NRL 设备管理页：通过设备内置 web portal 的 HTTP API 管理
// NRL 基本参数 / WiFi / APRS / 信令 / OTA。
// 读取：GET 各 portal 页面解析 HTML 表单回填（utils/nrlPortalParser）；
// 写入：POST /save_*，设备返回 {"ok":bool,"fields":{...}}。
const lan = require('../../utils/nrlLan');
const { parseFormValues } = require('../../utils/nrlPortalParser');

// switch 类字段：保存时始终发送 xxx_present=1，仅开启时发送 xxx=1
const APRS_SWITCHES = ['aprs_enabled', 'aprs_net', 'aprs_tx', 'aprs_rx', 'aprs_auto'];
// name 与 present 名的对应关系（固件表单里的命名不完全规则）
const SWITCH_PRESENT_NAME = {
  aprs_enabled: 'aprs_present',
  aprs_net: 'aprs_net_present',
  aprs_tx: 'aprs_tx_present',
  aprs_rx: 'aprs_rx_present',
  aprs_auto: 'aprs_auto_present',
  ctcss_rx_mic: 'ctcss_rx_mic_present',
  ctcss_rx_nrl: 'ctcss_rx_nrl_present',
  mdc_rx_mic: 'mdc_rx_mic_present',
  mdc_rx_nrl: 'mdc_rx_nrl_present',
  mdc_tx_nrl: 'mdc_tx_nrl_present',
  mdc_tx_speaker: 'mdc_tx_speaker_present',
  dtmf_rx_mic: 'dtmf_rx_mic_present',
  dtmf_rx_nrl: 'dtmf_rx_nrl_present',
  dtmf_tx_nrl: 'dtmf_tx_nrl_present',
  dtmf_tx_speaker: 'dtmf_tx_speaker_present',
};
const SIGNALING_SWITCHES = [
  'ctcss_rx_mic', 'ctcss_rx_nrl',
  'mdc_rx_mic', 'mdc_rx_nrl', 'mdc_tx_nrl', 'mdc_tx_speaker',
  'dtmf_rx_mic', 'dtmf_rx_nrl', 'dtmf_tx_nrl', 'dtmf_tx_speaker',
];

function truthy(v) {
  return v !== '' && v !== '0' && v !== null && v !== undefined;
}

Page({
  data: {
    device: {},
    section: 'nrl',
    loadError: '',
    saving: false,
    codecOptions: ['G.711 8 kHz（兼容）', 'Opus 16 kHz 宽带'],
    nrl: {
      server_host: '', server_port: '', channel: '', callsign: '',
      callsign_ssid: '', ptt_timeout: '', voice_payload_bytes: '',
      tail_suppress_ms: '', voice_codec: 0,
    },
    wifi: {
      wifi_ssid: '', wifi_password: '', wifi_dhcp_enabled: true,
      wifi_ip: '', wifi_mask: '', wifi_gateway: '', wifi_dns: '',
    },
    scanningWifi: false,
    wifiScanList: [],
    aprs: {
      aprs_enabled: false, aprs_net: false, aprs_tx: false, aprs_rx: false, aprs_auto: false,
      aprs_server: '', aprs_port: '', aprs_ssid: '', aprs_symbol: '',
      aprs_interval: '', aprs_path: '', aprs_lat: '', aprs_lon: '', aprs_comment: '',
    },
    signaling: {
      ctcss_rx_mic: false, ctcss_rx_nrl: false,
      mdc_rx_mic: false, mdc_rx_nrl: false, mdc_tx_nrl: false, mdc_tx_speaker: false,
      dtmf_rx_mic: false, dtmf_rx_nrl: false, dtmf_tx_nrl: false, dtmf_tx_speaker: false,
      mdc_opcode: '', mdc_argument: '', mdc_unit_id: '', dtmf_digits: '',
    },
    ota: null,
    otaChecking: false,
  },

  onLoad(options) {
    let device = {};
    try {
      device = JSON.parse(decodeURIComponent(options.device || '{}'));
    } catch (e) {
      device = {};
    }
    if (!device.ip) {
      wx.showToast({ title: '缺少设备地址', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({ device });
    wx.setNavigationBarTitle({ title: device.name || '设备管理' });
    this.loadAll();
  },

  onUnload() {
    this.stopOtaPoll();
  },

  get ip() {
    return this.data.device.ip;
  },

  // 串行加载各区块（设备 httpd 连接槽有限）
  async loadAll() {
    const errors = [];
    try {
      await this.loadMain();
    } catch (e) {
      errors.push('基本参数');
    }
    try {
      await this.loadAprs();
    } catch (e) {
      errors.push('APRS');
    }
    try {
      await this.loadSignaling();
    } catch (e) {
      errors.push('信令');
    }
    try {
      await this.loadOta();
    } catch (e) {
      errors.push('OTA');
    }
    this.setData({
      loadError: errors.length ? `部分内容加载失败：${errors.join('、')}，请确认设备在线后重新进入` : '',
    });
  },

  // GET / 解析 NRL + WiFi 表单
  async loadMain() {
    const res = await lan.get(this.ip, '/');
    const v = parseFormValues(res.data);
    const codec = v.voice_codec === '1' ? 1 : 0;
    this.setData({
      nrl: {
        server_host: v.server_host || '',
        server_port: v.server_port || '',
        channel: v.channel || '',
        callsign: v.callsign || '',
        callsign_ssid: v.callsign_ssid || '',
        ptt_timeout: v.ptt_timeout || '',
        voice_payload_bytes: v.voice_payload_bytes || '',
        tail_suppress_ms: v.tail_suppress_ms || '',
        voice_codec: codec,
      },
      wifi: {
        wifi_ssid: v.wifi_ssid || '',
        wifi_password: v.wifi_password || '',
        wifi_dhcp_enabled: truthy(v.wifi_dhcp_enabled),
        wifi_ip: v.wifi_ip || '',
        wifi_mask: v.wifi_mask || '',
        wifi_gateway: v.wifi_gateway || '',
        wifi_dns: v.wifi_dns || '',
      },
    });
  },

  async loadAprs() {
    const res = await lan.get(this.ip, '/aprs');
    const v = parseFormValues(res.data);
    const aprs = {};
    APRS_SWITCHES.forEach((k) => { aprs[k] = truthy(v[k]); });
    ['aprs_server', 'aprs_port', 'aprs_ssid', 'aprs_symbol', 'aprs_interval',
      'aprs_path', 'aprs_lat', 'aprs_lon', 'aprs_comment'].forEach((k) => {
      aprs[k] = v[k] || '';
    });
    this.setData({ aprs });
  },

  async loadSignaling() {
    const res = await lan.get(this.ip, '/signaling');
    const v = parseFormValues(res.data);
    const signaling = {};
    SIGNALING_SWITCHES.forEach((k) => { signaling[k] = truthy(v[k]); });
    ['mdc_opcode', 'mdc_argument', 'mdc_unit_id', 'dtmf_digits'].forEach((k) => {
      signaling[k] = v[k] || '';
    });
    this.setData({ signaling });
  },

  async loadOta() {
    const res = await lan.get(this.ip, '/ota/status');
    if (res.statusCode === 200 && res.data) {
      this.setData({ ota: Object.assign({ releases: [] }, res.data) });
    }
  },

  toggleSection(e) {
    const s = e.currentTarget.dataset.section;
    this.setData({ section: this.data.section === s ? '' : s });
  },

  onInput(e) {
    const { section, field } = e.currentTarget.dataset;
    this.setData({ [`${section}.${field}`]: e.detail.value });
  },

  onSwitch(e) {
    const { section, field } = e.currentTarget.dataset;
    this.setData({ [`${section}.${field}`]: e.detail.value });
  },

  onCodecChange(e) {
    this.setData({ 'nrl.voice_codec': Number(e.detail.value) });
  },

  // ---- WiFi 扫描 ----
  async scanWifi() {
    this.setData({ scanningWifi: true });
    try {
      const res = await lan.get(this.ip, '/scan', 8000);
      const list = Array.isArray(res.data) ? res.data : [];
      this.setData({ wifiScanList: list });
      if (!list.length) {
        wx.showToast({ title: '未发现热点，或设备刚启动尚无扫描缓存', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '扫描失败', icon: 'none' });
    }
    this.setData({ scanningWifi: false });
  },

  selectWifi(e) {
    this.setData({ 'wifi.wifi_ssid': e.currentTarget.dataset.ssid });
  },

  // ---- 保存 ----
  async doSave(path, fields, okText) {
    this.setData({ saving: true });
    let result;
    try {
      const res = await lan.postForm(this.ip, path, fields);
      result = lan.checkSaveResponse(res);
    } catch (e) {
      result = { ok: false, error: '请求失败，设备可能已离线' };
    }
    this.setData({ saving: false });
    wx.showToast({
      title: result.ok ? (okText || '已保存') : (result.error || '保存失败'),
      icon: 'none',
    });
    return result.ok;
  },

  validateRange(name, value, min, max) {
    const n = Number(value);
    if (value === '' || !Number.isInteger(n) || n < min || n > max) {
      wx.showToast({ title: `${name}需在 ${min}-${max} 之间`, icon: 'none' });
      return false;
    }
    return true;
  },

  saveNrl() {
    const n = this.data.nrl;
    if (!n.server_host) {
      wx.showToast({ title: '请填写服务器地址', icon: 'none' });
      return;
    }
    if (!this.validateRange('服务器端口', n.server_port, 1, 65535)) return;
    if (!this.validateRange('信道', n.channel, 0, 7)) return;
    if (!this.validateRange('呼号 SSID', n.callsign_ssid, 0, 255)) return;
    if (!this.validateRange('PTT 超时', n.ptt_timeout, 5, 3600)) return;
    if (!this.validateRange('语音包大小', n.voice_payload_bytes, 160, 500)) return;
    if (!this.validateRange('尾音抑制', n.tail_suppress_ms, 0, 5000)) return;
    this.doSave('/save_nrl', {
      server_host: n.server_host,
      server_port: n.server_port,
      channel: n.channel,
      callsign: n.callsign,
      callsign_ssid: n.callsign_ssid,
      ptt_timeout: n.ptt_timeout,
      voice_payload_bytes: n.voice_payload_bytes,
      tail_suppress_ms: n.tail_suppress_ms,
      voice_codec: String(n.voice_codec),
    });
  },

  saveWifi() {
    const w = this.data.wifi;
    if (!w.wifi_ssid) {
      wx.showToast({ title: '请填写 WiFi 名称', icon: 'none' });
      return;
    }
    if (!w.wifi_dhcp_enabled && (!w.wifi_ip || !w.wifi_mask || !w.wifi_gateway)) {
      wx.showToast({ title: '静态 IP 需填写 IP/掩码/网关', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认修改 WiFi',
      content: '设备将立即重连网络，配置错误会导致设备脱网（可用蓝牙配网恢复）。确定保存？',
      confirmText: '保存',
      success: (res) => {
        if (!res.confirm) return;
        const fields = {
          wifi_ssid: w.wifi_ssid,
          wifi_password: w.wifi_password,
          wifi_dhcp_present: '1',
          wifi_ip: w.wifi_ip,
          wifi_mask: w.wifi_mask,
          wifi_gateway: w.wifi_gateway,
          wifi_dns: w.wifi_dns,
        };
        if (w.wifi_dhcp_enabled) fields.wifi_dhcp_enabled = '1';
        this.doSave('/save_wifi', fields, '已保存，设备正在重连');
      },
    });
  },

  saveAprs() {
    const a = this.data.aprs;
    if (a.aprs_interval && !this.validateRange('信标间隔', a.aprs_interval, 10, 3600)) return;
    if (a.aprs_ssid && !this.validateRange('APRS SSID', a.aprs_ssid, 0, 15)) return;
    const fields = {
      aprs_server: a.aprs_server,
      aprs_port: a.aprs_port,
      aprs_ssid: a.aprs_ssid,
      aprs_symbol: a.aprs_symbol,
      aprs_interval: a.aprs_interval,
      aprs_path: a.aprs_path,
      aprs_lat: a.aprs_lat,
      aprs_lon: a.aprs_lon,
      aprs_comment: a.aprs_comment,
    };
    APRS_SWITCHES.forEach((k) => {
      fields[SWITCH_PRESENT_NAME[k]] = '1';
      if (a[k]) fields[k] = '1';
    });
    this.doSave('/save_aprs', fields);
  },

  saveSignaling() {
    const s = this.data.signaling;
    const fields = {
      mdc_opcode: s.mdc_opcode,
      mdc_argument: s.mdc_argument,
      mdc_unit_id: s.mdc_unit_id,
      dtmf_digits: s.dtmf_digits,
    };
    SIGNALING_SWITCHES.forEach((k) => {
      fields[SWITCH_PRESENT_NAME[k]] = '1';
      if (s[k]) fields[k] = '1';
    });
    this.doSave('/save_signaling', fields);
  },

  // ---- OTA ----
  async checkOta() {
    this.setData({ otaChecking: true });
    try {
      const res = await lan.postForm(this.ip, '/ota/check', {});
      if ((res.statusCode === 200 || res.statusCode === 202) && res.data && res.data.ok) {
        wx.showToast({ title: '已开始检查，稍候刷新', icon: 'none' });
        // 设备后台检查，轮询几次状态
        for (let i = 0; i < 6; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          await this.loadOta();
          if (this.data.ota && !this.data.ota.checking) break;
        }
        const ota = this.data.ota;
        if (ota && ota.latest_version) {
          wx.showToast({ title: `发现版本 ${ota.latest_version}`, icon: 'none' });
        } else if (ota && ota.last_error) {
          wx.showToast({ title: ota.last_error, icon: 'none' });
        }
      } else {
        wx.showToast({ title: (res.data && res.data.error) || '检查失败', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '请求失败', icon: 'none' });
    }
    this.setData({ otaChecking: false });
  },

  installVersion(e) {
    const version = e.currentTarget.dataset.version;
    wx.showModal({
      title: '确认升级',
      content: `将设备固件升级到 ${version}？升级过程中请勿断电，设备会自动重启。`,
      confirmText: '升级',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const r = await lan.postForm(this.ip, '/ota/install', { version });
          if ((r.statusCode === 200 || r.statusCode === 202) && r.data && r.data.ok) {
            wx.showToast({ title: '开始升级', icon: 'none' });
            this.startOtaPoll();
          } else {
            wx.showToast({ title: (r.data && r.data.error) || '升级失败', icon: 'none' });
          }
        } catch (err) {
          wx.showToast({ title: '请求失败', icon: 'none' });
        }
      },
    });
  },

  startOtaPoll() {
    this.stopOtaPoll();
    this._otaTimer = setInterval(async () => {
      try {
        await this.loadOta();
        const ota = this.data.ota;
        if (ota && !ota.updating) {
          this.stopOtaPoll();
          if (ota.last_error) {
            wx.showToast({ title: `升级失败：${ota.last_error}`, icon: 'none' });
          }
          // 成功的话设备会重启，连接断开属正常
        }
      } catch (e) {
        // 升级成功重启时请求会失败，提示后停止轮询
        this.stopOtaPoll();
        wx.showModal({
          title: '连接中断',
          content: '设备可能正在重启应用新固件，请稍后重新扫描连接。',
          showCancel: false,
        });
      }
    }, 2000);
  },

  stopOtaPoll() {
    if (this._otaTimer) {
      clearInterval(this._otaTimer);
      this._otaTimer = null;
    }
  },
});
