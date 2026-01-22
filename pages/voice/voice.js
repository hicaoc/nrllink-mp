import * as udp from '../../utils/udp';
import * as audio from '../../utils/audioPlayer';
import * as g711 from '../../utils/audioG711';
import * as nrl21 from '../../utils/nrl21';
import * as mdc from '../../utils/mdc1200';
import * as nrlHelpers from '../../utils/nrlHelpers';
import { VoiceService } from './voiceService';
import { RecorderService } from './recorderService';

const { updateAvatar, updateDevice } = require('../../utils/api');
const app = getApp();

Page({
  data: {
    userInfo: {},
    isTalking: false,
    codec: 'g711',
    serverConnected: false,
    showList: false,
    thanksItems: [
      '感谢：', 'BG6FCS BH4TIH', 'BA4RN  BA1GM', 'BA4QEK BA4QAO',
      'BD4VKI BH4VAP', 'BH4TDV BI4UMD', 'BA4QGT BG8EJT', 'BH1OSW BD4RFG',
      '还有很多，列表放不下了'
    ],
    currentGroup: null,
    onlineCount: 0,
    deviceCount: 0,
    serverConfig: {},
    chatLogs: [],
    lastMessageTime: null,
    lastVoiceTime: null,
    CallSign: null,
    SSID: null,
    duration: 0,
    startTime: null,
    inputText: '',
    scrollIntoView: '',
    isReceivingVoice: false,
    receivingBubbleWidth: 0,
    availableGroupsForPicker: [],
    currentPlayingId: null
  },

  async onLoad() {
    // Initialize Services
    this.voiceService = new VoiceService(this);
    this.recorderService = new RecorderService(this);

    this.setData({
      userInfo: app.globalData.userInfo,
      chatLogs: app.globalData.chatLogs,
      serverConfig: app.globalData.serverConfig,
      startTime: Date.now()
    });

    app.registerPage(this);

    // Setup MDC and Audio Packets
    await this.initMdcAndUdp();

    audio.initWebAudio();
    audio.resume();

    // Start background tasks
    this.startHeartbeat();
    this.connectionCheckTimer = setInterval(() => this.checkConnection(), 2000);
    this.loadAvailableGroups();
  },

  async initMdcAndUdp() {
    const currentDevice = await app.globalData.getDevice(app.globalData.userInfo.callsign, 100);
    app.globalData.currentDevice = currentDevice;

    try {
      this.mdcEncoder = new mdc.MDC1200Encoder();
      this.mdcEncoder.setPreamble(10);
      this.mdcEncoder.setPacket(0x01, 0x00, parseInt(app.globalData.userInfo.mdcid, 16));
      const samples = this.mdcEncoder.getSamples();
      app.globalData.mdcPacket = g711.MDC2g711Encode(samples);
    } catch (e) {
      console.error('MDC Init Error:', e);
    }

    const audioPacket = nrl21.createPacket({
      type: 1,
      callSign: app.globalData.userInfo.callsign,
    });
    this.audioPacket = new Uint8Array(548);
    this.audioPacket.set(new Uint8Array(audioPacket.getBuffer()), 0);

    const heartbeatPacket = nrl21.createPacket({
      type: 2,
      callSign: app.globalData.userInfo.callsign,
    });
    this.heartbeatBuffer = heartbeatPacket.getBuffer();

    app.globalData.udpClient = new udp.UDPClient({
      host: app.globalData.serverConfig.host,
      port: app.globalData.serverConfig.port,
      onMessage: (data) => this.voiceService.handleMessage(data)
    });
  },

  onShow() {
    wx.setKeepScreenOn({ keepScreenOn: true });
    this.refreshData();
    this.checkConnection();
  },

  async refreshData() {
    const currentDevice = await app.globalData.getDevice(app.globalData.userInfo.callsign, 100);
    app.globalData.currentDevice = currentDevice;
    const group = await app.globalData.getGroup(currentDevice?.group_id);

    if (group) {
      const devlist = Object.values(group.devmap || {});
      const onlineCount = devlist.filter(d => d.is_online).length;
      this.setData({
        currentGroup: group.name,
        onlineCount: onlineCount,
        deviceCount: devlist.length
      });
    } else {
      this.setData({
        currentGroup: '未加入群组',
        onlineCount: 0,
        deviceCount: 0
      });
    }
  },

  startHeartbeat() {
    if (app.globalData.heartbeatTimer) return;
    app.globalData.heartbeatTimer = setInterval(() => {
      if (app.globalData.udpClient) {
        app.globalData.udpClient.send(this.heartbeatBuffer);
      }
    }, 2000);
  },

  checkConnection() {
    if (this.data.lastMessageTime && Date.now() - this.data.lastMessageTime > 6000) {
      this.setData({ serverConnected: false });
    }
  },

  // Event Handlers
  onInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  sendMessage() {
    const text = this.data.inputText.trim();
    if (!text) return;

    const packet = nrl21.createPacket({
      type: 5,
      callSign: app.globalData.userInfo.callsign,
    });

    const packetHead = new Uint8Array(packet.getBuffer());
    const encodedText = nrlHelpers.encodeTextToUint8Array(text);
    const fullPacket = new Uint8Array(packetHead.length + encodedText.length);
    fullPacket.set(packetHead, 0);
    fullPacket.set(encodedText, packetHead.length);

    if (app.globalData.udpClient) app.globalData.udpClient.send(fullPacket);

    const newLog = {
      id: Date.now(),
      type: 'text',
      isSelf: true,
      sender: '我',
      content: text,
      timestamp: nrlHelpers.formatLastVoiceTime(Date.now())
    };

    this.setData({ inputText: '' });
    this.voiceService.addChatLog(newLog);
  },

  async toggleTalk() {
    if (this.data.isTalking) {
      await this.recorderService.stopRecording();
    } else {
      app.globalData.recoderStartTime = Date.now();
      await this.recorderService.startRecording();
    }
  },

  playVoice(e) {
    const { filepath, id } = e.currentTarget.dataset;
    if (!filepath) return;

    // Stop previous audio if any
    if (this.currentAudioCtx) {
      this.currentAudioCtx.stop();
      this.currentAudioCtx.destroy();
    }

    this.setData({ currentPlayingId: id });

    const audioCtx = wx.createInnerAudioContext();
    this.currentAudioCtx = audioCtx;
    audioCtx.src = filepath;
    audioCtx.play();

    audioCtx.onEnded(() => {
      this.setData({ currentPlayingId: null });
      audioCtx.destroy();
      this.currentAudioCtx = null;
    });

    audioCtx.onError(() => {
      this.setData({ currentPlayingId: null });
      audioCtx.destroy();
      this.currentAudioCtx = null;
    });
  },

  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    app.globalData.userInfo.avatar = avatarUrl;
    this.setData({ userInfo: app.globalData.userInfo });
    updateAvatar(app.globalData.userInfo).then(() => {
      wx.showToast({ title: '修改完成' });
    }).catch(err => {
      wx.showToast({ title: err.message || '修改失败', icon: 'none' });
    });
  },

  showThanksList() {
    this.setData({ showList: !this.data.showList });
  },

  async loadAvailableGroups() {
    try {
      const groups = await app.globalData.getGroupList() || [];
      const validatedGroups = groups.map(group => ({
        ...group,
        displayGroupName: `${group.id} - ${group.name}`
      }));
      this.setData({ availableGroupsForPicker: validatedGroups });
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  },

  async onGroupPickerChange(e) {
    const selectedIndex = e.detail.value;
    const selectedGroup = this.data.availableGroupsForPicker[selectedIndex];
    const { currentDevice } = app.globalData;

    if (!selectedGroup || !currentDevice) return;

    wx.showLoading({ title: '正在切换群组...' });
    try {
      await updateDevice({
        ...currentDevice,
        group_id: selectedGroup.id,
        last_voice_begin_time: "0001-01-01T00:00:00Z",
        last_voice_end_time: "0001-01-01T00:00:00Z",
      });
      wx.showToast({ title: '切换成功', icon: 'success' });
      await this.refreshData();
    } catch (error) {
      wx.showToast({ title: '切换失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  }
});
