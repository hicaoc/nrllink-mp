const udp = require('../../utils/udp');
const audio = require('../../utils/audio');
const nrl21 = require('../../utils/nrl21');


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
    selectedDeviceIndex: null // 当前选择的设备索引
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
    
    // 获取群组和设备列表
    this.getGroupList();
    this.getDeviceList();
  },

  // 获取群组列表
  getGroupList() {
    wx.request({
      url: 'https://nrlptt.com/group/list',
      method: 'POST',
      header: {
        'x-token': wx.getStorageSync('token')
      },
      data: {},
      success: (res) => {
        if (res.data.code === 20000) {
          this.setData({
            groups: Object.values(res.data.data.items)
          });
        }
      }
    });
  },

  // 获取设备列表
  getDeviceList() {
    wx.request({
      url: 'https://nrlptt.com/device/mydevlist',
      method: 'POST',
      header: {
        'x-token': wx.getStorageSync('token')
      },
      data: {},
      success: (res) => {
        if (res.data.code === 20000) {
          const devices = Object.values(res.data.data.items).map(device => ({
            ...device,
            displayName: `${device.callsign}-${device.ssid}(${device.cpuid})`
          }));
          this.setData({
            devices
          });
        }
      }
    });
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
  joinGroup() {
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

    wx.request({
      url: 'https://nrlptt.com/device/update',
      method: 'POST',
      header: {
        'x-token': wx.getStorageSync('token')
      },
      data: {
        ...device, // 保留所有设备信息
        group_id: groupId // 只更新group_id
      },
      complete: (res) => {
        console.log('请求完成:', res); // 调试日志
      },
      success: (res) => {
        if (res.data.code === 20000) {
          wx.showToast({
            title: '加入群组成功'
          });
          // 更新设备列表
          this.getDeviceList();
        } else {
          wx.showToast({
            title: '加入群组失败',
            icon: 'none'
          });
        }
      },
      fail: (err) => {
        wx.showToast({
          title: '请求失败，请检查网络',
          icon: 'none'
        });
        console.error('加入群组请求失败:', err);
      }
    });
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
      while (this.data.isTalking) {
  
        const data = await this.recorder.getNextAudioFrame();
        console.log('语音数据:', data);
        if (!data) continue;

        // 立即发送500字节语音包
        const packet = nrl21.createAudioPacket({
          callSign: this.data.userInfo.callSign,
          cpuid: this.data.cpuid,
          type: this.data.codec === 'g711' ? 1 : 8,
          data: new Uint8Array(data)
        });
        console.log('发送语音包:', packet);
        // 立即发送
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
