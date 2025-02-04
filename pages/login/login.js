const { calculateCpuId } = require('../../utils/nrl21');
const app = getApp();

Page({
  data: {
    username: '',
    password: '',
    loading: false
  },

  onLoad() {
    // 检查是否有有效 token
    const token = wx.getStorageSync('token');
    const userInfo = wx.getStorageSync('userInfo');
    const cpuId = wx.getStorageSync('cpuId');
    const passcode = wx.getStorageSync('passcode');

    if (token && userInfo && cpuId && passcode) {
      console.log('检测到有效 token，初始化全局数据');

      // 初始化全局用户信息

      if (userInfo) {
        app.globalData.userInfo = userInfo;
        app.globalData.cpuId = cpuId;
        app.globalData.passcode = passcode;
        console.log('全局用户信息初始化完成:', {
          userInfo,
          cpuId,
          passcode
        });
      }

      console.log('自动跳转到语音页面');
      wx.switchTab({ url: '/pages/voice/voice' });
      return;
    }

    // 检查是否有存储的账号信息
    const savedUsername = wx.getStorageSync('savedUsername');
    const savedPassword = wx.getStorageSync('savedPassword');

    console.log('页面加载，读取存储信息:', {
      savedUsername,
      savedPassword
    });

    if (savedUsername && savedPassword) {
      console.log('成功读取存储的用户名和密码');
      this.setData({
        username: savedUsername,
        password: savedPassword
      }, () => {
        console.log('setData 回调:', {
          username: this.data.username,
          password: this.data.password
        });
      });
    }
  },

  generateAPRSPasscode(callsign) {
    // 将呼号转换为大写并移除 SSID（例如 '-1'）
    callsign = callsign.split('-')[0].toUpperCase();

    // 初始化passcode
    let passcode = 29666;

    // 对每两个字符进行XOR运算
    let i = 0;
    while (i < callsign.length) {
      // 第一个字符乘以256后XOR
      passcode ^= callsign.charCodeAt(i) * 256;
      // 第二个字符直接XOR
      if (i + 1 < callsign.length) {
        passcode ^= callsign.charCodeAt(i + 1);
      }
      i += 2;
    }

    // 与32767进行AND操作
    passcode &= 32767;

    return passcode;
  },


  inputUsername(e) {
    this.setData({ username: e.detail.value });
  },

  inputPassword(e) {
    this.setData({ password: e.detail.value });
  },

  login() {
    if (this.data.loading) return;

    const { username, password } = this.data;


    // 默认记住账号
    try {
      wx.setStorageSync('savedUsername', username);
      wx.setStorageSync('savedPassword', password);
      console.log('成功存储用户名和密码');
    } catch (err) {
      wx.showToast({
        title: '存储失败，请检查存储空间',
        icon: 'none'
      });
      console.error('存储失败:', err);
    }
    if (!username || !password) {
      wx.showToast({
        title: '请输入用户名和密码',
        icon: 'none'
      });
      return;
    }

    this.setData({ loading: true });

    const api = require('../../utils/api');

    api.login({ username, password })
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
        this.setData({ loading: false });
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
      const cpuId = calculateCpuId(userInfo.callsign+'-'+userInfo.ssid);
      wx.setStorageSync('cpuId', cpuId);
      wx.setStorageSync('userInfo', userInfo);
      app.globalData.userInfo = userInfo;
      app.globalData.cpuId = cpuId;

      console.log('全局用户信息初始化完成:', {
        userInfo,
        cpuId
      });


      const passcode = this.generateAPRSPasscode(userInfo.callsign);
      app.globalData.passcode = passcode;

      console.log('生成APRS密码成功:', passcode);
      wx.setStorageSync('passcode', passcode);


      console.log('准备跳转到语音页面');
      try {
        wx.switchTab({ url: '/pages/voice/voice' });
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
