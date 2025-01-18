const { calculateCpuId } = require('../../utils/nrl21');
const app = getApp();

Page({
  data: {
    username: '',
    password: '',
    loading: false,
    rememberMe: false
  },

  onLoad() {
    // 检查是否有存储的账号信息
    const savedUsername = wx.getStorageSync('savedUsername');
    const savedPassword = wx.getStorageSync('savedPassword');
    if (savedUsername && savedPassword) {
      this.setData({
        username: savedUsername,
        password: savedPassword,
        rememberMe: true
      });
    }
  },

  inputUsername(e) {
    this.setData({username: e.detail.value});
  },

  inputPassword(e) {
    this.setData({password: e.detail.value});
  },

  toggleRememberMe() {
    this.setData({
      rememberMe: !this.data.rememberMe
    });
  },

  login() {
    if (this.data.loading) return;
    
    const {username, password, rememberMe} = this.data;
    
    // 处理记住账号功能
    if (rememberMe) {
      wx.setStorageSync('savedUsername', username);
      wx.setStorageSync('savedPassword', password);
    } else {
      wx.removeStorageSync('savedUsername');
      wx.removeStorageSync('savedPassword');
    }
    if (!username || !password) {
      wx.showToast({
        title: '请输入用户名和密码',
        icon: 'none'
      });
      return;
    }

    this.setData({loading: true});
    
    const api = require('../../utils/api');
    
    api.login({username, password})
      .then(res => {
        wx.setStorageSync('token', res.token);
        this.getUserInfo();
      })
      .catch(err => {
        wx.showToast({
          title: err.message || '登录失败',
          icon: 'none'
        });
      })
      .finally(() => {
        this.setData({loading: false});
      });
  },

  async getUserInfo() {
    const api = require('../../utils/api');
    
    try {
      const userInfo = await api.getUserInfo();
      
      if (!userInfo.callsign) {
        wx.showToast({
          title: '用户信息缺少呼号',
          icon: 'none'
        });
        return;
      }
      
      // 计算并存储cpuid
      const cpuId = calculateCpuId(userInfo.callsign);
      userInfo.cpuId = cpuId;
      
      wx.setStorageSync('userInfo', userInfo);
      app.globalData.userInfo = userInfo;
      console.log('准备跳转到语音页面');
      try {
        wx.switchTab({url: '/pages/voice/voice'});
        console.log('跳转成功');
      } catch (err) {
        console.error('跳转失败:', err);
        wx.showToast({
          title: '跳转失败，请重试',
          icon: 'none'
        });
      }
    } catch (err) {
      wx.showToast({
        title: err.message || '获取用户信息失败',
        icon: 'none'
      });
    }
  }
});
