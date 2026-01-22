export class UDPClient {
  constructor({ host, port, onMessage }) {
    this.host = host;
    this.port = port;
    this.onMessage = onMessage;
    this.initSocket();
  }

  initSocket() {
    try {
      this.socket = wx.createUDPSocket();
      this.socket.bind();
      this.socket.onMessage((res) => {
        this.onMessage(res.message);
      });
    } catch (error) {
      console.error('UDP socket 创建失败:', error);
      // 3秒后重试
      setTimeout(() => {
        this.initSocket();
      }, 3000);
    }
  }

  send(data) {
    // 立即发送但不等待响应
    try {
      this.socket.send({
        address: this.host,
        port: this.port,
        message: data
      });
    } catch (e) {
      console.error('UDP发送失败:', e);
    }
  }

  close() {
    this.socket.close();
    console.log('UDP socket closed');
  }
}

export default {
  UDPClient
};
