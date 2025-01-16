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
    groups: [], // 群组列表
    devices: [], // 设备列表
    selectedGroup: null, // 当前选择的群组
    selectedDevice: null, // 当前选择的设备ID
    selectedDeviceIndex: null, // 当前选择的设备索引
    currentGroup: null // 当前设备所在群组
  },

  onLoad() {
    const userInfo = wx.getStorageSync('userInfo') || {};

    const callSign = userInfo.callsign || 'UNKNOWN';
    const cpuid = nrl21.calculateCpuId(callSign);  

    this.setData({
      userInfo: {
        ...userInfo,
        callSign
      },
      cpuid
    });
  
    this.initUDP();
    this.heartbeatTimer = this.startHeartbeat();
    this.connectionCheckTimer = setInterval(this.checkConnection.bind(this), 1000);
    
    // 初始化获取数据
    this.refreshData();
  },

  // 刷新群组和设备列表
  async refreshData() {
    await this.getGroupList();
    await this.getDeviceList();
    this.getCurrentGroup();
  },

  // 获取当前设备所在群组
  getCurrentGroup() {
    const { cpuid, devices, groups } = this.data;
    
    // 将cpuid转换为16进制字符串
    const hexCpuid = parseInt(cpuid).toString(16).toUpperCase();
    
    // 通过cpuid找到当前设备
    const device = devices.find(d => {
      return d.cpuid === hexCpuid;
    });
    
    if (!device) {
      this.setData({ currentGroup: null });
      return;
    }

    // 通过group_id找到对应群组
    const group = groups.find(g => g.id === device.group_id);
    this.setData({
      currentGroup: group ? group.name : null
    });
  },

  // 获取群组列表
  async getGroupList() {
    try {
      const data = await api.getGroupList();
      this.setData({
        groups: Object.values(data.items)
      });
    } catch (error) {
      wx.showToast({
        title: error.message || '获取群组失败',
        icon: 'none'
      });
    }
  },

  // 获取设备列表
  async getDeviceList() {
    try {
      const data = await api.getDeviceList();
      const devices = Object.values(data.items).map(device => ({
        ...device,
        displayName: `${device.callsign}-${device.ssid}(${device.cpuid})`
      }));
      this.setData({
        devices
      });
    } catch (error) {
      wx.showToast({
        title: error.message || '获取设备失败',
        icon: 'none'
      });
    }
  },

  // 选择群组
  selectGroup(e) {
    this.setData({
      selectedGroup: e.detail.value
    });
  },

  // 选择设备
  selectDevice(e) {
    const index = e.detail.value;
    const device = this.data.devices[index];
    if (!device) return;
    
    this.setData({
      selectedDevice: device.id,
      selectedDeviceIndex: index
    });
  },

  // 加入群组
  async joinGroup() {
    console.log('joinGroup called'); // 调试日志
    const { selectedGroup, selectedDevice, groups, devices } = this.data;
    if (!selectedGroup || !selectedDevice) {
      wx.showToast({
        title: '请选择群组和设备',
        icon: 'none'
      });
      return;
    }

    console.log('当前设备列表:', devices);
    console.log('选择的设备ID:', selectedDevice);
    console.log('选择的设备group:', selectedGroup);
    
    const device = devices.find(d => d.id === selectedDevice);
    if (!device) {
      console.error('设备未找到，当前设备列表:', devices, '选择的设备ID:', selectedDevice);
      wx.showToast({
        title: '设备未找到，请刷新重试',
        icon: 'none'
      });
      return;
    }

    const groupId = groups[selectedGroup].id;
    console.log('准备发送请求，设备:', device, '群组ID:', groupId); // 调试日志

    try {
      await api.updateDevice({
        ...device,
        group_id: groupId
      });
      wx.showToast({
        title: '加入群组成功'
      });
      // 更新设备列表和当前群组
      await this.getDeviceList();
      this.getCurrentGroup();
    } catch (error) {
      wx.showToast({
        title: error.message || '加入群组失败',
        icon: 'none'
      });
    }
  },

  onUnload() {
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

  async startRecording() {
    this.setData({ isTalking: true });
    this.recorder = await audio.startRecording(this.data.codec);

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
        while (buffer.length >= 100) {
          const packetData = buffer.slice(0, 100);
          buffer = buffer.slice(100);

          const packet = nrl21.createAudioPacket({
            callSign: this.data.userInfo.callSign,
            cpuid: this.data.cpuid,
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
    await this.audioProcessor; // 等待处理完成

    audio.stopRecording(this.recorder);
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
