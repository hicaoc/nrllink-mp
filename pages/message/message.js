const app = getApp();
const nrl = require('../../utils/nrl21').default;

Page({
  data: {
    messages: [], // 消息列表
    inputText: '' // 输入框内容
  },

  onLoad() {
    // 注册页面实例
    app.registerPage(this);
  },

  onUnload() {
    // 注销页面实例
    //app.unregisterPage(this);
  },

  // 处理接收到的消息
  handleMessage(packet) {
    //console.log('收到消息:', packet);
    if (packet.type !== 5) return;

    const message = {
      id: Date.now(),
      sender: packet.callSign,
      content: this.decodeUint8ArrayToText(packet.data || new Uint8Array()),
     
      timestamp: new Date().toLocaleString(),
      isSelf: false
    };

    //console.log(message);

    this.setData({
      messages: this.data.messages.concat([message])
    });
  },

  decodeUint8ArrayToText(data) {

    //console.log(data);
    if (!data || !data.length) return '';
    
    try {
      let text = '';
      let i = 0;
      const uint8Array = new Uint8Array(data);
      
      while (i < uint8Array.length) {
        const byte1 = uint8Array[i++];
        if (byte1 < 0x80) {
          text += String.fromCharCode(byte1);
        } else if (byte1 >= 0xC0 && byte1 < 0xE0) {
          const byte2 = uint8Array[i++];
          text += String.fromCharCode(((byte1 & 0x1F) << 6) | (byte2 & 0x3F));
        } else if (byte1 >= 0xE0 && byte1 < 0xF0) {
          const byte2 = uint8Array[i++];
          const byte3 = uint8Array[i++];
          text += String.fromCharCode(
            ((byte1 & 0x0F) << 12) | ((byte2 & 0x3F) << 6) | (byte3 & 0x3F)
          );
        } else if (byte1 >= 0xF0) {
          const byte2 = uint8Array[i++];
          const byte3 = uint8Array[i++];
          const byte4 = uint8Array[i++];
          const codePoint =
            ((byte1 & 0x07) << 18) |
            ((byte2 & 0x3F) << 12) |
            ((byte3 & 0x3F) << 6) |
            (byte4 & 0x3F);
          text += String.fromCodePoint(codePoint);
        }
      }
      return text;
    } catch (e) {
      console.error('解码消息失败:', e);
      return '';
    }
  },

  encodeTextToUint8Array(text) {
    const codePoints = [];
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code <= 0x7F) {
        codePoints.push(code);
      } else if (code <= 0x7FF) {
        codePoints.push(0xC0 | (code >> 6));
        codePoints.push(0x80 | (code & 0x3F));
      } else if (code <= 0xFFFF) {
        codePoints.push(0xE0 | (code >> 12));
        codePoints.push(0x80 | ((code >> 6) & 0x3F));
        codePoints.push(0x80 | (code & 0x3F));
      } else {
        codePoints.push(0xF0 | (code >> 18));
        codePoints.push(0x80 | ((code >> 12) & 0x3F));
        codePoints.push(0x80 | ((code >> 6) & 0x3F));
        codePoints.push(0x80 | (code & 0x3F));
      }
    }
    return new Uint8Array(codePoints);
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
      
    });

    const MessagePacketHead = new Uint8Array(MessgaePacket.getBuffer());
    const encodedText = this.encodeTextToUint8Array(text);
    
    // 创建正确长度的Uint8Array
    this.messagePacket = new Uint8Array(MessagePacketHead.length + encodedText.length);
    this.messagePacket.set(MessagePacketHead, 0);
    this.messagePacket.set(encodedText, MessagePacketHead.length);

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
