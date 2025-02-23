import * as udp from '../../utils/udp';
import * as audio from '../../utils/audioPlayer';
import * as recoder from '../../utils/audioRecoder';
import * as g711 from '../../utils/audioG711';
import * as nrl21 from '../../utils/nrl21';
import * as mdc from '../../utils/mdc1200';

Page({
  data: {
    userInfo: {},
    isTalking: false,
    codec: 'g711',
    server: getApp().globalData.serverConfig.host,
    port: getApp().globalData.serverConfig.port,
    serverConnected: false,


    currentGroup: null,
    mdcPacket: null,
    callHistory: [], // Array to store call history
    lastCallUpdate: 0, // Timestamp of last call update
    lastMessageTime: null,
    lastVoiceTime: null,
    lastVoiceDisplayTime: null,
    lastCallsign: null,
    CallSign: null,
    SSID: null,
    duration: null,
    startTime: null,
    activeCall: null // Current active call
  },


  async onLoad() {

    const app = getApp();

    this.setData({
      userInfo: app.globalData.userInfo,
      startTime: Date.now(),
    })

    app.registerPage(this);

    const heartbeatPacket = nrl21.createPacket({
      type: 2,
      callSign: app.globalData.userInfo.callsign,
      cpuId: app.globalData.cpuId
    });

    this.heartbeatPacket = heartbeatPacket.getBuffer();
    app.globalData.udpClient = new udp.UDPClient({
      host: app.globalData.serverConfig.host,
      port: app.globalData.serverConfig.port,

      onMessage: this.handleMessage.bind(this)

    });

    // 启动心跳定时器
    this.startHeartbeat();

    // 初始化连接检查定时器
    this.connectionCheckTimer = setInterval(() => {
      this.checkConnection();
    }, 1000);

    // MDC1200配置
    const mdcConfig = app.globalData.mdcConfig || {
      op: 0x01,
      arg: 0x80,
      unitId: parseInt(this.data.cpuid)
    };

    this.mdcEncoder = new mdc.MDC1200Encoder();

    try {
      const mdcPacket = this.mdcEncoder.encodeSinglePacket(
        mdcConfig.op,
        mdcConfig.arg,
        mdcConfig.unitId
      );
      app.globalData.mdcPacket = g711.g711Encode(mdcPacket);
    } catch (error) {
      console.error('MDC1200 encoding error:', error);
      this.mdcPacket = new Uint8Array(512);
    }





    // 预创建音频包实例
    const audioPacket = nrl21.createPacket({
      type: 1,
      callSign: app.globalData.userInfo.callsign,
      cpuId: app.globalData.cpuId
    });

    const audioPacketHead = new Uint8Array(audioPacket.getBuffer());
    this.audioPacket = new Uint8Array(560);
    this.audioPacket.set(audioPacketHead, 0);




    this.refreshData()

    audio.initWebAudio()


  },

  onUnload() {

  },

  onShow() {

    wx.setKeepScreenOn({
      keepScreenOn: true, // 设置屏幕常亮
      success() {
        console.log("Screen will stay on.");
      },
      fail(err) {
        console.error("Failed to keep screen on:", err);
      }
    });



    this.checkConnection();
    this.getCurrentGroup();

  },

  async refreshData() {

    const app = getApp();

    await app.globalData.getGroupList()
    await app.globalData.getDeviceList()

    const groups = app.globalData.availableGroups
    const devices = app.globalData.availableDevices

    const currentDevice = devices.find(device => device.callsign === app.globalData.userInfo.callsign && device.ssid === 100)

    let currentGroup = null;

    if (currentDevice) {
      currentGroup = groups.find(group => group.id === currentDevice.group_id);
    }

    app.globalData.currentGroup = currentGroup || null;
    app.globalData.currentDevice = currentDevice || null;

    app.globalData.onGroupChange = (newGroup) => {
      this.setData({
        currentGroup: newGroup?.name || '未加入群组'
      });
    };

    this.setData({
      currentGroup: currentGroup ? currentGroup.name : '未加入群组'
    });
  },

  getCurrentGroup() {
    const app = getApp();
    const currentGroup = app.globalData.currentGroup?.name || '未加入群组';
    this.setData({ currentGroup });
    return currentGroup;
  },


  // 启动心跳定时器
  startHeartbeat() {
    if (this.heartbeatTimer) {
      return;
    }

    const app = getApp();

    this.heartbeatTimer = setInterval(() => {
      if (app.globalData.udpClient) {
        app.globalData.udpClient.send(this.heartbeatPacket);
      }
    }, 2000);
  },



  handleMessage(data) {
    const packet = nrl21.decodePacket(data);

    // 根据消息类型分发
    switch (packet.type) {
      case 1: // 语音消息

        audio.play(packet.data, packet.type);

        if ((this.data.CallSign !== packet.callSign && this.data.CallSign)
          || (this.data.CallSign === packet.callSign && this.data.SSID !== packet.ssid && this.data.CallSign)
          || Date.now() - this.data.lastVoiceTime > 2000 && this.data.CallSign) {

          const currentDevice = getApp().globalData.availableDevices.find(device => device.callsign === this.data.CallSign && device.ssid === this.data.SSID)

          const item = {
            CallSign: this.data.CallSign,
            SSID: this.data.SSID,
            Name: currentDevice.name,
            duration: this.data.duration,
            endTime: this.formatLastVoiceTime(this.data.lastVoiceTime),
          };

          getApp().globalData.callHistory = getApp().globalData.callHistory.slice(-30)
          getApp().globalData.callHistory.push(item)

          this.setData({
            callHistory: [...getApp().globalData.callHistory].reverse(),
            startTime: Date.now(),
          });
        }

        this.setData({
          lastVoiceTime: Date.now(),        
        });

        if (this.data.lastCallsign !== packet.callSign + packet.ssid) {
          this.setData({
            startTime: Date.now(),    
            CallSign: packet.callSign || '未知',
            SSID: packet.ssid || '00',            
          });
        } 

        this.setData({
          duration: (this.data.lastVoiceTime - this.data.startTime) / 1000 + 1 | 0,
          lastVoiceDisplayTime: this.formatLastVoiceTime(this.data.lastVoiceTime),   
          lastCallsign: packet.callSign + packet.ssid
        });



        break;

      case 2: // 心跳包
        this.setData({
          lastMessageTime: Date.now(),
          serverConnected: true
        });
        break;

      case 5: // 文本消息
        const app = getApp();
        if (app.globalData.messagePage) {
          app.globalData.messagePage.handleMessage(packet);
        }
        break;
    }


  },


  checkConnection() {
    if (this.lastMessageTime && Date.now() - this.lastMessageTime > 6000) {
      this.setData({
        serverConnected: false
      });
    }
  },

  changeCodec(e) {
    this.setData({ codec: e.detail.value });
  },

  async checkAudioPermission() {
    try {
      // 获取设备信息
      //const deviceInfo = await wx.getDeviceInfo();


      // 检查录音权限状态
      const authSetting = await wx.getAppAuthorizeSetting();

      if (authSetting['microphoneAuthorized'] === true) {
        return true
      }

      if (authSetting['microphoneAuthorized'] !== "authorized") {
        wx.showToast({
          title: '录音权限被拒绝，请前往设置开启',
          icon: 'none'
        });
        throw new Error('录音权限被拒绝' + authSetting['microphoneAuthorized']);
      }

      // 请求录音权限
      await wx.authorize({
        scope: 'scope.record'
      });

      return true;
    } catch (err) {
      wx.showToast({
        title: '获取麦克风权限失败:' + err,
        icon: 'none'
      });
      throw err;
    }
  },

  async startRecording() {
    if (this.data.isTalking) {
      return;
    }

    try {
      await this.checkAudioPermission();
    } catch (err) {
      wx.showToast({
        title: '麦克风权限被拒绝:' + err,
        icon: 'none'
      });
      return;
    }

    this.setData({ isTalking: true });
    try {
      this.recorder = await recoder.startRecording(this.data.codec);
    } catch (err) {
      wx.showToast({
        title: '录音启动失败',
        icon: 'none'
      });
      this.setData({ isTalking: false });
      return;
    }

    wx.setKeepScreenOn({
      keepScreenOn: true
    });

    const processAudio = async () => {
      let buffer = new Uint8Array(0);
      let encodedBuffer = new Uint8Array(512);

      console.log('开始处理音频', this.recorder)

      while (this.data.isTalking) {
        try {
          const data = await this.recorder.getNextAudioFrame();

          if (!data) continue;

          const newBuffer = new Uint8Array(buffer.length + data.length);
          newBuffer.set(buffer);
          newBuffer.set(new Uint8Array(data), buffer.length);
          buffer = newBuffer;

          while (buffer.length >= 512) {

            const packetData = buffer.slice(0, 512);
            buffer = buffer.slice(512);
            this.audioPacket.set(packetData, 48);
            const app = getApp();

            if (app.globalData.udpClient) {
              app.globalData.udpClient.send(this.audioPacket);
            }
          }
        } catch (err) {
          console.error('音频处理出错:', err);
          wx.showToast({
            title: '音频处理出错' + err,
            icon: 'none'
          });
          break;
        }
      }

      if (buffer.length > 0) {
        console.log('剩余数据未发送:', buffer);
      }

      return encodedBuffer;
    };

    this.audioProcessor = processAudio();
  },

  async stopRecording() {
    this.setData({ isTalking: false });
    try {
      if (this.audioProcessor) {
        await this.audioProcessor;
      }
      if (this.recorder) {
        recoder.stopRecording(this.recorder);
      }

      const app = getApp();
      const mdcPacket = app.globalData.mdcPacket;

      const packetSize = 512;
      const totalPackets = Math.ceil(mdcPacket.length / packetSize);

      for (let i = 0; i < totalPackets; i++) {
        const start = i * packetSize;
        const end = Math.min(start + packetSize, mdcPacket.length);
        const chunk = mdcPacket.slice(start, end);

        this.audioPacket.set(chunk, 48);
        const app = getApp();
        if (app.globalData.udpClient) {
          app.globalData.udpClient.send(this.audioPacket);
        }
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

  // 点击切换通话状态
  // 点击切换通话状态
  toggleTalk() {
    if (this.data.isTalking) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  },

  // 长按开始通话，松开停止
  handleLongPress(e) {
    this.startRecording();
  },

  handleTouchEnd(e) {
    if (this.data.isTalking) {
      this.stopRecording();
    }
  },

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  },

  formatTime(timestamp) {
    const date = new Date(timestamp);
    return `${date.getHours()}:${date.getMinutes() < 10 ? '0' : ''}${date.getMinutes()}`;
  },

  formatLastVoiceTime(isoString) {
    const date = new Date(isoString);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
  }
});
