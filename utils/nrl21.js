class NRL21Packet {
  constructor({
    version = 'NRL2',
    length = 0,
    cpuId = new ArrayBuffer(4),
    password = '',
    type = 0,
    status = 0,
    count = 0,
    callSign = '',
    ssid = 0,
    devMode = 0,
    data = new Uint8Array(0)
  }) {
    this.version = version;
    this.length = length;
    this.cpuId = cpuId;
    this.password = password;
    this.type = type;
    this.status = status;
    this.count = count;
    this.callSign = callSign;
    this.ssid = ssid;
    this.devMode = devMode;
    this.data = data;
  }

  encode() {
    const buffer = new ArrayBuffer(48 + this.data.byteLength);
    const view = new DataView(buffer);

    // Write header
    this.writeString(view, 0, 'NRL2', 4);
    view.setUint16(4, 48 + this.data.byteLength, false);  

 
    view.setUint32(6, this.cpuId, false);

    view.setUint32(10, this.password, false);
    view.setUint8(20, this.type);
    view.setUint8(21, this.status);
    view.setUint16(22, this.count, false);
    this.writeString(view, 24, this.callSign, 6);
    view.setUint8(30, 100); // ssid
    view.setUint8(31, 5); // devMode

    // Write data
    const dataView = new Uint8Array(buffer, 48);
    dataView.set(this.data);

    return buffer;
  }

  writeString(view, offset, str = '', length) {
    str = str.toString();
    for (let i = 0; i < length; i++) {
      const charCode = i < str.length ? str.charCodeAt(i) : 0;
      view.setUint8(offset + i, charCode);
    }
  }
}

function createHeartbeatPacket({callSign, cpuId}) {

  console.log('createHeartbeatPacket',callSign,cpuId  );
 
  return new NRL21Packet({
    type: 2,
    callSign,
    cpuId,
    data: new Uint8Array(0)
  }).encode();
}

function createAudioPacket({callSign, type, data, cpuId}) {
  return new NRL21Packet({
    type,
    callSign,
    cpuId,
    data: new Uint8Array(data),
    length: data.byteLength
  }).encode();
}

function decode(data) {
  const view = new DataView(data); 
  
  return new NRL21Packet({
    version: readString(view, 0, 4),
    length: view.getUint16(3, false),
    cpuId: view.getUint32(5, false),
    password: view.getUint32(10, false),
    type: view.getUint8(20),
    status: view.getUint8(21),
    count: view.getUint16(22, false),
    callSign: readString(view, 24, 6),
    ssid: view.getUint8(30),
    devMode: view.getUint8(31),
    data: new Uint8Array(data.slice(48))
  });
}

function readString(view, offset, length) {
  let str = '';
  for (let i = 0; i < length; i++) {
    const charCode = view.getUint8(offset + i);
    if (charCode) {
      str += String.fromCharCode(charCode);
    }
  }
  return str;
}

function calculateCpuId(callSign) {
// 将字符串生成 32 位哈希值
let hash = 0;
for (const char of callSign) {
  hash = (hash * 31 + char.charCodeAt(0)) | 0; // 简化位运算逻辑
}

return hash

}

function cpuIdToHex(cpuId) {
  const view = new DataView(cpuId);
  const value = view.getUint32(0, false);
  return value.toString(16).toUpperCase().padStart(8, '0');
}

module.exports = {
  createHeartbeatPacket,
  createAudioPacket,
  decode,
  calculateCpuId,
  cpuIdToHex
};
