const udp = require('../../utils/udp');
const audio = require('../../utils/audio');
const nrl21 = require('../../utils/nrl21');
const api = require('../../utils/api');

Page({
  data: {
    userInfo: {},
    isTalking: false,
    codec: 'g711',
    server: 'nrlptt.com',
    port: 60050,
    serverConnected: false,
    lastHeartbeatTime: null,
    cpuid: '',
    currentCall: {},
    currentGroup: null // 当前群组
  },

  // 获取当前群组信息
  getCurrentGroup() {
    const app = getApp();
    const currentGroup = app.globalData.currentGroup?.name || '未加入群组';
    this.setData({ currentGroup });
    return currentGroup;
  },

  async onLoad() {
    const app = getApp();
    // 注册当前页面实例
    app.registerPage(this);
    
    const userInfo = wx.getStorageSync('userInfo') || {};

    const callSign = userInfo.callsign || 'UNKNOWN';
    const cpuid = nrl21.calculateCpuId(callSign);

    // 将cpuid存储到全局
    app.globalData.cpuid = cpuid;
    
    this.setData({
      userInfo: {
        ...userInfo,
        callSign
      },
      cpuid
    });

    // 获取设备列表和群组列表
    const [devicesRes, groupsRes] = await Promise.all([
      api.getDeviceList(),
      api.getGroupList()
    ]);
    
    // 转换API返回的数据结构
    const devices = Object.values(devicesRes.items || {});
    const groups = Object.values(groupsRes.items || {});
    
    // 将cpuid转换为16进制字符串
    const hexCpuid = parseInt(this.data.cpuid).toString(16).toUpperCase();
    
    // 通过cpuid找到当前设备
    const currentDevice = devices.find(device => device.cpuid === hexCpuid);
    let currentGroup = null;
    
    if (currentDevice) {
      // 通过group_id找到对应群组
      currentGroup = groups.find(group => group.id === currentDevice.group_id);
    }
    
    // 更新全局数据
    app.globalData.currentGroup = currentGroup || null;
    app.globalData.currentDevice = currentDevice || null;
    app.globalData.availableGroups = groups;
    app.globalData.availableDevices = devices;
    
    // 监听群组变化
    app.globalData.onGroupChange = (newGroup) => {
      console.log('群组变化监听触发，更新页面');
      this.setData({
        currentGroup: newGroup?.name || '未加入群组'
      });
    };
    
    // 更新页面显示
    this.setData({
      currentGroup: currentGroup ? currentGroup.name : '未加入群组'
    });
  
    this.initUDP();
    this.heartbeatTimer = this.startHeartbeat();
    this.connectionCheckTimer = setInterval(this.checkConnection.bind(this), 1000);
  },

  onUnload() {
    const app = getApp();
    // 注销当前页面实例
    app.unregisterPage(this);
    // 移除监听
    app.globalData.onCurrentGroupChange = null;
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    if (this.connectionCheckTimer) {
      clearInterval(this.connectionCheckTimer);
    }
    if (this.udpClient) {
      this.udpClient.close();
    }
  },

  initUDP() {
    this.udpClient = new udp.UDPClient({
      host: this.data.server,
      port: this.data.port,
      onMessage: this.handleMessage.bind(this)
    });
  },

  startHeartbeat() {
    const packet = nrl21.createHeartbeatPacket({
      callSign: this.data.userInfo.callSign,
      cpuId: this.data.cpuid
    });

    return setInterval(() => {
      this.udpClient.send(packet);
    }, 5000);
  },

  changeCodec(e) {
    this.setData({ codec: e.detail.value });
  },

  async checkAudioPermission() {
    const res = await wx.getSetting({});
    if (!res.authSetting['scope.record']) {
      await wx.authorize({
        scope: 'scope.record'
      });
    }
    return true;
  },

  async startRecording() {
    try {
      await this.checkAudioPermission();
    } catch (err) {
      wx.showToast({
        title: '麦克风权限被拒绝',
        icon: 'none'
      });
      return;
    }

    this.setData({ isTalking: true });
    try {
      this.recorder = await audio.startRecording(this.data.codec);
    } catch (err) {
      wx.showToast({
        title: '录音启动失败',
        icon: 'none'
      });
      this.setData({ isTalking: false });
      return;
    }

    // 请求保持屏幕常亮
    wx.setKeepScreenOn({
      keepScreenOn: true
    });

    // 实时处理音频数据
    const processAudio = async () => {
      let buffer = new Uint8Array(0);
      
      while (this.data.isTalking) {
        const data = await this.recorder.getNextAudioFrame();
        if (!data) continue;

        // 将新数据加入缓冲区
        const newBuffer = new Uint8Array(buffer.length + data.length);
        newBuffer.set(buffer);
        newBuffer.set(new Uint8Array(data), buffer.length);
        buffer = newBuffer;

        // 当缓冲区达到100字节时发送
        while (buffer.length >= 512) {
          const packetData = buffer.slice(0, 512);
          buffer = buffer.slice(512);      

          const packet = nrl21.createAudioPacket({
            callSign: this.data.userInfo.callSign,
            cpuId: this.data.cpuid,
            type: this.data.codec === 'g711' ? 1 : 8,
            data: packetData
          });
        
          
          this.udpClient.send(packet);
        }
      }

      // 发送剩余数据
      if (buffer.length > 0) {
        const packet = nrl21.createAudioPacket({
          callSign: this.data.userInfo.callSign,
          cpuid: this.data.cpuid,
          type: this.data.codec === 'g711' ? 1 : 8,
          data: buffer
        });
        this.udpClient.send(packet);
      }
    };

    this.audioProcessor = processAudio();
  },

  async stopRecording() {
    this.setData({ isTalking: false });
    try {
      if (this.audioProcessor) {
        await this.audioProcessor; // 等待处理完成
      }
      if (this.recorder) {
        audio.stopRecording(this.recorder);
      }
    } catch (err) {
      console.error('停止录音失败:', err);
      wx.showToast({
        title: '停止录音失败',
        icon: 'none'
      });
    } finally {
      this.recorder = null;
      this.audioProcessor = null;
    }
  },

  handleMessage(data) {
    const packet = nrl21.decode(data);

    if (packet.type === 1 || packet.type === 8) {
      audio.play(packet.data, packet.type);
      // 更新通话页面显示
      this.setData({
        currentCall: {
          CallSign: packet.callSign || '未知',
          SSID: packet.ssid || '00'
        },
        serverConnected: true,
        lastHeartbeatTime: Date.now()
      });
    } else {
      // 更新服务器连接状态
      this.setData({
        serverConnected: true,
        lastHeartbeatTime: Date.now()
      });
    }
  },

  checkConnection() {
    if (this.data.lastHeartbeatTime &&
      Date.now() - this.data.lastHeartbeatTime > 15000) {
      this.setData({ serverConnected: false });
    }
  }
});
