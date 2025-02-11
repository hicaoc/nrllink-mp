import { getGroupList as _getGroupList, getDeviceList as _getDeviceList } from '/utils/api';

App({
  globalData: {
    userInfo: null,
    token: null,
    cpuid: null,
    passcode: null,
    currentGroup: null,
    currentDevice: null,
    availableGroups: {},
    availableDevices: {},
    voicePage: null,
    configPage: null,
    configPageReady: false,
    configPageReadyCallback: null,
    udpClient: null,
    messagePage: null,
    serverConfig: {
      name: 'NRLPTT主站',
      host: 'nrlptt.com',
      port: 60050
    },
    getGroupList: async function () {
      try {
        const data = await _getGroupList();
        const groups = Object.values(data.items).map(group => {
          const onlineCount = group.devmap ? Object.values(group.devmap)
            .filter(device => device.is_online).length : 0;

          return {
            ...group,
            displayName: `${group.id}-${group.name}`,
            deviceCount: group.devmap ? Object.keys(group.devmap).length : 0,
            onlineCount,
          };
        });

        this.availableGroups = groups;
      } catch (error) {
        console.error(error);
        wx.showToast({
          title: error.message || '获取群组失败',
          icon: 'none'
        });
      }
    },

    getDeviceList: async function () {
      try {
        const data = await _getDeviceList();
        const devices = Object.values(data.items).map(device => ({
          ...device,
          displayName: `${device.callsign}-${device.ssid}(${device.cpuid})`
        }));

        this.availableDevices = devices;
      } catch (error) {
        wx.showToast({
          title: error.message || '获取设备失败',
          icon: 'none'
        });
      }
    },

    logout() {
      this.token = null;
      wx.removeStorageSync('token');
      wx.removeStorageSync('userInfo');
      wx.removeStorageSync('cpuId');
      wx.removeStorageSync('passcode');
      //wx.removeStorageSync('serverCredentials');
      wx.reLaunch({
        url: '/pages/login/login'
      });
    },
  
  },

  onLaunch() {
    const udp = require('./utils/udp');
    const nrl = require('./utils/nrl21');

    const token = wx.getStorageSync('token');
    if (token) {
      this.globalData.token = token;
      wx.reLaunch({
        url: '/pages/login/login'
      });
  

      return;
    }

 
  },

  onShow() {
    // if (this.globalData.udpClient) {
    //   this.globalData.udpClient.reconnect();
    // }
  },

  onHide() {
 
  },

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

  setToken(token) {
    wx.setStorageSync('token', token);
    this.globalData.token = token;
  },

  clearToken() {
    wx.removeStorageSync('token');
    this.token = null;
  },


  registerPage(page) {
    const route = page.__route__ || page.route;
    if (route === 'pages/voice/voice') {
      this.globalData.voicePage = page;
    } else if (route === 'pages/config/config') {
      this.globalData.configPage = page;
    } else if (route === 'pages/message/message') {
      this.globalData.messagePage = page;
    }
  },

  unregisterPage(page) {
    // 保留原有注销逻辑
  }
});
