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
    currentCall: {
    },
    currentGroup: null,
    mdcPacket: null,
    callHistory: [], // Array to store call history
    lastCallUpdate: 0, // Timestamp of last call update
    lastMessageTime: null,
    lastCallsign: null,
    activeCall: null // Current active call
  },


  async onLoad() {

    const app = getApp();

    this.setData({
      userInfo: app.globalData.userInfo,
      startTime: Date.now(),


    })




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
      app.globalData.mdcPacket = g711.g711Encode(mdcPacket);
    } catch (error) {
      console.error('MDC1200 encoding error:', error);
      this.mdcPacket = new Uint8Array(512);
    }


    wx.setKeepScreenOn({
      keepScreenOn: true, // 设置屏幕常亮
      success() {
        console.log("Screen will stay on.");
      },
      fail(err) {
        console.error("Failed to keep screen on:", err);
      }
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


    audio.initWebAudio()

    this.refreshData()


  },

  onUnload() {
    // const app = getApp();
    // app.unregisterPage(this);
    // app.globalData.onCurrentGroupChange = null;

    // if (this.connectionCheckTimer) {
    //   clearInterval(this.connectionCheckTimer);
    // }
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


    // groupsRes.items = Object.assign(
    //   {
    //     0: { id: 0, name: "公共大厅" },
    //     1: { id: 1, name: "私人房间1" },
    //     2: { id: 2, name: "私人房间2" },
    //     3: { id: 3, name: "私人房间3" }
    //   },
    //   groupsRes.items || {}
    // );

    // const devices = Object.values(devicesRes.items || {});
    // const groups = Object.values(groupsRes.items || {});
    //const hexCpuid = nrl21.cpuIdToHex(app.globalData.cpuId);

    const currentDevice = devices.find(device => device.callsign === app.globalData.userInfo.callsign && device.ssid === 100)

    let currentGroup = null;

    if (currentDevice) {
      currentGroup = groups.find(group => group.id === currentDevice.group_id);
    }

    app.globalData.currentGroup = currentGroup || null;
    app.globalData.currentDevice = currentDevice || null;
    //app.globalData.availableGroups = groups;
    //app.globalData.availableDevices = devices;

    app.globalData.onGroupChange = (newGroup) => {
      this.setData({
        currentGroup: newGroup?.name || '未加入群组'
      });
    };

    this.setData({
      currentGroup: currentGroup ? currentGroup.name : '未加入群组'
    });

    //await this.getGroupList();
    // this.setData({ groups,devices });
    //await this.getDeviceList();
    //this.getCurrentGroup();
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

    // 根据消息类型分发
    switch (packet.type) {
      case 1: // 语音消息

        audio.play(packet.data, packet.type);

        if (((this.data.currentCall.CallSign !== packet.callSign
          && this.data.currentCall.SSID !== packet.ssid)
          && this.data.currentCall.CallSign
        ) || (Date.now() - this.data.lastMessageTime > 3000 && this.data.currentCall.CallSign)) {

          console.log("new call",Date.now() - this.data.lastMessageTime > 3000,this.data.currentCall.CallSign,this.data.currentCall.SSID)

          const item = {
            CallSign: this.data.currentCall.CallSign,
            SSID: this.data.currentCall.SSID,
            duration: this.data.currentCall.duration,
            endTime: this.formatLastVoiceTime(this.data.lastMessageTime),
          };

          const currentItems = this.data.callHistory;
          currentItems.unshift(item);

          this.setData({
            callHistory: currentItems,
            currentCall: {

              startTime: Date.now(),

            },

          });


        }

        this.setData({
          currentCall: {
            CallSign: packet.callSign || '未知',
            SSID: packet.ssid || '00',
            duration: (this.data.lastMessageTime - this.data.currentCall.startTime) / 1000 | 0,
            lastVoiceTime: this.formatLastVoiceTime(this.data.lastMessageTime),
            startTime: this.data.lastCallsign !== packet.callSign + packet.ssid ? Date.now() : this.data.currentCall.startTime

          },
          lastMessageTime: Date.now(),
          lastCallsign: packet.callSign + packet.ssid
        });

        //console.log(this.data.currentCall,this.data.lastMessageTime ,this.data.currentCall.startTime)




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
