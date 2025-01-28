import * as udp from '../../utils/udp';
import * as audio from '../../utils/audio';
import * as nrl21 from '../../utils/nrl21';
import * as api from '../../utils/api';
import * as mdc from '../../utils/mdc1200';

Page({
  data: {
    userInfo: {},
    isTalking: false,
    codec: 'g711',
    server: getApp().globalData.serverConfig.host,
    port: getApp().globalData.serverConfig.port,
    serverConnected: false,
    currentCall: {},
    currentGroup: null,
    mdcPacket: null
  },


  async onLoad() {

    const app = getApp();

    this.setData({
      userInfo: app.globalData.userInfo,
    }

    )

    app.registerPage(this);




    console.log("app", app)
    // const callSign = app.globalData.userInfo.callsign || 'UNKNOWN';
    // const cpuid = nrl21.calculateCpuId(callSign);

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
      app.globalData.mdcPacket = audio.g711Encode(mdcPacket);
    } catch (error) {
      console.error('MDC1200 encoding error:', error);
      this.mdcPacket = new Uint8Array(512);
    }

    wx.setKeepScreenOn({
      keepScreenOn: true
    });

    // 初始化udpClient




    // 预创建音频包实例
    const audioPacket = nrl21.createPacket({
      type: 1,
      callSign: app.globalData.userInfo.callsign,
      cpuId: app.globalData.cpuId
    });

    const audioPacketHead = new Uint8Array(audioPacket.getBuffer());
    this.audioPacket = new Uint8Array(560);
    this.audioPacket.set(audioPacketHead, 0);

    let [devicesRes, groupsRes] = await Promise.all([
      api.getDeviceList(),
      api.getGroupList()
    ]);

    groupsRes.items = Object.assign(
      {
        1: { id: 1, name: "私人房间1" },
        2: { id: 2, name: "私人房间2" },
        3: { id: 3, name: "私人房间3" }
      },
      groupsRes.items || {}
    );

    const devices = Object.values(devicesRes.items || {});
    const groups = Object.values(groupsRes.items || {});
    const hexCpuid = nrl21.cpuIdToHex(app.globalData.cpuId);

    const currentDevice = devices.find(device => device.cpuid === hexCpuid);
    let currentGroup = null;

    if (currentDevice) {
      currentGroup = groups.find(group => group.id === currentDevice.group_id);
    }

    app.globalData.currentGroup = currentGroup || null;
    app.globalData.currentDevice = currentDevice || null;
    app.globalData.availableGroups = groups;
    app.globalData.availableDevices = devices;

    app.globalData.onGroupChange = (newGroup) => {
      this.setData({
        currentGroup: newGroup?.name || '未加入群组'
      });
    };

    this.setData({
      currentGroup: currentGroup ? currentGroup.name : '未加入群组'
    });
  },

  onUnload() {
    const app = getApp();
    app.unregisterPage(this);
    app.globalData.onCurrentGroupChange = null;

    if (this.connectionCheckTimer) {
      clearInterval(this.connectionCheckTimer);
    }
  },

  onShow() {
    this.checkConnection();
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
        app.globalData.udpClient.send(this.heartbeatPacket);      
    }, 2000);
  },

  // // 停止心跳定时器
  // stopHeartbeat() {
  //   if (this.heartbeatTimer) {
  //     clearInterval(this.heartbeatTimer);
  //     this.heartbeatTimer = null;
  //   }
  // },

  handleMessage(data) {
    const packet = nrl21.decodePacket(data);
    const now = Date.now();
    this.lastMessageTime = now;

    // 根据消息类型分发
    switch (packet.type) {
      case 1: // 语音消息,心跳，读参数


        audio.play(packet.data, packet.type);
        this.setData({
          currentCall: {
            CallSign: packet.callSign || '未知',
            SSID: packet.ssid || '00'
          },
          serverConnected: true
        });

        break;
      // case 2: // 心跳包

      //   break;
      case 5: // 文本消息
        const app = getApp();

        if (app.globalData.messagePage) {

          app.globalData.messagePage.handleMessage(packet);
        }
        break;
    }

    this.setData({
      serverConnected: true
    });

  },

  checkConnection() {
    const now = Date.now();
    if (this.lastMessageTime && now - this.lastMessageTime > 6000) {
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
      const deviceInfo = await wx.getDeviceInfo();

     
      // if (!deviceInfo || !deviceInfo.microphoneSupported) {
      //   wx.showToast({
      //     title: '当前设备不支持录音',
      //     icon: 'none'
      //   });
      //   throw new Error('设备不支持录音');
      // }

      // 检查录音权限状态
      const authSetting = await wx.getAppAuthorizeSetting();

      console.log('###设备信息：', authSetting);

      if (authSetting['microphoneAuthorized'] !== "authorized") {
        wx.showToast({
          title: '录音权限被拒绝，请前往设置开启',
          icon: 'none'
        });
        throw new Error('录音权限被拒绝');
      }

      // 请求录音权限
      await wx.authorize({
        scope: 'scope.record'
      });
    
      return true;
    } catch (err) {
      wx.showToast({
        title: '获取麦克风权限失败',
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

    wx.setKeepScreenOn({
      keepScreenOn: true
    });

    const processAudio = async () => {
      let buffer = new Uint8Array(0);
      let encodedBuffer = new Uint8Array(512);

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
            getApp().globalData.udpClient.send(this.audioPacket);
          }
        } catch (err) {
          console.error('音频处理出错:', err);
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
        audio.stopRecording(this.recorder);
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
        getApp().globalData.udpClient.send(this.audioPacket);
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

  changeAudioOutput(e) {
    const output = e.detail.value;
    wx.stopVoice();

    const audioContext = wx.createInnerAudioContext({
      useWebAudioImplement: true // 是否使用 WebAudio 作为底层音频驱动，默认关闭。对于短音频、播放频繁的音频建议开启此选项，开启后将获得更优的性能表现。由于开启此选项后也会带来一定的内存增长，因此对于长音频建议关闭此选项
    });

    if (output === 'bluetooth') {
      audioContext.obeyMuteSwitch = false;
      audioContext.useSpeaker = false;
    } else {
      audioContext.obeyMuteSwitch = false;
      audioContext.useSpeaker = true;
      wx.setInnerAudioOption({
        obeyMuteSwitch: false,
        speakerOn: true
      });
    }

    audioContext.src = '/audio/beep.mp3';

    audioContext.onCanplay(() => {
      setTimeout(() => {
        audioContext.play();
      }, 100);
    });

    audioContext.onError((err) => {
      console.error('音频播放错误:', err);
      wx.showToast({
        title: '音频切换失败',
        icon: 'none'
      });
      audioContext.destroy();
    });

    audioContext.onEnded(() => {
      audioContext.destroy();
      wx.showToast({
        title: `已切换至${output === 'speaker' ? '扬声器' : output === 'bluetooth' ? '蓝牙' : '听筒'}`,
        icon: 'none'
      });
    });
  }
});
