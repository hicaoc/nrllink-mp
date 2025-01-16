class UDPClient {
  constructor({host, port, onMessage}) {
    this.host = host;
    this.port = port;
    this.onMessage = onMessage;
    this.initSocket();
  }

  initSocket() {
    this.socket = wx.createUDPSocket();
    this.socket.bind();
    this.socket.onMessage((res) => {
      this.onMessage(res.message);
    });
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
  }
}

module.exports = {
  UDPClient
};
