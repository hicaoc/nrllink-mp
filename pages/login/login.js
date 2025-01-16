const { calculateCpuId } = require('../../utils/nrl21');
const app = getApp();

Page({
  data: {
    username: '',
    password: '',
    loading: false
  },

  inputUsername(e) {
    this.setData({username: e.detail.value});
  },

  inputPassword(e) {
    this.setData({password: e.detail.value});
  },

  login() {
    if (this.data.loading) return;
    
    const {username, password} = this.data;
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
      wx.navigateTo({url: '/pages/voice/voice'});
    } catch (err) {
      wx.showToast({
        title: err.message || '获取用户信息失败',
        icon: 'none'
      });
    }
  }
});
