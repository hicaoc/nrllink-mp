const { TCPClient } = require('../../utils/tcp.js');

Page({
  data: {
    userInfo: {    
      callSign: '默认呼号', // 保持与wxml一致   
    },
    latitude: null,
    longitude: null,
    status: '',
    timer: null,
    webViewStatus: '未加载',
    tcpClient: null,
    webViewConnected: false
  },
  
  onLoad() {
    const app = getApp()
    
    // 确保用户信息存在
 
    this.setData({
      userInfo: {
        ...app.globalData.userInfo,
        callSign: app.globalData.userInfo.callsign
      }
    })

    // 初始化TCP客户端
    this.tcpClient = new TCPClient({
      host: 'aprs.tv',
      port: 14580,
      onMessage: this.handleTcpMessage.bind(this)
    });

    this.tcpClient.connect();



    // 启动位置监听
    this.startLocationWatch();
    

  },

  onShow() {
   // console.log('onShow');
  },
  
  onReady() {
   // console.log('onReady');
 
  },

  handleWebViewLoad(e) {
    console.log(e.detail)
    this.setData({
      webViewStatus: 'webview加载完成'
    });
  },
  
  handleWebViewError(e){   
    console.log('web-view加载错误',e);
  },  
  
  handleWebViewMessage(e) {
    console.log('收到web-view消息:', e.detail);
    this.setData({
      webViewStatus: '消息接收成功'
    });
  },
  
  onUnload() {
    // 清除定时器
    // if (this.data.timer) {
    //   clearInterval(this.data.timer);
    // }
    // // 关闭TCP连接
    // if (this.tcpClient) {
    //   this.tcpClient.close();
    // }
  },
  
  startLocationWatch() {
    // 获取当前位置
    wx.getLocation({
      type: 'wgs84',
      success: (res) => {
        this.setData({
          latitude: res.latitude,
          longitude: res.longitude
        });
        
        // 立即发送第一次位置
        this.sendAprsPosition();
        
        // 启动定时发送
        this.setData({
          timer: setInterval(() => {
            wx.getLocation({
              type: 'wgs84',
              success: (res) => {
                this.setData({
                  latitude: res.latitude,
                  longitude: res.longitude
                });
                this.sendAprsPosition();
              },
              fail: (err) => {
                this.setData({
                  status: '获取位置失败'
                });
                console.error('获取位置失败', err);
              }
            });
          }, 60000) // 60秒间隔
        });
      },
      fail: (err) => {
        this.setData({
          status: '获取位置失败'
        });
        console.error('获取位置失败', err);
      }
    });
  },
  
  async sendAprsPosition() {
    const { latitude, longitude, userInfo } = this.data;
    let callSign = userInfo.callsign;
    
    if (!latitude || !longitude || !callSign) {
      return;
    }

    // 获取设备信息
    const deviceInfo = await wx.getDeviceInfo();
    //console.log('设备信息：', deviceInfo);
    const deviceModel = deviceInfo.model;
    
    // 获取高度信息
    const location = await wx.getLocation({
      type: 'wgs84',
      altitude: true
    });
    const altitude = location.altitude || 0;
    
    // 构造APRS数据包
    const aprsPacket = this.formatAprsPacket(callSign, latitude, longitude, altitude, deviceModel);
    
    try {
      await this.tcpClient.send(aprsPacket);
      this.setData({
        status: '位置已发送'
      });
    } catch (err) {
      console.error('发送APRS位置失败:', err);
      this.setData({
        status: '发送失败'
      });
    }
    
    // 2秒后清除状态
    setTimeout(() => {
      this.setData({
        status: ''
      });
    }, 2000);
  },
  
  formatAprsPacket(callSign, lat, lon, altitude, deviceModel) {
    // 格式化APRS数据包
    const latStr = this.decToAprs(lat, true);
    const lonStr = this.decToAprs(lon, false);
    return `${callSign}-5>APRS,TCPIP*:!${latStr}/${lonStr}[A${altitude.toFixed(0)} ${deviceModel}@NRL微信小程序\n`;
  },
  
  decToAprs(dec, isLat) {
    // 十进制转APRS格式
    const dir = dec >= 0 ? (isLat ? 'N' : 'E') : (isLat ? 'S' : 'W');
    dec = Math.abs(dec);
    
    const deg = Math.floor(dec);
    const min = (dec - deg) * 60;
    
    return `${deg.toString().padStart(2, '0')}${min.toFixed(2).padStart(5, '0')}${dir}`;
  },
  
  handleTcpMessage(res) {
    // const decoder = new TextDecoder('utf-8');
    // const message = decoder.decode(res.message);
    //console.log('收到TCP消息:', message);
    this.setData({
      status: '收到服务器响应'
    });
    
    // 2秒后清除状态
    setTimeout(() => {
      this.setData({
        status: ''
      });
    }, 2000);
  }
})
