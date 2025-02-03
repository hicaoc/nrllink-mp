const api = require('../../utils/api');
import * as nrl21 from '../../utils/nrl21';

// 群组状态映射
const GROUP_STATUS = {
  0: '正常',
  1: '维护中', 
  2: '已关闭'
};

Page({
  data: {
    groups: [], // 群组列表
    devices: [], // 设备列表
    selectedGroup: null, // 当前选择的群组
    selectedDevice: null, // 当前选择的设备ID
    selectedDeviceIndex: null, // 当前选择的设备索引
    currentGroup: null, // 当前设备所在群组
    cpuid: null // 当前设备CPUID
  },

  onLoad() {
    const app = getApp();
    app.registerPage(this);

    const userInfo = app.globalData.userInfo || {};
    const cpuid = nrl21.cpuIdToHex(app.globalData.cpuId);

    if (!cpuid) {
      wx.showToast({
        title: '设备ID获取失败',
        icon: 'none'
      });
      return;
    }

    const callsign = userInfo.callsign || '未知';
    this.setData({
      cpuid: `${callsign}-100 (${cpuid})`,
      currentGroup: app.globalData.currentGroup?.name || null
    });

    this.refreshData();
  },

  async refreshData() {
    await this.getGroupList();
    await this.getDeviceList();
    this.getCurrentGroup();
  },

  // 获取当前设备所在群组
  getCurrentGroup() {
    const cpuid = nrl21.cpuIdToHex(getApp().globalData.cpuId);
    const { devices, groups } = this.data;

    const device = devices.find(d => d.cpuid === cpuid);
    if (!device) {
      this.setData({ currentGroup: null });
      return;
    }

    const group = groups.find(g => g.id === device.group_id);
    this.setData({
      currentGroup: group ? group.name : null
    });
  },

  // 获取群组列表
  async getGroupList() {
    try {
      const data = await api.getGroupList();
      
      // 添加私人房间
      data.items = Object.assign(
        {
          1: { id:1, name:"私人房间1" },
          2: { id:2, name:"私人房间2" },
          3: { id:3, name:"私人房间3" }
        },
        data.items || {}
      );

      const groups = Object.values(data.items).map(group => {
        const onlineCount = group.devmap ? Object.values(group.devmap)
          .filter(device => device.is_online).length : 0;
          
        return {
          ...group,
          displayName: `${group.id}-${group.name}`,
          deviceCount: group.devmap ? Object.keys(group.devmap).length : 0,
          onlineCount,
          createTime: this.formatTime(group.create_time),
          updateTime: this.formatTime(group.update_time),
          statusText: GROUP_STATUS[group.status] || '未知状态'
        };
      });

      this.setData({ groups });
      getApp().globalData.availableGroups = groups;
    } catch (error) {
      wx.showToast({
        title: error.message || '获取群组失败',
        icon: 'none'
      });
    }
  },

  // 格式化时间
  formatTime(timeStr) {
    if (!timeStr) return '';
    const isoTime = timeStr.replace(' ', 'T') + 'Z';
    const date = new Date(isoTime);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).replace(/\//g, '-');
  },

  // 获取设备列表
  async getDeviceList() {
    try {
      const data = await api.getDeviceList();
      const devices = Object.values(data.items).map(device => ({
        ...device,
        displayName: `${device.callsign}-${device.ssid}(${device.cpuid})`
      }));
      
      this.setData({ devices });
      getApp().globalData.availableDevices = devices;
    } catch (error) {
      wx.showToast({
        title: error.message || '获取设备失败',
        icon: 'none'
      });
    }
  },

  // 跳转到群组详情页面
  navigateToGroupDetail(e) {
    const group = e.currentTarget.dataset.group;
    wx.navigateTo({
      url: `/pages/group-detail/group-detail?group=${encodeURIComponent(JSON.stringify(group))}`
    });
  },

  // 选择设备
  selectDevice(e) {
    const index = e.detail.value;
    const device = this.data.devices[index];
    if (!device) return;

    this.setData({
      selectedDevice: device.id,
      selectedDeviceIndex: index
    });
  },

});
