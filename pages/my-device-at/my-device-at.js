// 单设备 AT 远程管理页：通过服务器 /device/at 中继 AT 指令到设备。
// 服务器发送后固定等 200ms 返回，AT 回复可能还没回来（异步 UDP），
// 所以执行后要用 /device/get 轮询等 last_atcommand 刷新。
import { getCatalog, getCatalogForDevice, manageKind } from '../../utils/atCatalog.js';

const api = require('../../utils/api');

const POLL_TIMES = 4;
const POLL_INTERVAL = 600;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// /device/get 直接返回 deviceInfo，/device/at 与 /device/query 返回 {items: deviceInfo}
function unwrapDevice(res) {
  if (!res) return null;
  if (res.items) return res.items;
  return res.callsign ? res : null;
}

// 把设备回复的原始值按控件类型归一化
function normalizeValue(cmd, raw) {
  if (raw === undefined || raw === null) return undefined;
  const s = String(raw);
  if (cmd.type === 'switch') {
    return /^(ON|1|TRUE|ENABLE)/i.test(s.trim());
  }
  return s;
}

Page({
  data: {
    device: {},
    categories: [],
    expanded: 'link',
    values: {},   // { KEY: 归一化当前值 }
    inputs: {},   // { KEY: 输入框草稿 }
    pending: {},  // { KEY: true } 执行中
    log: [],      // { kind: 'tx'|'rx'|'err', text }
    atSupported: null,
    showEeprom: false, // 老型号设备显示寄存器配置入口
  },

  onLoad(options) {
    let device = {};
    try {
      device = JSON.parse(decodeURIComponent(options.device || '{}'));
    } catch (e) {
      device = {};
    }
    if (!device.callsign) {
      wx.showToast({ title: '缺少设备信息', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this._catalog = getCatalog(device.dev_model) || [];
    this._atmap = {}; // 设备上报的指令全集（决定显示哪些命令）
    this.setData({
      device,
      categories: [], // 按设备上报的指令列表动态构建，见 rebuildCategories
      // 老型号（dev_model < 100）：同时提供寄存器（EEPROM）配置入口
      showEeprom: manageKind(device.dev_model) === 'at-legacy',
    });
    wx.setNavigationBarTitle({ title: device.name || '远程管理' });
    this.initDevice();
  },

  // 进页：取设备最新状态（顺便拿上次 AT 回复回填），在线则发 AT+READ 全量查询
  async initDevice() {
    let dev = null;
    try {
      const res = await api.getDevice({ callsign: this.data.device.callsign, ssid: this.data.device.ssid }, true);
      dev = unwrapDevice(res);
    } catch (e) {
      // 离线等情况忽略，用列表页带来的信息
    }
    if (dev) {
      this._lastAt = dev.last_atcommand || null;
      this.setData({
        'device.is_online': !!dev.is_online,
        'device.version': (dev.last_atcommand && dev.last_atcommand.version) || '',
      });
      this.applyAtmap((dev.last_atcommand && dev.last_atcommand.atmap) || {});
      if (dev.last_atcommand) {
        this.setData({ atSupported: true });
      }
    }
    if (this.data.device.is_online) {
      // AT+READ：固件对未知指令返回全量配置 dump（服务器首次上线也这么干）
      this.exec('READ', '1', { silentLog: true, suppressUnknownErr: true });
    } else if (!this._lastAt) {
      this.setData({ atSupported: false });
    }
  },

  // ---- 指令执行 ----

  // 发送一条 AT 指令并等回显。opts.silentLog 不记日志；opts.suppressUnknownErr 忽略 ERR=UNKNOWN。
  async exec(key, data, opts = {}) {
    if (!this.data.device.is_online) {
      wx.showToast({ title: '设备离线，无法发送', icon: 'none' });
      return false;
    }
    this.setData({ [`pending.${key}`]: true });
    if (!opts.silentLog) this.appendLog('tx', `AT+${key}=${data}`);

    const prevAt = this._lastAt ? JSON.stringify(this._lastAt) : '';
    let fresh = null;
    try {
      const res = await api.deviceAT({
        callsign: this.data.device.callsign,
        ssid: this.data.device.ssid,
        type: (data === '?' || key === 'READ') ? 1 : 2, // 1=查询 2=写入（与 web 端一致）
        atcommand: `AT+${key}`,
        data: String(data),
      }, true);
      const dev = unwrapDevice(res);
      const at = dev && dev.last_atcommand;
      if (at && JSON.stringify(at) !== prevAt) fresh = at;
    } catch (e) {
      // 继续走轮询
    }

    // 回复是异步的，轮询等刷新
    for (let i = 0; i < POLL_TIMES && !fresh; i++) {
      await sleep(POLL_INTERVAL);
      try {
        const res = await api.getDevice({
          callsign: this.data.device.callsign,
          ssid: this.data.device.ssid,
        }, true);
        const dev = unwrapDevice(res);
        if (!dev) continue;
        if (dev.is_online === false) {
          this.setData({ 'device.is_online': false });
          break;
        }
        const at = dev.last_atcommand;
        if (at && JSON.stringify(at) !== prevAt) {
          fresh = at;
        }
      } catch (e) {
        // 忽略单次失败
      }
    }

    this.setData({ [`pending.${key}`]: false });

    if (!fresh) {
      if (!opts.silentLog) this.appendLog('err', '等待设备回复超时');
      return false;
    }

    this._lastAt = fresh;
    this.setData({ atSupported: true });
    if (fresh.version) this.setData({ 'device.version': fresh.version });
    this.applyAtmap(fresh.atmap || {}, opts);
    return true;
  },

  // atmap 里是否有某个命令（固件回复行带 AT+ 前缀，两种键都查）
  atmapHas(key) {
    return this._atmap[`AT+${key}`] !== undefined || this._atmap[key] !== undefined;
  },

  // 按设备上报的指令列表动态构建可见分类：
  // - 目录里有、设备也上报了的命令 → 显示在对应分类（其余视为设备不支持，隐藏）
  // - 设备上报了、但目录不认识的命令 → 归入「其他指令」，照常显示和执行
  //   （可能是设备新增指令，小程序还没更新）
  rebuildCategories() {
    // 按设备上报内容识别指令目录（ESP32 特征键 → ESP32 目录，否则老指令集）
    this._catalog = getCatalogForDevice(this.data.device.dev_model, this._atmap) || [];
    const knownKeys = {};
    this._catalog.forEach((cat) => cat.commands.forEach((cmd) => { knownKeys[cmd.key] = true; }));

    const visible = [];
    this._catalog.forEach((cat) => {
      const cmds = cat.commands.filter((cmd) => this.atmapHas(cmd.key));
      if (cmds.length) visible.push(Object.assign({}, cat, { commands: cmds }));
    });

    const unknown = Object.keys(this._atmap)
      .filter((k) => k !== 'AT+ERR' && k !== 'ERR')
      .map((k) => k.replace(/^AT\+/, ''))
      .filter((k, i, arr) => k && !knownKeys[k] && arr.indexOf(k) === i)
      .map((k) => ({
        key: k,
        label: `AT+${k}`, // 未识别指令显示完整指令名
        desc: '设备上报的指令，小程序暂未内置说明',
        type: 'text',
        write: true,
      }));
    if (unknown.length) {
      visible.push({
        id: 'unknown',
        name: '未知指令',
        hint: '设备支持但小程序还不认识的指令，可直接查询和修改',
        commands: unknown,
      });
    }
    this.setData({ categories: visible });
  },

  // 把 atmap 的键值回填到目录命令的当前值。
  // 注意：固件回复行带 AT+ 前缀，服务器按原样存键 → atmap 键是 "AT+CH" 形式
  // （兼容个别不带前缀的旧固件，两种键都查）。
  applyAtmap(atmap, opts = {}) {
    // 合并进设备已上报指令全集，并重建可见分类
    this._atmap = Object.assign({}, this._atmap, atmap);
    this.rebuildCategories();

    const updates = {};
    const rxLines = [];
    this.data.categories.forEach((cat) => {
      cat.commands.forEach((cmd) => {
        const raw = atmap[`AT+${cmd.key}`] !== undefined ? atmap[`AT+${cmd.key}`] : atmap[cmd.key];
        if (raw === undefined) return;
        const v = normalizeValue(cmd, raw);
        if (v === undefined) return;
        updates[`values.${cmd.key}`] = v;
        rxLines.push(`${cmd.key}=${raw}`);
      });
    });
    // 回复里的错误
    const err = atmap['AT+ERR'] !== undefined ? atmap['AT+ERR'] : atmap.ERR;
    if (err && !(opts.suppressUnknownErr && err === 'UNKNOWN')) {
      this.appendLog('err', `AT+ERR=${err}`);
      wx.showToast({ title: `设备返回错误：${err}`, icon: 'none' });
    } else if (!opts.silentLog) {
      rxLines.forEach((line) => this.appendLog('rx', line));
    }
    if (Object.keys(updates).length) this.setData(updates);
  },

  // ---- 交互 ----

  toggleCategory(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ expanded: this.data.expanded === id ? '' : id });
  },

  // 顺序查询该分类下所有可查询命令
  async refreshCategory(e) {
    const id = e.currentTarget.dataset.id;
    const cat = this.data.categories.find((c) => c.id === id);
    if (!cat) return;
    for (const cmd of cat.commands) {
      if (cmd.type === 'action') continue;
      if (this.data.pending[cmd.key]) continue;
      await this.exec(cmd.key, '?', { silentLog: true });
    }
    wx.showToast({ title: '已刷新', icon: 'none' });
  },

  findCmd(key) {
    for (const cat of this.data.categories) {
      const cmd = cat.commands.find((c) => c.key === key);
      if (cmd) return cmd;
    }
    return null;
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [`inputs.${key}`]: e.detail.value });
  },

  onSave(e) {
    const key = e.currentTarget.dataset.key;
    const cmd = this.findCmd(key);
    if (!cmd) return;
    const draft = this.data.inputs[key];
    const value = draft !== undefined && draft !== '' ? draft : this.data.values[key];
    if (value === undefined || value === '') {
      wx.showToast({ title: '请输入值', icon: 'none' });
      return;
    }
    if (cmd.type === 'number') {
      const n = Number(value);
      if (!Number.isInteger(n) || n < cmd.min || n > cmd.max) {
        wx.showToast({ title: `需在 ${cmd.min}-${cmd.max} 之间`, icon: 'none' });
        return;
      }
    }
    this.exec(key, value).then((ok) => {
      if (ok) this.setData({ [`inputs.${key}`]: '' });
    });
  },

  onSwitch(e) {
    const key = e.currentTarget.dataset.key;
    const on = e.detail.value;
    this.exec(key, on ? 'ON' : 'OFF').then((ok) => {
      if (!ok) {
        // 失败回滚开关显示
        this.setData({ [`values.${key}`]: !on });
      }
    });
    // 乐观更新
    this.setData({ [`values.${key}`]: on });
  },

  onSelect(e) {
    const key = e.currentTarget.dataset.key;
    const cmd = this.findCmd(key);
    if (!cmd) return;
    const value = cmd.options[Number(e.detail.value)];
    this.exec(key, value);
  },

  onAction(e) {
    const key = e.currentTarget.dataset.key;
    const cmd = this.findCmd(key);
    if (!cmd) return;
    const run = () => this.exec(key, cmd.actionValue || '1');
    if (cmd.confirm) {
      wx.showModal({
        title: '确认操作',
        content: cmd.confirm,
        success: (res) => { if (res.confirm) run(); },
      });
    } else {
      run();
    }
  },

  appendLog(kind, text) {
    const log = this.data.log.concat({ kind, text });
    if (log.length > 100) log.splice(0, log.length - 100);
    this.setData({ log });
  },

  clearLog() {
    this.setData({ log: [] });
  },

  // ---- 寄存器（EEPROM）配置，老型号设备 ----

  // device-settings 页需要完整 deviceInfo（含 device_parm）；
  // device_parm 要等设备应答过参数查询才有，先触发一次 /device/query。
  async openEepromSettings() {
    const { callsign, ssid } = this.data.device;
    wx.showLoading({ title: '读取设备参数…' });
    try {
      const res = await api.queryDevice({ callsign, ssid });
      const raw = res && res.items;
      if (raw && raw.device_parm) {
        const param = encodeURIComponent(JSON.stringify(raw));
        wx.navigateTo({ url: `/pages/device-settings/device-settings?device=${param}` });
      } else {
        wx.showToast({ title: '设备参数未就绪，请确认设备在线后重试', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '读取失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },
});
