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
    
    wx.request({
      url: 'https://nrlptt.com/user/login',
      method: 'POST',
      data: {username, password},
      success: (res) => {
        if (res.data.code === 20000) {
          wx.setStorageSync('token', res.data.data.token);
          this.getUserInfo();
        } else {
          wx.showToast({
            title: res.data.message || '登录失败',
            icon: 'none'
          });
        }
      },
      fail: (err) => {
        wx.showToast({
          title: '网络错误，请重试',
          icon: 'none'
        });
      },
      complete: () => {
        this.setData({loading: false});
      }
    });
  },

  getUserInfo() {
    wx.request({
      url: 'https://nrlptt.com/user/info',
      method: 'GET',
      header: {
        'x-token': wx.getStorageSync('token')
      },
      success: (res) => {
        if (res.data.code === 20000) {
          const userInfo = res.data.data;
          // 计算并存储cpuid
          const cpuId = calculateCpuId(userInfo.callSign);
          userInfo.cpuId = cpuId;
          
          wx.setStorageSync('userInfo', userInfo);
          app.globalData.userInfo = userInfo;
          wx.navigateTo({url: '/pages/voice/voice'});
        } else {
          wx.showToast({
            title: res.data.message || '获取用户信息失败',
            icon: 'none'
          });
        }
      }
    });
  }
});
