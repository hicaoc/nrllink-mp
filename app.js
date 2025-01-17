App({
  globalData: {
    userInfo: null,
    token: null,
    cpuid: null,
    currentGroup: null, // 当前群组
    currentDevice: null, // 当前设备
    availableGroups: [], // 可用群组列表
    availableDevices: [], // 可用设备列表
    voicePage: null, // 语音页面实例
    configPage: null, // 配置页面实例
    configPageReady: false,
    configPageReadyCallback: null
  },

  onLaunch() {
    // 检查本地存储中是否有token
    const token = wx.getStorageSync('token')
    if (token) {
      this.globalData.token = token
      return
    }
    
    // 否则跳转到登录页面
    wx.reLaunch({
      url: '/pages/login/login'
    })
  },

  setToken(token) {
    wx.setStorageSync('token', token)
    this.globalData.token = token
  },

  clearToken() {
    wx.removeStorageSync('token')
    this.globalData.token = null
  },

  // 注册页面实例
  registerPage(page) {
    const route = page.__route__ || page.route;
    if (route === 'pages/voice/voice') {
      this.globalData.voicePage = page;
    } else if (route === 'pages/config/config') {
      this.globalData.configPage = page;
    }
  },

  // 注销页面实例
  unregisterPage(page) {
    const route = page.__route__ || page.route;
    if (route === 'pages/voice/voice') {
      this.globalData.voicePage = null;
    } else if (route === 'pages/config/config') {
      this.globalData.configPage = null;
    }
  }
});
