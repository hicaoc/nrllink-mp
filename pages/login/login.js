const { calculateCpuId } = require('../../utils/nrl21');
const { generateAPRSPasscode } = require('../../utils/aprs');
const app = getApp();

Page({
  data: {
    username: '',
    password: '',
    //tempPassword: '', // 用于临时保存密码
    //showPassword: false,
    loading: false,
    serverList: [
      { name: 'NRLPTT主站', host: 'nrlptt.com', port: 60050 },
      { name: '北京阳光无线俱乐部', host: 'ba1gm.nrlptt.com', port: 60050 },
      { name: '徐州HAM互联', host: 'bd4two.nrlptt.com', port: 60050 },
      { name: 'BH4TDV实验场', host: 'bh4tdv.nrlptt.com', port: 60050 }
    ],
    serverIndex: 1, // Default to NRLPTT主站
    customServer: ''
  },

  bindServerChange(e) {
    console.log('picker发送选择改变，携带值为', e.detail.value);
    const newServerIndex = e.detail.value;
    this.setData({
      serverIndex: newServerIndex
    });

    const serverCredentials = wx.getStorageSync('serverCredentials') || {};
    console.log('serverCredentials:', serverCredentials); // 添加这行
    const currentServerCreds = serverCredentials[newServerIndex];
    console.log('currentServerCreds:', currentServerCreds); // 添加这行

    if (currentServerCreds) {
      this.setData({
        username: currentServerCreds.username,
        password: currentServerCreds.password
      });
    } else {
      this.setData({
        username: '',
        password: ''
      });
    }
  },
  inputCustomServer(e) {
    this.setData({
      customServer: e.detail.value
    })
  },

  onLoad() {

    this.getPlatformList()
    // 检查是否有有效 token
    // const token = wx.getStorageSync('token');
    // const userInfo = wx.getStorageSync('userInfo');
    // const cpuId = wx.getStorageSync('cpuId');
    // const passcode = wx.getStorageSync('passcode');
    const serverCredentials = wx.getStorageSync('serverCredentials') || {};

    // 设置默认服务器索引
    const savedServerIndex = wx.getStorageSync('savedServerIndex');
    if (savedServerIndex !== undefined) {
      this.setData({
        serverIndex: savedServerIndex
      });
    }

    // 如果当前服务器有存储的凭证，自动填充
    const currentServerCreds = serverCredentials[this.data.serverIndex];
    if (currentServerCreds) {
      this.setData({
        username: currentServerCreds.username,
        password: currentServerCreds.password
      });
    }

    // if (token && userInfo && cpuId && passcode) {
    //   console.log('检测到有效 token，初始化全局数据');
    //   app.globalData.userInfo = userInfo;
    //   app.globalData.cpuId = cpuId;
    //   app.globalData.passcode = passcode;
    //   wx.switchTab({ url: '/pages/voice/voice' });
    //   return;
    // }
  },



  inputUsername(e) {
    this.setData({ username: e.detail.value });
  },

  inputPassword(e) {
    this.setData({ password: e.detail.value });
  },

  // togglePassword() {
  //   console.log('togglePassword1',this.data.password);
  //       // 1. 保存当前密码到 tempPassword
  //        // 1. 保存当前密码到 tempPassword
  //   this.setData({
  //     tempPassword: this.data.password
  //   });

  //   // 2. 切换 showPassword 状态
  //   this.setData({
  //     showPassword: !this.data.showPassword
  //   }, () => {
  //     wx.nextTick(() => {
  //       this.setData({
  //         password: this.data.tempPassword,
  //         tempPassword: ''
  //       });
  //     });
  //   });
  //   console.log('togglePassword2',this.data.password);
  // },

  login() {
    if (this.data.loading) return;

    const { username, password } = this.data;

    if (!username || !password) {
      wx.showToast({
        title: '请输入用户名和密码',
        icon: 'none'
      });
      return;
    }

    // 存储凭证
    try {
      const serverCredentials = wx.getStorageSync('serverCredentials') || {};
      serverCredentials[this.data.serverIndex] = { username, password };
      wx.setStorageSync('serverCredentials', serverCredentials);
      wx.setStorageSync('savedServerIndex', this.data.serverIndex);
      console.log('成功存储服务器凭证');
    } catch (err) {
      wx.showToast({
        title: '存储失败，请检查存储空间',
        icon: 'none'
      });
      console.error('存储失败:', err);
    }

    this.setData({ loading: true });

    const api = require('../../utils/api');

    // 更新服务器配置

    const selectedServer = this.data.serverList[this.data.serverIndex];
    app.globalData.serverConfig = {
      name: selectedServer.name,
      host: selectedServer.host,
      port: selectedServer.port
    };


    api.login({ username, password })
      .then(res => {     

        if (res.token) {
          wx.setStorageSync('token', res.token);
          this.getUserInfo();
        }else { 
          wx.showToast({
            title:  '用户名或者密码错',
            icon: 'none'
          });
        }
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

      const cpuId = calculateCpuId(userInfo.callsign + '-' + userInfo.ssid);
      wx.setStorageSync('cpuId', cpuId);
      wx.setStorageSync('userInfo', userInfo);
      app.globalData.userInfo = userInfo;
      app.globalData.cpuId = cpuId;

      const passcode = generateAPRSPasscode(userInfo.callsign);
      app.globalData.passcode = passcode;
      wx.setStorageSync('passcode', passcode);

      wx.switchTab({ url: '/pages/voice/voice' });
    } catch (err) {
      wx.showToast({
        title: err.message || '获取用户信息失败',
        icon: 'none'
      });
    }
  },


  getPlatformList() {
    const url = 'https://nrlptt.com/platform/list'; // 替换为你的接口地址

    wx.request({
      url: url, // 请求地址
      method: 'GET', // 请求方法
      header: {
        'content-type': 'application/json', // 默认值，告诉服务器以 JSON 格式接收数据
      },
      success: (res) => {
        this.setData({
          serverList: res.data.data.items, // 保存结果到页面数据
        });
      },
      fail: (err) => {
        console.error('请求失败：', err);
      },
    });
  },
});



