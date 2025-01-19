class TCPClient {
  constructor({ host, port, onMessage }) {
    this.host = host;
    this.port = port;
    this.onMessage = onMessage;
    this.socket = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = wx.createTCPSocket();

      this.socket.onConnect(() => {
        console.log('TCP连接成功');
        resolve();
      });

      this.socket.onError((err) => {
        console.error('TCP连接错误:', err);
        reject(err);
      });

      this.socket.onMessage((res) => {
        if (typeof res.message === 'string') {
          this.onMessage(res.message);
        }
      });

      this.socket.connect({
        address: this.host,
        port: this.port
      });
    });
  }

  async send(data) {
    try {
      // if (!this.socket || !this.socket.connected) {
      //   await this.connect();
      // }   
      await this.socket.write(data)
    } catch (err) {
      this.socket.connect()
      throw err;
     
    }
  }

  close() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}

module.exports = {
  TCPClient
};
