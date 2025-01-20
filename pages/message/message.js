const app = getApp();
const nrl = require('../../utils/nrl21');

Page({
  data: {
    messages: [], // 消息列表
    inputText: '' // 输入框内容
  },

  onLoad() {
    // 注册页面实例
    app.registerPage(this);

       // 预创建音频包实例
  
 
    
  },

  onUnload() {
    // 注销页面实例
    //app.unregisterPage(this);
  },

  // 处理接收到的消息
  handleMessage(packet) {
    if (packet.type !== 3) return;

    const message = {
      id: Date.now(),
      sender: packet.callSign,
      content: packet.message,
      timestamp: new Date().toLocaleString(),
      isSelf: false
    };

    this.setData({
      messages: this.data.messages.concat([message])
    });
  },

  encodeTextToUint8Array(text) {
    const uint8Array = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      uint8Array[i] = text.charCodeAt(i);
    }
    return uint8Array;
  },
  
  // 发送消息
  sendMessage() {
    const text = this.data.inputText.trim();
    if (!text) return;

    // 创建NRL消息包

    const app = getApp();
  
    const MessgaePacket = nrl.createPacket({
      type: 5,
      callSign: app.globalData.userInfo.callsign,
      cpuId: app.globalData.cpuId,
    
    });

       
    const MessagePacketHead = new Uint8Array(MessgaePacket.getBuffer());
    this.messagePacket = new Uint8Array(48+text.length);
    this.messagePacket.set(MessagePacketHead, 0);
    

  
    const encodedText = this.encodeTextToUint8Array(text);
    this.messagePacket.set(encodedText, 48);

    console.log(this.messagePacket);

    // 通过UDP发送
    if (app.globalData.udpClient) {
      app.globalData.udpClient.send(this.messagePacket);
    }

    // 添加到消息列表
    const message = {
      id: Date.now(),
      sender: '我',
      content: text,
      timestamp: new Date().toLocaleString(),
      isSelf: true
    };

    this.setData({
      messages: this.data.messages.concat([message]),
      inputText: ''
    });
  },

  // 输入框内容变化
  onInput(e) {
    this.setData({
      inputText: e.detail.value
    });
  }
});
