const udp = require('../../utils/udp');
const audio = require('../../utils/audio');
const nrl21 = require('../../utils/nrl21');

function calculateCPUID(callSign = '') {
  // 生成4字节二进制数据
  let hash = 0;
  for (let i = 0; i < callSign.length; i++) {
    hash = ((hash << 5) - hash) + callSign.charCodeAt(i);
    hash |= 0; // 转换为32位整数
  }
  // 创建4字节的ArrayBuffer
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, hash, false); // 大端序
  return buffer;
}

Page({
  data: {
    userInfo: {},
    isTalking: false,
    codec: 'g711',
    server: 'nrlptt.com',
    port: 60050,
    serverConnected: false,
    lastHeartbeatTime: null,
    cpuid: ''
  },

  onLoad() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    const callSign = userInfo.callSign || 'UNKNOWN';
    const cpuid = calculateCPUID(callSign);
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
    return setInterval(() => {
      const packet = nrl21.createHeartbeatPacket({
        callSign: this.data.userInfo.callSign,
        cpuid: this.data.cpuid
      });
      this.udpClient.send(packet);
    }, 1000);
  },

  changeCodec(e) {
    this.setData({codec: e.detail.value});
  },

  async startRecording() {
    this.setData({isTalking: true});
    this.recorder = await audio.startRecording(this.data.codec);
    
    // 实时处理音频数据
    const processAudio = async () => {
      while (this.data.isTalking) {
        const data = await this.recorder.getNextAudioFrame();
        if (!data) continue;
        
        if (this.data.codec === 'g711') {
          // G711编码，直接发送
          const packet = nrl21.createAudioPacket({
            callSign: this.data.userInfo.callSign,
            cpuid: this.data.cpuid,
            type: 2,
            data
          });
          this.udpClient.send(packet);
        } else {
          // Opus编码，直接发送
          const packet = nrl21.createAudioPacket({
            callSign: this.data.userInfo.callSign,
            cpuid: this.data.cpuid,
            type: 8,
            data
          });
          this.udpClient.send(packet);
          // 控制发送速率
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }
    };
    
    this.audioProcessor = processAudio();
  },

  async stopRecording() {
    this.setData({isTalking: false});
    await this.audioProcessor; // 等待处理完成
    audio.stopRecording(this.recorder);
  },

  handleMessage(data) {
    const packet = nrl21.decode(data);
    if (packet.type === 5 || packet.type === 8) {
      audio.play(packet.data, packet.type);
    }
    // 更新服务器连接状态
    this.setData({
      serverConnected: true,
      lastHeartbeatTime: Date.now()
    });
  },

  checkConnection() {
    if (this.data.lastHeartbeatTime && 
        Date.now() - this.data.lastHeartbeatTime > 3000) {
      this.setData({serverConnected: false});
    }
  }
});
