class NRL21Packet {
  // 固定头部大小
  static FIXED_BUFFER_SIZE = 48;

  // 报文总大小
  static PACKET_SIZE = NRL21Packet.FIXED_BUFFER_SIZE

  constructor({
    version = 'NRL2',
    length = 0,
    cpuId = 0,
    password = 0,
    type = 0,
    status = 1,
    count = 0,
    callSign = 'CALL01',
    ssid = 100,
    devMode = 100,

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

    // 预生成固定大小的 ArrayBuffer
    this.buffer = new ArrayBuffer(NRL21Packet.PACKET_SIZE);
    this.view = new DataView(this.buffer);

  
    // 初始化固定值
    this.writeString(0, this.version, 4); // 写入固定头部
    this.view.setUint16(4, NRL21Packet.FIXED_BUFFER_SIZE, false); // 初始长度（固定头部大小）
    this.view.setUint32(6, this.cpuId, false); // 写入固定 cpuId
    this.view.setUint32(10, this.password, false); // 写入固定 password
    this.view.setUint8(20, this.type); // type 初始值（动态字段）
    this.view.setUint8(21, this.status); // 写入固定 status
    this.view.setUint16(22, this.count, false); // 写入固定 count
    this.writeString(24, this.callSign, 6); // 写入固定 callSign
    this.view.setUint8(30, this.ssid); // 写入固定 ssid
    this.view.setUint8(31, this.devMode); // 写入固定 devMode

    this.cachedBuffer = this.encode();


  }

  encode() {
    // 更新动态字段
    this.view.setUint8(20, this.type); // 更新 type
    return this.buffer

  }

  // 直接返回缓存的数组值
  getBuffer() {

    return this.cachedBuffer;
  }

  writeString(offset, str = '', length) {
    str = str.toString();
    for (let i = 0; i < length; i++) {
      const charCode = i < str.length ? str.charCodeAt(i) : 0;
      this.view.setUint8(offset + i, charCode);
    }
  }
}


function createPacket({ callSign, cpuId, type }) {

  return new NRL21Packet({
    type,
    callSign,
    cpuId,
  });
}

function decodePacket(data) {
    const byteArray = new Uint8Array(data);
    const callSignStr = String.fromCharCode.apply(null, byteArray.slice(24, 30));

    return {
      type: byteArray[20],
      callSign: callSignStr,
      ssid: byteArray[30],
      data: byteArray.slice(48),
    };
  }


// function decode(data) {
//   //const view = new DataView(data);

//   return new NRL21Packet({
//     // version: readString(view, 0, 4),
//     // length: view.getUint16(4, false),
//     // cpuId: view.getUint32(6, false),
//     // password: view.getUint32(10, false),
//     type: view.getUint8(20),
//     // status: view.getUint8(21),
//     // count: view.getUint16(22, false),
//     callSign: readString(view, 24, 6),
//     ssid: view.getUint8(30),
//     // devMode: view.getUint8(31),
//     data: new Uint8Array(data.slice(48))
//   });
// }

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

  //console.log('cpuIdToHex', cpuId,cpuId.toString(16).toUpperCase().padStart(8, '0'))
  return cpuId.toString(16).toUpperCase().padStart(8, '0');


}

module.exports = {
  createPacket,
  decodePacket,
  calculateCpuId,
  cpuIdToHex
};
