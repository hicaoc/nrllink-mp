import { getGroupList as _getGroupList, getDeviceList as _getDeviceList } from '/utils/api';

// 群组状态映射



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
            //createTime: this.formatTime(group.create_time),
            //updateTime: this.formatTime(group.update_time),
            //statusText: GROUP_STATUS[group.status] || '未知状态'
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


  },

  onLaunch() {
    // 初始化UDP客户端
    const udp = require('./utils/udp');
    const nrl = require('./utils/nrl21');

    // 检查本地存储中是否有token
    const token = wx.getStorageSync('token');
    if (token) {
      this.globalData.token = token;
      return;
    }

    const accountInfo = wx.getAccountInfoSync();
    console.log('accountInfo:', accountInfo);

    //ba1gm ba1gm.nrlptt.com
    if (accountInfo.miniProgram.appId === 'wx7c8119a524d6b911') {
      this.globalData.serverConfig = {
        host: 'ba1gm.nrlptt.com',
        port: 60050
      };
    }

    //bh4tdv nrlptt.com
    if (accountInfo.miniProgram.appId === 'wx776b03fb53f1c193') {
      this.globalData.serverConfig = {
        host: 'nrlptt.com',
        port: 60050
      };
    }

    //bd4two bh4vap
    if (accountInfo.miniProgram.appId === 'wxe4ca2cd50966d0af') {
      this.globalData.serverConfig = {
        host: 'nrl.bd4two.site',
        port: 60050
      };
    }


    


    // 否则跳转到登录页面
    wx.reLaunch({
      url: '/pages/login/login'
    });
  },

  onShow() {
    // 小程序回到前台时重新连接
    if (this.globalData.udpClient) {
      this.globalData.udpClient.reconnect();
    }
  },

  onHide() {
    // 小程序进入后台时保持连接
    if (this.globalData.udpClient) {
      this.globalData.udpClient.keepAlive();
    }
    console.log('UDPClient keepAlive');
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




  setToken(token) {
    wx.setStorageSync('token', token);
    this.globalData.token = token;
  },

  clearToken() {
    wx.removeStorageSync('token');
    this.globalData.token = null;
  },

  // 注册页面实例
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

  // 注销页面实例
  unregisterPage(page) {
    // const route = page.__route__ || page.route;
    // if (route === 'pages/voice/voice') {
    //   this.globalData.voicePage = null;
    // } else if (route === 'pages/config/config') {
    //   this.globalData.configPage = null;
    // } else if (route === 'pages/message/message') {
    //   this.globalData.messagePage = null;
    // }
  }
});
