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
    currentPlayingId: null,
    isVoicePlaying: false,
    showOnlineModal: false,
    onlineDevicesList: [],

    // Server Switch Data
    showServerModal: false,
    serverList: [],
    tempServerIndex: 0,
    tempUsername: '',
    tempPassword: '',

    // Group Switch Data
    showGroupModal: false,
    currentGroupId: null
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
    this.loadServerList();
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
    this.audioPacket = new Uint8Array(208);
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

  async onShow() {
    wx.setKeepScreenOn({ keepScreenOn: true });

    // Re-initialize UDP connection (may have been closed by system during background)
    if (app.globalData.udpClient) {
      app.globalData.udpClient.close();
      app.globalData.udpClient = null;
    }
    await this.initMdcAndUdp();

    audio.resume();
    this.startHeartbeat();
    this.refreshData();
    this.startGroupRefreshTimer();
  },

  onHide() {
    this.stopGroupRefreshTimer();
  },

  onUnload() {
    this.stopGroupRefreshTimer();
    this.stopHeartbeat();
    if (this.connectionCheckTimer) clearInterval(this.connectionCheckTimer);
  },

  startGroupRefreshTimer() {
    this.stopGroupRefreshTimer();
    this.groupRefreshTimer = setInterval(() => {
      this.refreshData(true);
    }, 5000);
  },

  stopGroupRefreshTimer() {
    if (this.groupRefreshTimer) {
      clearInterval(this.groupRefreshTimer);
      this.groupRefreshTimer = null;
    }
  },

  async refreshData(silent = false) {
    const currentDevice = await app.globalData.getDevice(app.globalData.userInfo.callsign, 100, silent);
    app.globalData.currentDevice = currentDevice;
    const group = await app.globalData.getGroup(currentDevice?.group_id, silent);

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
    this.stopHeartbeat();
    app.globalData.heartbeatTimer = setInterval(() => {
      if (app.globalData.udpClient) {
        app.globalData.udpClient.send(this.heartbeatBuffer);
      }
    }, 2000);
  },

  stopHeartbeat() {
    if (app.globalData.heartbeatTimer) {
      clearInterval(app.globalData.heartbeatTimer);
      app.globalData.heartbeatTimer = null;
    }
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

    // Toggle Play/Pause if clicking the same item
    if (this.data.currentPlayingId === id && this.currentAudioCtx) {
      if (this.data.isVoicePlaying) {
        this.currentAudioCtx.pause();
      } else {
        this.currentAudioCtx.play();
      }
      return;
    }

    // Stop previous audio if any
    if (this.currentAudioCtx) {
      this.currentAudioCtx.stop();
      this.currentAudioCtx.destroy();
      this.currentAudioCtx = null;
    }

    const audioCtx = wx.createInnerAudioContext();
    this.currentAudioCtx = audioCtx;
    audioCtx.src = filepath;
    audioCtx.play();

    this.setData({
      currentPlayingId: id
    });

    audioCtx.onPlay(() => {
      this.setData({ isVoicePlaying: true });
    });

    audioCtx.onPause(() => {
      this.setData({ isVoicePlaying: false });
    });

    audioCtx.onEnded(() => {
      this.setData({
        currentPlayingId: null,
        isVoicePlaying: false
      });
      audioCtx.destroy();
      this.currentAudioCtx = null;
    });

    audioCtx.onError(() => {
      this.setData({
        currentPlayingId: null,
        isVoicePlaying: false
      });
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

  showGroupModal() {
    const { currentDevice } = app.globalData;
    this.setData({
      showGroupModal: true,
      currentGroupId: currentDevice?.group_id || null
    });
  },

  hideGroupModal() {
    this.setData({ showGroupModal: false });
  },

  async onGroupCardSelect(e) {
    const selectedIndex = e.currentTarget.dataset.index;
    const selectedGroup = this.data.availableGroupsForPicker[selectedIndex];
    const { currentDevice } = app.globalData;

    if (!selectedGroup || !currentDevice) return;

    this.setData({ showGroupModal: false });
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
  },

  async showOnlineDevices() {
    try {
      const currentDevice = app.globalData.currentDevice;
      if (!currentDevice || !currentDevice.group_id) {
        wx.showToast({ title: '未加入群组', icon: 'none' });
        return;
      }

      const group = await app.globalData.getGroup(currentDevice.group_id);
      if (!group || !group.devmap) {
        this.setData({
          showOnlineModal: true,
          onlineDevicesList: []
        });
        return;
      }

      const onlineDevices = Object.values(group.devmap)
        .filter(device => device.is_online)
        .map(device => ({
          id: `${device.callsign}-${device.ssid}`,
          callsign: device.callsign,
          ssid: device.ssid
        }));

      this.setData({
        showOnlineModal: true,
        onlineDevicesList: onlineDevices
      });
    } catch (error) {
      console.error('Error loading online devices:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  hideOnlineDevices() {
    this.setData({ showOnlineModal: false });
  },

  stopPropagation() {
    // Prevent modal from closing when clicking inside
  },

  // --- Server Switch Logic ---

  loadServerList() {
    const url = 'https://m.nrlptt.com/platform/list';
    wx.request({
      url: url,
      method: 'GET',
      header: { 'content-type': 'application/json' },
      success: (res) => {
        if (res.data && res.data.data && res.data.data.items) {
          const servers = res.data.data.items;
          // Find current server index based on host
          const currentHost = this.data.serverConfig.host;
          let currentIndex = servers.findIndex(s => s.host === currentHost);
          if (currentIndex === -1) currentIndex = 0;

          this.setData({
            serverList: servers,
            tempServerIndex: currentIndex
          });
        }
      },
      fail: (err) => console.error('Failed to load server list:', err)
    });
  },

  handleServerClick() {
    // Load saved credentials for current selection
    const index = this.data.tempServerIndex;
    this.loadCredentialsForIndex(index);
    this.setData({ showServerModal: true });
  },

  hideServerModal() {
    this.setData({ showServerModal: false });
  },

  onServerCardSelect(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ tempServerIndex: index });
    this.loadCredentialsForIndex(index);
  },

  loadCredentialsForIndex(index) {
    const serverCredentials = wx.getStorageSync('serverCredentials') || {};
    const creds = serverCredentials[index];
    if (creds) {
      this.setData({
        tempUsername: creds.username,
        tempPassword: creds.password
      });
    } else {
      this.setData({
        tempUsername: '',
        tempPassword: ''
      });
    }
  },

  onServerUsernameInput(e) {
    this.setData({ tempUsername: e.detail.value });
  },

  onServerPasswordInput(e) {
    this.setData({ tempPassword: e.detail.value });
  },

  async confirmServerSwitch() {
    const { tempServerIndex, tempUsername, tempPassword, serverList } = this.data;
    if (!tempUsername || !tempPassword) {
      wx.showToast({ title: '请输入用户名和密码', icon: 'none' });
      return;
    }

    const selectedServer = serverList[tempServerIndex];
    if (!selectedServer) return;

    if (this.isSwitching) return;
    this.isSwitching = true;
    wx.showLoading({ title: '正在切换...' });

    try {
      // 1. Save credentials
      const serverCredentials = wx.getStorageSync('serverCredentials') || {};
      serverCredentials[tempServerIndex] = { username: tempUsername, password: tempPassword };
      wx.setStorageSync('serverCredentials', serverCredentials);

      // 2. Perform Login
      const api = require('../../utils/api');

      // Update global config temporarily for login
      const oldConfig = { ...app.globalData.serverConfig };
      app.globalData.serverConfig = {
        name: selectedServer.name,
        host: selectedServer.host,
        port: selectedServer.port || 60050
      };

      const res = await api.login({ username: tempUsername, password: tempPassword });

      if (res.token) {
        // Login Success
        wx.setStorageSync('token', res.token);

        // 3. Get User Info
        const userInfo = await api.getUserInfo();
        if (!userInfo.callsign) throw new Error('用户信息缺少呼号');

        wx.setStorageSync('userInfo', userInfo);
        app.globalData.userInfo = userInfo;

        const { generateAPRSPasscode } = require('../../utils/aprs');
        const passcode = generateAPRSPasscode(userInfo.callsign);
        app.globalData.passcode = passcode;
        wx.setStorageSync('passcode', passcode);

        // 4. Update Page Data
        this.setData({
          userInfo: userInfo,
          serverConfig: app.globalData.serverConfig,
          serverConnected: false, // Reset status
          showServerModal: false,
          currentGroup: null,
          onlineCount: 0,
          deviceCount: 0
        });

        // 5. Re-initialize Connection
        if (app.globalData.udpClient) {
          app.globalData.udpClient.close();
          app.globalData.udpClient = null;
        }

        // Clear timers
        if (app.globalData.heartbeatTimer) {
          clearInterval(app.globalData.heartbeatTimer);
          app.globalData.heartbeatTimer = null;
        }

        // Re-init
        await this.initMdcAndUdp();
        audio.resume(); // Ensure audio context is running after switch
        this.startHeartbeat();
        this.loadAvailableGroups(); // Reload groups for new server
        await this.refreshData();

        wx.showToast({ title: '切换成功', icon: 'success' });

      } else {
        // Revert config if login failed
        app.globalData.serverConfig = oldConfig;
        wx.showToast({ title: '用户名或密码错误', icon: 'none' });
      }

    } catch (err) {
      console.error('Switch Error:', err);
      // Revert config on error
      // Ideally we should track "oldConfig" better, but simple revert for now
      wx.showToast({ title: err.message || '切换失败', icon: 'none' });
    } finally {
      this.isSwitching = false;
      wx.hideLoading();
    }
  }
});
