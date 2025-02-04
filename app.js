App({
  globalData: {
    userInfo: null,
    token: null,
    cpuid: null,
    passcode: null,
    currentGroup: null,
    currentDevice: null,
    availableGroups: [],
    availableDevices: [],
    voicePage: null,
    configPage: null,
    configPageReady: false,
    configPageReadyCallback: null,
    udpClient: null,
    messagePage: null,
    serverConfig: {
      host: 'nrlptt.com',
      port: 60050
    }
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
