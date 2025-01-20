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
        const app = getApp()
        const callSign = app.globalData.userInfo.callsign;
        const passcode = app.globalData.passcode || 21942; // 使用全局变量中的passcode
        const loginPacket = `user ${callSign} pass ${passcode} vers NRLLink 1.0\n`;        
        this.socket.write(loginPacket);
        console.log('成功发送登录包:', loginPacket); 
        resolve();
      });

      this.socket.onMessage((res) => {
        // if (typeof res.message === 'string') {
           this.onMessage(res);
        // }
       });
 

      this.socket.onError((err) => {
        console.error('TCP连接错误:', err);
        reject(err);
      });

      this.socket.offConnect((err) => {
        console.error('TCP连接断开:', err);
        reject(err);
      });

      this.socket.offClose((err) => {
        console.error('TCP连接关闭:', err);
        reject(err);
      });

      this.socket.offError((err) => {
        console.error('TCP连接关闭错误:', err);
        reject(err);
      });

      
      this.socket.offMessage((res) => {
        // if (typeof res.message === 'string') {
           this.onMessage(res);
        // }
       });


    
      this.socket.connect({
        address: this.host,
        port: this.port
      });
    });
  }

  async send(data) {
    //console.log('this socket:', this.socket);
    try {
      if (!this.socket ) {
        await this.connect();       
  
      }   
      await this.socket.write(data)
    } catch (err) {
      
      console.log( '发送数据失败:', err); 

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
