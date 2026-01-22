import * as udp from '../../utils/udp';
import * as audio from '../../utils/audioPlayer';
import * as recoder from '../../utils/audioRecoder';
import * as g711 from '../../utils/audioG711';
import * as nrl21 from '../../utils/nrl21';
import * as mdc from '../../utils/mdc1200';
const { updateAvatar } = require('../../utils/api')


const app = getApp();

let qthmap = {}

Page({
  data: {
    userInfo: {},
    isTalking: false,
    codec: 'g711',
    server: app.globalData.serverConfig.host,
    port: app.globalData.serverConfig.port,
    serverConnected: false,
    showList: false,
    thanksItems: [
      '感谢：',
      'BG6FCS BH4TIH',
      'BA4RN  BA1GM',
      'BA4QEK BA4QAO',
      'BD4VKI BH4VAP',
      'BH4TDV BI4UMD',
      'BA4QGT BG8EJT',
      'BH1OSW BD4RFG',
      '还有很多，列表放不下了'


    ], // 测试数据

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

    console.log('onLoad-voice')
    this.setData({
      userInfo: app.globalData.userInfo,
      callHistory: app.globalData.callHistory.reverse(),
      startTime: Date.now(),
      server: app.globalData.serverConfig
    })

    app.registerPage(this);



    const currentDevice = await app.globalData.getDevice(app.globalData.userInfo.callsign, 100)
    app.globalData.currentDevice = currentDevice

    //console.log("mdcConfig",currentDevice.id,parseInt(currentDevice.id))



    try {
      this.mdcEncoder = new mdc.MDC1200Encoder();
      //console.log("mdc:",this.mdcEncoder,mdcConfig)
      this.mdcEncoder.setPreamble(10);
      // this.mdcEncoder.encodeSinglePacket(
      //   mdcConfig.op,
      //   mdcConfig.arg,
      //   mdcConfig.unitId
      // ); 

      //  this.mdcEncoder.setDoublePacket(0x01, 0x00,parseInt(currentDevice.id), 0x11, 0x22, 0x33, 0x44)
      //this.mdcEncoder.setDoublePacket(0x01, 0x80,parseInt(currentDevice.id), 0x11, 0x22, 0x33, 0x44)

      this.mdcEncoder.setPacket(0x01, 0x00, parseInt(currentDevice.id))


      const samples = this.mdcEncoder.getSamples();
      app.globalData.mdcPacket = g711.MDC2g711Encode(samples);
    } catch (error) {
      console.error('MDC1200 encoding error:', error);
      this.mdcPacket = new Uint8Array(500);
    }

    // 预创建音频包实例
    const audioPacket = nrl21.createPacket({
      type: 1,
      callSign: app.globalData.userInfo.callsign,

    });

    const audioPacketHead = new Uint8Array(audioPacket.getBuffer());
    this.audioPacket = new Uint8Array(548);
    this.audioPacket.set(audioPacketHead, 0);

    qthmap = await app.globalData.getQTH()
    //console.log("qthmap",qthmap)

    //this.refreshData()

    audio.initWebAudio()
    audio.resume()



    const heartbeatPacket = nrl21.createPacket({
      type: 2,
      callSign: app.globalData.userInfo.callsign,

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
    }, 2000);






  },

  onUnload() {

    console.log("voice page onUnload.");

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

    this.refreshData()
    this.checkConnection();
  },

  async refreshData() {
    const currentDevice = await app.globalData.getDevice(app.globalData.userInfo.callsign, 100)
    app.globalData.currentDevice = currentDevice

    //console.log("currentDevice",currentDevice)

    let currentGroup = await app.globalData.getGroup(currentDevice?.group_id)

    this.setData({
      currentGroup: currentGroup ? currentGroup.name : '未加入群组'
    });
  },

  showThanksList() {
    console.log('showList before toggle:', this.data.showList);
    this.setData({
      showList: !this.data.showList
    });
    console.log('showList after toggle:', this.data.showList);
  },

  // getCurrentGroup() {
  //   const currentGroup = app.globalData.currentGroup?.name || '未加入群组';
  //   this.setData({ currentGroup });
  //   return currentGroup;
  // },

  // 启动心跳定时器
  startHeartbeat() {
    if (app.globalData.heartbeatTimer) {
      return;
    }

    app.globalData.heartbeatTimer = setInterval(() => {
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

          const qth = qthmap[this.data.CallSign + '-' + this.data.SSID]

          const item = {
            CallSign: this.data.CallSign,
            SSID: this.data.SSID,
            DMRID: this.data.DMRID,
            QTH: qth ? qth.qth + "\n" + qth.name : '无数据',
            startTime: this.formatLastVoiceTime(this.data.startTime),
            duration: this.data.duration,
            endTime: this.formatLastVoiceTime(this.data.lastVoiceTime),
          };

          app.globalData.callHistory = app.globalData.callHistory.slice(-30)
          app.globalData.callHistory.push(item)

          this.setData({
            callHistory: [...app.globalData.callHistory].reverse(),
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
            DMRID: packet.dmrid || '',
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
        if (app.globalData.messagePage) {
          app.globalData.messagePage.handleMessage(packet);
        }
        break;
    }
  },

  onChooseAvatar(e) {
    const { avatarUrl } = e.detail
    app.globalData.userInfo.avatar = avatarUrl
    this.setData({
      userInfo: app.globalData.userInfo
    })



    updateAvatar(app.globalData.userInfo).then((res) => {
      console.log(res);
      wx.hideLoading();
      wx.showToast({
        title: '修改完成',
        showCancel: false,
        confirmText: '确定',
        success: (res) => {

        }
      });
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({
        title: err.message || '修改失败',
        icon: 'none'
      });
    });

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
      const authSetting = await wx.getAppAuthorizeSetting();
      console.log('设备信息：', authSetting)

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
      console.log(err)
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

    const processAudio = async () => {
      let buffer = new Uint8Array(0);
      let encodedBuffer = true

      console.log('开始处理音频', this.recorder)

      while (this.data.isTalking) {
        try {
          const data = await this.recorder.getNextAudioFrame();

          if (!data) continue;

          const newBuffer = new Uint8Array(buffer.length + data.length);
          newBuffer.set(buffer);
          newBuffer.set(new Uint8Array(data), buffer.length);
          buffer = newBuffer;

          while (buffer.length >= 500) {
            const packetData = buffer.slice(0, 500);
            buffer = buffer.slice(500);
            this.audioPacket.set(packetData, 48);

            if (app.globalData.udpClient) {
              await new Promise(resolve => {
                app.globalData.udpClient.send(this.audioPacket);
                setTimeout(resolve, 55);
              });
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

      const mdcPacket = app.globalData.mdcPacket;

      const packetSize = 500;
      const totalPackets = Math.ceil(mdcPacket.length / packetSize);

      for (let i = 0; i < totalPackets; i++) {
        const start = i * packetSize;
        const end = Math.min(start + packetSize, mdcPacket.length);
        const chunk = mdcPacket.slice(start, end);

        this.audioPacket.set(chunk, 48);

        if (app.globalData.udpClient) {
          await new Promise(resolve => {
            app.globalData.udpClient.send(this.audioPacket);
            setTimeout(resolve, 62);
          });
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
  toggleTalk() {
    if (this.data.isTalking) {
      this.stopRecording();
      const item = {
        CallSign: app.globalData.currentDevice.callsign,
        SSID: app.globalData.currentDevice.ssid,
        Name: '微信小程序',
        duration: (Date.now() - app.globalData.recoderStartTime) / 1000 + 1 | 0,
        endTime: this.formatLastVoiceTime(Date.now()),
      };

      app.globalData.callHistory = app.globalData.callHistory.slice(-30)
      app.globalData.callHistory.push(item)

      this.setData({
        callHistory: [...app.globalData.callHistory].reverse(),
      });
    } else {
      this.startRecording();
      app.globalData.recoderStartTime = Date.now()
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
