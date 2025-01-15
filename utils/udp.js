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
    this.socket.send({
      address: this.host,
      port: this.port,
      message: data
    });
  }

  close() {
    this.socket.close();
  }
}

module.exports = {
  UDPClient
};
