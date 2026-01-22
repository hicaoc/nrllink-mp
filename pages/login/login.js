
import { generateAPRSPasscode } from '../../utils/aprs';
const app = getApp();

Page({
  data: {
    username: '',
    password: '',
    loading: false,
    serverList: [
      { name: 'NRLPTT主站', host: 'www.nrlptt.com', port: 60050 },
      { name: '江苏省无线电运动协会', host: 'js.nrlptt.com', port: 60050 },
      { name: '北京阳光无线俱乐部', host: 'ba1gm.nrlptt.com', port: 60050 },
      { name: '董哥集群', host: 'bh1osw.nrlptt.com', port: 60050 },
      { name: '徐州HAM互联', host: 'bd4two.nrlptt.com', port: 60050 },
      { name: 'BH4TDV实验场', host: 'bh4tdv.nrlptt.com', port: 60050 }
    ],
    serverIndex: 1, // Default to NRLPTT主站
    customServer: '',
    selectedOption: 'predefined', // Add selectedOption to track the selection
    thanksItems: [
      '感谢：', 'BG6FCS', 'BH4TIH', 'BA4RN', 'BA1GM', 'BA4QEK', 'BA4QAO',
      'BD4VKI', 'BH4VAP', 'BH4TDV', 'BI4UMD', 'BA4QGT', 'BG8EJT', 'BH1OSW', 'BD4RFG', 'BG4QG', 'BD1BHO', 'BG2LBF',
      '排名不分先后，还有很多，列表太长放不下了'
    ]
  },

  bindServerChange(e) {
    const newServerIndex = e.detail.value;
    this.setData({
      serverIndex: newServerIndex,
      selectedOption: 'predefined' // Set selectedOption to predefined when server is selected
    });

    const serverCredentials = wx.getStorageSync('serverCredentials') || {};
    const currentServerCreds = serverCredentials[newServerIndex];

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
      customServer: e.detail.value,
      selectedOption: 'custom' // Set selectedOption to custom when custom server is entered
    });
  },

  onLoad() {
    this.getPlatformList();

    const serverCredentials = wx.getStorageSync('serverCredentials') || {};
    const savedServerIndex = wx.getStorageSync('savedServerIndex');
    if (savedServerIndex !== undefined) {
      this.setData({
        serverIndex: savedServerIndex
      });
    }

    const currentServerCreds = serverCredentials[this.data.serverIndex];
    if (currentServerCreds) {
      this.setData({
        username: currentServerCreds.username,
        password: currentServerCreds.password
      });
    }
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

    if (!username || !password) {
      wx.showToast({
        title: '请输入用户名和密码',
        icon: 'none'
      });
      return;
    }

    try {
      const serverCredentials = wx.getStorageSync('serverCredentials') || {};
      serverCredentials[this.data.serverIndex] = { username, password };
      wx.setStorageSync('serverCredentials', serverCredentials);
      wx.setStorageSync('savedServerIndex', this.data.serverIndex);
    } catch (err) {
      wx.showToast({
        title: '存储失败，请检查存储空间',
        icon: 'none'
      });
      console.error('存储失败:', err);
    }

    this.setData({ loading: true });

    const api = require('../../utils/api');

    const selectedServer = this.data.selectedOption === 'predefined'
      ? this.data.serverList[this.data.serverIndex]
      : { host: this.data.customServer };

    app.globalData.serverConfig = {
      name: selectedServer.name || 'Custom Server',
      host: selectedServer.host,
      port: selectedServer.port || 60050 // Default port if not specified
    };

    api.login({ username, password })
      .then(res => {
        if (res.token) {
          wx.setStorageSync('token', res.token);
          this.getUserInfo();
        } else {
          wx.showToast({
            title: '用户名或者密码错',
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


      wx.setStorageSync('userInfo', userInfo);
      app.globalData.userInfo = userInfo;


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
    const url = 'https://nrlptt.com/platform/list';

    wx.request({
      url: url,
      method: 'GET',
      header: {
        'content-type': 'application/json',
      },
      success: (res) => {
        this.setData({
          serverList: res.data.data.items,
        });
      },
      fail: (err) => {
        console.error('请求失败：', err);
      },
    });
  },

  bindRadioChange(e) {
    this.setData({
      selectedOption: e.detail.value
    });
  },


  copyDownloadLink(e) {
    const url = e.currentTarget.dataset.url;
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({
          title: '链接已复制，请去浏览器打开',
          icon: 'none',
          duration: 2000
        });
      }
    });
  }
});
