const api = require('../../utils/api');

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
    // 注册当前页面实例
    app.registerPage(this);

    const userInfo = app.globalData.userInfo || {};
   // const cpuid = app.globalData.cpuId;
    const cpuid = parseInt(app.globalData.cpuId).toString(16).toUpperCase();




    if (!cpuid) {
      wx.showToast({
        title: '设备ID获取失败',
        icon: 'none'
      });
      return;
    }

    // 将cpuid转换为16进制字符串

    const callsign = userInfo.callsign || '未知';

    console.log(`当前设备CPUID: ${cpuid}`,app.globalData.currentGroup.name );


    this.setData({
      cpuid: `${callsign}-100 (${cpuid})`,
      currentGroup: app.globalData.currentGroup.name || null
    });




    this.refreshData();
  },

  onUnload() {
    // const app = getApp();
    // // 注销当前页面实例
    // app.unregisterPage(this);
  },

  // 刷新群组和设备列表
  async refreshData() {
    await this.getGroupList();
    await this.getDeviceList();
    this.getCurrentGroup();
  },

  // 获取当前设备所在群组
  getCurrentGroup() {
    const cpuid = parseInt(getApp().globalData.cpuId).toString(16).toUpperCase();
    const { devices, groups } = this.data;

    // 将cpuid转换为16进制字符串


    // 通过cpuid找到当前设备
    const device = devices.find(d => {
      return d.cpuid === cpuid;
    });

    if (!device) {
      this.setData({ currentGroup: null });
      return;
    }

    // 通过group_id找到对应群组
    const group = groups.find(g => g.id === device.group_id);
    this.setData({
      currentGroup: group ? group.name : null
    });
  },

  // 获取群组列表
  async getGroupList() {
    try {
      const data = await api.getGroupList();

          // 添加3个私人房间到设备对象
          data.items = Object.assign(
      {
        1: { id:1, name:"私人房间1" },
        2: { id:2, name:"私人房间2" },
        3: { id:3, name:"私人房间3" }
      },
      data.items || {}
    );


      const groups = Object.values(data.items).map(group => ({
        ...group,
        displayName: `${group.id}-${group.name}`
      }));
      this.setData({
        groups
      });
      // 更新全局群组列表
      getApp().globalData.availableGroups = groups;
    } catch (error) {
      wx.showToast({
        title: error.message || '获取群组失败',
        icon: 'none'
      });
    }
  },

  // 获取设备列表
  async getDeviceList() {
    try {
      const data = await api.getDeviceList();
      const devices = Object.values(data.items).map(device => ({
        ...device,
        displayName: `${device.callsign}-${device.ssid}(${device.cpuid})`
      }));
      this.setData({
        devices
      });
      // 更新全局设备列表
      getApp().globalData.availableDevices = devices;
    } catch (error) {
      wx.showToast({
        title: error.message || '获取设备失败',
        icon: 'none'
      });
    }
  },

  // 选择群组
  selectGroup(e) {
    this.setData({
      selectedGroup: e.detail.value
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

  // 加入群组
  async joinGroup() {
    const { selectedGroup, selectedDevice, groups, devices } = this.data;
    if (!selectedGroup || !selectedDevice) {
      wx.showToast({
        title: '请选择群组和设备',
        icon: 'none'
      });
      return;
    }

    const device = devices.find(d => d.id === selectedDevice);
    if (!device) {
      wx.showToast({
        title: '设备未找到，请刷新重试',
        icon: 'none'
      });
      return;
    }

    const groupId = groups[selectedGroup].id;

    try {
      await api.updateDevice({
        ...device,
        group_id: groupId
      });
      wx.showToast({
        title: '加入群组成功'
      });

      // 更新设备列表和当前群组
      await this.getDeviceList();
      this.getCurrentGroup();

      // 如果修改的是当前设备，更新全局状态
      const app = getApp();
      const currentCpuid = parseInt(app.globalData.cpuId).toString(16).toUpperCase();

      if (device.cpuid === currentCpuid) {
        app.globalData.currentGroup = groups[selectedGroup];
        app.globalData.currentDevice = device;

       
      }

   

      // 通知voice页面更新群组显示
      const voicePage = app.globalData.voicePage;
      if (voicePage && voicePage.getCurrentGroup) {
        voicePage.getCurrentGroup();
      } else {
        console.warn('Voice page not found or getCurrentGroup method missing');
      }
    } catch (error) {
      wx.showToast({
        title: error.message || '加入群组失败',
        icon: 'none'
      });
    }
  }
});
