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

    // 保持屏幕常亮
    wx.setKeepScreenOn({
      keepScreenOn: true
    });



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

    // 预创建并缓存数据包实例
    const heartbeatPacket = nrl21.createPacket({
      type: 2,
      callSign: this.data.userInfo.callSign,
      cpuId: this.data.cpuid
    });

    this.heartbeatPacket = heartbeatPacket.getBuffer();

    // 预创建并缓存音频包实例
    const audioPacket = nrl21.createPacket({
      type: 1,
      callSign: this.data.userInfo.callSign,
      cpuId: this.data.cpuid,
    });


    const  audioPacketHead = new  Uint8Array(audioPacket.getBuffer());

    this.audioPacket = new Uint8Array(560);
    this.audioPacket.set(audioPacketHead,0)

    console.log('音频包实例创建成功', this.audioPacket,audioPacketHead)





    // 获取设备列表和群组列表
    let [devicesRes, groupsRes] = await Promise.all([
      api.getDeviceList(),
      api.getGroupList()
    ]);

    console.log('设备列表和群组列表获取成功', groupsRes)

    // 添加3个私人房间到设备对象
    groupsRes.items = Object.assign(
      {
        1: { id: 1, name: "私人房间1" },
        2: { id: 2, name: "私人房间2" },
        3: { id: 3, name: "私人房间3" }
      },
      groupsRes.items || {}
    );

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

    // 初始化UDP连接
    if (!this.udpClient) {
      this.initUDP();
    }

    // 启动心跳定时器
    if (!this.heartbeatTimer) {
      this.heartbeatTimer = this.startHeartbeat();
      console.log('心跳定时器已启动');
    }

    // 启动连接检查定时器
    if (!this.connectionCheckTimer) {
      this.connectionCheckTimer = setInterval(this.checkConnection.bind(this), 1000);
      console.log('连接检查定时器已启动');
    }
  },

  onUnload() {
    // const app = getApp();
    // // 注销当前页面实例
    // app.unregisterPage(this);
    // // 移除监听
    // app.globalData.onCurrentGroupChange = null;

    // if (this.heartbeatTimer) {
    //   clearInterval(this.heartbeatTimer);
    // }
    // if (this.connectionCheckTimer) {
    //   clearInterval(this.connectionCheckTimer);
    // }
    // // if (this.udpClient) {
    // //   this.udpClient.close();
    // // }
  },

  onShow() {
    // 重新初始化UDP连接
    // 初始化UDP连接
    if (!this.udpClient) {
      this.initUDP();
    }

    // 如果心跳定时器不存在，则创建
    if (!this.heartbeatTimer) {
      this.heartbeatTimer = this.startHeartbeat();
    }

    // 检查连接状态
    this.checkConnection();
  },

  initUDP() {
    this.udpClient = new udp.UDPClient({
      host: this.data.server,
      port: this.data.port,
      onMessage: this.handleMessage.bind(this)
    });
  },

  startHeartbeat() {
    return setInterval(() => {
      this.udpClient.send(this.heartbeatPacket);
    }, 2000);
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

    // 防止重复触发
    if (this.data.isTalking) {
      return;
    }

    try {
      await this.checkAudioPermission();
    } catch (err) {
      wx.showToast({
        title: '麦克风权限被拒绝',
        icon: 'none'
      });
      return;
    }




    // 设置状态并启动录音
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

        try {

          const data = await this.recorder.getNextAudioFrame();

        

          if (!data) continue;

          // 将新数据加入缓冲区
          const newBuffer = new Uint8Array(buffer.length + data.length);
          newBuffer.set(buffer);
          newBuffer.set(new Uint8Array(data), buffer.length);
          buffer = newBuffer;

          // 当缓冲区达到128字节时发送
          while (buffer.length >= 512) {
           
            const packetData = buffer.slice(0, 512);
            buffer = buffer.slice(512);

        

            // 使用预创建的音频包实例
            this.audioPacket.set(packetData,48)

            //const packet =

            // const packet = {
            //   ... new Uint8Array(this.audioPacket),
            //   data: packetData
            // };

            console.log('处理音频数据', this.audioPacket)



            this.udpClient.send(this.audioPacket);
          }
        } catch (err) {
          console.error('音频处理出错:', err);
          break;
        }
      }

      // 发送剩余数据
      if (buffer.length > 0) {
      console.log('剩余数据未发送:', buffer)
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


  decodedata(data) {
    //console.log('收到数据', data)
    const byteArray = new Uint8Array(data);

    // 使用 TextDecoder 将 Uint8Array 转换为字符串
    const callSignStr = String.fromCharCode.apply(null, byteArray.slice(24, 30));
  
    return {
      type: byteArray[20],
      callSign: callSignStr, // 转换为字符串
      ssid: byteArray[30],
      data: byteArray.slice(48),
    };
  },

  handleMessage(data) {
    const packet = this.decodedata(data);

    console.log('收到数据', packet) 

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
    const now = Date.now();
    // 如果超过6秒没有收到心跳响应，或者UDP连接异常
    if ((this.data.lastHeartbeatTime && now - this.data.lastHeartbeatTime > 6000) ||
      !this.udpClient || !this.udpClient.socket) {
      this.setData({ serverConnected: false });
      // 尝试重新初始化UDP连接
      this.initUDP();
    }
  },

  // 切换音频输出设备
  changeAudioOutput(e) {
    const output = e.detail.value;

    // 先停止所有音频播放
    wx.stopVoice();

    // 创建新的音频上下文
    const audioContext = wx.createInnerAudioContext();

    // 设置音频输出模式
    if (output === 'bluetooth') {
      audioContext.obeyMuteSwitch = false;
      audioContext.useSpeaker = false;
    } else {
      // 强制使用扬声器
      audioContext.obeyMuteSwitch = false;
      audioContext.useSpeaker = true;
      // 额外设置系统音频路由
      wx.setInnerAudioOption({
        obeyMuteSwitch: false,
        speakerOn: true
      });
    }

    // 设置音频源
    audioContext.src = '/audio/beep.mp3';

    // 播放前准备
    audioContext.onCanplay(() => {
      // 确保音频输出模式已设置
      setTimeout(() => {
        audioContext.play();
      }, 100);
    });

    // 错误处理
    audioContext.onError((err) => {
      console.error('音频播放错误:', err);
      wx.showToast({
        title: '音频切换失败',
        icon: 'none'
      });
      audioContext.destroy();
    });

    // 播放完成处理
    audioContext.onEnded(() => {
      audioContext.destroy();
      wx.showToast({
        title: `已切换至${output === 'speaker' ? '扬声器' : output === 'bluetooth' ? '蓝牙' : '听筒'}`,
        icon: 'none'
      });
    });
  }
});
