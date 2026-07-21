// 「我的」设备列表 tab：当前账号（呼号）下的所有设备，box 卡片展示
// 在线状态 / 型号 / 内网 IP / WiFi SSID / 固件版本。
// 点击卡片：ESP32 → AT 远程管理页；老型号 → device-settings（EEPROM 参数）；
// 软终端 → 提示不支持。
import { DevModelOptions } from '../../utils/constants.js';
import { manageKind } from '../../utils/atCatalog.js';

const api = require('../../utils/api');

function modelName(id) {
  const m = DevModelOptions.find((x) => x.id === Number(id));
  return m ? m.name : `型号 ${id}`;
}

Page({
  data: {
    devices: [],
    loaded: false,
    groups: [],
    showGroupPicker: false,
    currentGroupId: 0,
  },

  onShow() {
    this.loadDevices();
  },

  onPullDownRefresh() {
    this.loadDevices().then(() => wx.stopPullDownRefresh());
  },

  async loadDevices() {
    // 先拿群组列表（用于显示每台设备的当前群组）
    let groups = this.data.groups;
    try {
      const g = await getApp().globalData.getGroupList();
      groups = Array.isArray(g) ? g : [];
    } catch (e) {
      groups = [];
    }
    this._groupMap = {};
    groups.forEach((g) => { this._groupMap[g.id] = g.name; });

    try {
      const res = await api.getMyDevices();
      // 服务器返回的 items 是 map：{ "CALLSIGN-SSID": deviceInfo }
      // 注意：code 20001 时请求封装会返回 undefined，此时保留旧列表，不清空
      if (!res || !res.items) {
        console.warn('loadDevices: 接口未返回设备列表', res);
        this.setData({ loaded: true, groups });
        return;
      }
      const items = res.items;
      console.log('loadDevices: 服务器返回设备数量', Object.keys(items).length);
      // 单台设备数据异常不应拖垮整个列表
      const list = [];
      Object.keys(items).forEach((k) => {
        try {
          list.push(this.decorate(items[k]));
        } catch (e) {
          console.error('loadDevices: 设备数据解析失败', k, e);
        }
      });
      // 在线的排前面
      list.sort((a, b) => (b.is_online ? 1 : 0) - (a.is_online ? 1 : 0));
      this.setData({ devices: list, loaded: true, groups });
    } catch (e) {
      console.error('loadDevices: 获取设备列表失败', e);
      this.setData({ loaded: true, groups });
    }
  },

  groupName(groupId) {
    if (!groupId) return '未加入';
    const name = this._groupMap && this._groupMap[groupId];
    return name ? `${groupId} - ${name}` : `#${groupId}`;
  },

  // 把 deviceInfo 加工成视图模型
  decorate(dev) {
    const at = dev.last_atcommand || null;
    const atmap = (at && at.atmap) || {};
    const parm = dev.device_parm || null;
    const kind = manageKind(dev.dev_model);
    const callsignSsid = dev.callsignssid || `${dev.callsign}-${dev.ssid}`;
    // 固件回复行带 AT+ 前缀，atmap 键形如 "AT+WIFI_IP"（兼容旧固件无前缀）
    const atval = (key) => (atmap[`AT+${key}`] !== undefined ? atmap[`AT+${key}`] : atmap[key]);
    return {
      callsign: dev.callsign,
      ssid: dev.ssid,
      callsignssid: callsignSsid,
      displayName: dev.name || callsignSsid,
      name: dev.name || '',
      is_online: !!dev.is_online,
      dev_model: dev.dev_model,
      modelName: modelName(dev.dev_model),
      lanIp: atval('WIFI_IP') || (parm && parm.local_ipaddr) || '未知',
      wifiSsid: atval('WIFI_SSID') || '未知',
      version: (at && at.version) || '',
      qth: dev.qth || '',
      group_id: dev.group_id,
      groupName: this.groupName(dev.group_id),
      kind,
      hasAT: !!dev.last_atcommand, // 设备数据里有 AT 回复 → 支持 AT 管理
      raw: dev,
      footHint: dev.last_atcommand ? '点击进入远程管理'
        : kind === 'at' ? '点击进入远程管理'
        : kind === 'at-legacy' ? 'AT + 寄存器配置'
        : '该设备类型不支持远程配置',
    };
  },

  openDevice(e) {
    const dev = this.data.devices[e.currentTarget.dataset.index];
    // 有 AT 数据的设备都支持 AT 管理（不限型号）；无 AT 数据时按型号判断
    if (dev.hasAT || dev.kind === 'at' || dev.kind === 'at-legacy') {
      const param = encodeURIComponent(JSON.stringify({
        callsign: dev.callsign,
        ssid: dev.ssid,
        name: dev.displayName,
        dev_model: dev.dev_model,
        is_online: dev.is_online,
      }));
      wx.navigateTo({ url: `/pages/my-device-at/my-device-at?device=${param}` });
      return;
    }
    wx.showToast({ title: '该设备类型不支持远程配置', icon: 'none' });
  },

  // ---- 加入群组 ----

  noop() {},

  openGroupPicker(e) {
    this._joinIndex = e.currentTarget.dataset.index;
    const dev = this.data.devices[this._joinIndex];
    const show = (groups) => this.setData({
      groups: groups || [],
      showGroupPicker: true,
      currentGroupId: Number((dev && dev.group_id) || 0),
    });
    if (this.data.groups.length) {
      show(this.data.groups);
      return;
    }
    getApp().globalData.getGroupList().then(show).catch(() => {
      wx.showToast({ title: '获取群组列表失败', icon: 'none' });
    });
  },

  closeGroupPicker() {
    this.setData({ showGroupPicker: false });
  },

  async joinGroup(e) {
    const groupId = e.currentTarget.dataset.id;
    const index = this._joinIndex;
    const dev = this.data.devices[index];
    this.setData({ showGroupPicker: false });
    if (!dev || !dev.raw) return;
    if (Number(dev.group_id) === Number(groupId)) return; // 已在该群组
    wx.showLoading({ title: '正在切换…', mask: true });
    try {
      // 只发服务器更新所需的字段（见 nrllink deviceDB.go updateDevice 的 SQL）。
      // 不要把整个设备对象发回去 —— 里面的 last_atcommand/device_parm/时间
      // 等运行时字段可能导致服务器解析失败（20001 数据格式错误）。
      const r = dev.raw;
      const res = await api.updateDevice({
        id: r.id,
        callsign: r.callsign,
        ssid: r.ssid,
        name: r.name,
        gird: r.gird,
        dmrid: r.dmrid,
        dev_type: r.dev_type,
        dev_model: r.dev_model,
        group_id: groupId,
        status: r.status,
        priority: r.priority,
        chan_name: r.chan_name,
        rf_type: r.rf_type,
        note: r.note,
        password: r.password,
      });
      wx.hideLoading();
      // code 20001 时请求封装返回 undefined（服务器拒绝，如群组不允许加入）
      if (res === undefined) {
        wx.showToast({ title: '切换失败，群组可能不允许加入', icon: 'none' });
      } else {
        wx.showToast({ title: '已切换群组', icon: 'success' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('joinGroup: 切换群组失败', err);
      wx.showToast({ title: '切换失败', icon: 'none' });
    }
    // 无论成败，回到我的设备页最新状态
    this.loadDevices();
  },
});
