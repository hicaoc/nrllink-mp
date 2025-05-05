//import { getQTH, getQTHmap,logout } from './utils/api';
import * as audio from './utils/audioPlayer';

import {
  getGroupList as _getGroupList,
  getGroup as _getGroup,
  getDevice as _getDevice,
  getMyDevices as _getMyDevices,
  getGroupListMini as _getGroupListMini,
  getDeviceList as _getDeviceList,
  getQTHmap as _getQTHmap,
  getQTH as _getQTH,
  logout as _logout,
} from '/utils/api';

App({
  globalData: {
    userInfo: null,
    token: null,
    cpuid: null,
    passcode: null,
    currentGroup: null,
    currentDevice: null,
    callHistory: [],
    heartbeatTimer: null,

    recoderStartTime: null,
    availableGroups: null,
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
    // getDeviceList: async function () {
    //   try {
    //     const data = await _getDeviceList();
    //     const devices = Object.values(data.items).map(device => ({
    //       ...device,
    //       displayName: `${device.callsign}-${device.ssid}(${device.cpuid})`
    //     }));

    //     this.availableDevices = devices;
    //   } catch (error) {
    //     wx.showToast({
    //       title: error.message || '获取设备失败',
    //       icon: 'none'
    //     });
    //   }
    // },
    getGroupList: async function () {
      try {
        // const data = await _getGroupList();
        // const groups = Object.values(data.items).map(group => {
        //   const onlineCount = group.devmap ? Object.values(group.devmap)
        //     .filter(device => device.is_online).length : 0;

        //   return {
        //     ...group,
        //     displayName: `${group.id}-${group.name}`,
        //     deviceCount: group.devmap ? Object.keys(group.devmap).length : 0,
        //     onlineCount,
        //   };
        // });

        const data = await _getGroupListMini();
         this.availableGroups = data;

        return data
        // const groups = data.map(group => {
        //   // const onlineCount = group.devmap ? Object.values(group.devmap)
        //   //   .filter(device => device.is_online).length : 0;

        //   return {
        //     ...group,
        //     displayName: `${group.id}-${group.name}`,
        //     deviceCount: group.total_dev_number,
        //     onlineCount: group.online_dev_number
        //   };
        // });

      

      } catch (error) {
        console.error(error);
        wx.showToast({
          title: error.message || '获取群组失败',
          icon: 'none'
        });
      }
    },

    getGroup: async function (group_id) {

      try {
        const data = await _getGroup({ group_id: group_id });
       // console.log('getGroup', data)
        return data
      } catch (error) {
        wx.showToast({
          title: error.message || '获取群组失败',
          icon: 'none'
        });
      }

    },

    getDevice: async function (callsign, ssid) {

      try {

        const data = await _getDevice({ callsign: callsign, ssid: ssid });
        // if (data.callsign === callsign && data.ssid === ssid) {
        //   this.globalData.currentDevice = data;
        // }
        //console.log('getDevice', data)

        return data

      } catch (error) {
        wx.showToast({
          title: error.message || '获取设备失败',
          icon: 'none'
        });
      }

    },
    getMyDevices: async function () {

      try {

        const data = await _getMyDevices();
      
        return data

      } catch (error) {
        wx.showToast({
          title: error.message || '获取本人设备失败',
          icon: 'none'
        });
      }

    },

    getQTH: async function () {

      try {

        const data = await _getQTH();
      
        return data

      } catch (error) {
        wx.showToast({
          title: error.message || '获取设备QTH失败',
          icon: 'none'
        });
      }

    },


    getQTHmap: async function () {

      try {

        const data = await _getQTHmap();
      
        return data

      } catch (error) {
        wx.showToast({
          title: error.message || '获取QTH map失败',
          icon: 'none'
        });
      }

    },



    async logout() {

      this.udpClient.close();
      this.udpClient = null;
      audio.suspend();

      try {

        const data = await _logout({ssid: 100});
      
       console.log('logout', data)

      } catch (error) {
        wx.showToast({
          title: error.message || '退出失败',
          icon: 'none'
        });
      }

  
      this.token = null;

      wx.removeStorageSync('token');
      wx.removeStorageSync('userInfo');
      wx.removeStorageSync('cpuId');
      wx.removeStorageSync('passcode');
      //wx.removeStorageSync('serverCredentials');
      // wx.restartMiniProgram({    
      //   path: '/pages/login/login',
      //   complete: (res) => {
      //     console.log('restartMiniProgram complete', res);
      //   },
      // })

      // wx.showToast({
      //   title: '正在退出，请稍等', // 提示的内容
      //   icon: 'loading', // 图标，有效值有 success, loading, none
      //   duration: 2000, // 提示的延迟时间，单位毫秒，默认：1500
      //   mask: false // 是否显示透明蒙层，防止触摸穿透，默认为 false
      // });


      
      wx.reLaunch({
        url: '/pages/login/login'
      });
    },

  },

  onLaunch() {
    // const udp = require('./utils/udp');
    // const nrl = require('./utils/nrl21');

    // const token = wx.getStorageSync('token');
    // if (token) {
    //   this.globalData.token = token;
    //   wx.reLaunch({
    //     url: '/pages/login/login'
    //   });


    //   return;
    // }
  


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
