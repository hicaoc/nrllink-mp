// utils/ax25.js
class Frame {
  constructor({destination, source, digipeaters, info}) {
    this.destination = destination;
    this.source = source;
    this.digipeaters = digipeaters || [];
    this.info = info;
  }

  encode() {
    // 编码目的地址
    let buffer = this.encodeAddress(this.destination, false);
    
    // 编码源地址
    buffer = this.concatBuffers(buffer, this.encodeAddress(this.source, true));
    
    // 编码中继路径
    for (const digi of this.digipeaters) {
      buffer = this.concatBuffers(buffer, this.encodeAddress(digi, false));
    }
    
    // 控制字段和协议ID
    buffer = this.concatBuffers(buffer, new Uint8Array([0x03, 0xF0]));
    
    // 信息字段
    buffer = this.concatBuffers(buffer, this.info);
    
    return buffer;
  }

  encodeAddress(callsign, isLast) {
    const address = callsign.toUpperCase().padEnd(6, ' ');
    const buffer = new Uint8Array(7);
    
    // 编码呼号
    for (let i = 0; i < 6; i++) {
      buffer[i] = address.charCodeAt(i) << 1;
    }
    
    // 设置SSID和结束标志
    buffer[6] = (isLast ? 0x61 : 0x60);
    
    return buffer;
  }

  concatBuffers(buffer1, buffer2) {
    const result = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
    result.set(new Uint8Array(buffer1), 0);
    result.set(new Uint8Array(buffer2), buffer1.byteLength);
    return result.buffer;
  }
}

module.exports = {
  Frame
};
