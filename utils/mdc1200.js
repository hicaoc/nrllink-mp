/**
 * MDC1200 协议常量定义
 */
const MDC1200 = {
  FEC_K: 7, // 前向纠错码长度
  PREAMBLE: [0x00, 0x00, 0x00], // 前导码
  SYNC: [0x07, 0x09, 0x2a, 0x44, 0x6f], // 同步码
  SYNC_XOR: [0x04, 0x8d, 0xbf, 0x66, 0x58], // 预计算的异或同步码
  CRC_POLY: 0x8408 // CRC16 多项式 (反向)
};

// 输入参数范围校验
const PARAM_RANGES = {
  OP: { min: 0x00, max: 0xFF }, // 操作码范围
  ARG: { min: 0x00, max: 0xFF }, // 参数范围
  UNIT_ID: { min: 0x0000, max: 0xFFFF } // 单元ID范围
};

/**
 * 位操作工具函数
 */
const BitUtils = {
  /**
   * 8位位反转
   * @param {number} n - 输入字节
   * @returns {number} 位反转后的字节
   */
  reverse8(n) {
    n = ((n >> 1) & 0x55) | ((n << 1) & 0xAA);
    n = ((n >> 2) & 0x33) | ((n << 2) & 0xCC);
    n = ((n >> 4) & 0x0F) | ((n << 4) & 0xF0);
    return n;
  },

  /**
   * 16位位反转
   * @param {number} n - 输入字
   * @returns {number} 位反转后的字
   */
  reverse16(n) {
    n = ((n >> 1) & 0x5555) | ((n << 1) & 0xAAAA);
    n = ((n >> 2) & 0x3333) | ((n << 2) & 0xCCCC);
    n = ((n >> 4) & 0x0F0F) | ((n << 4) & 0xF0F0);
    n = ((n >> 8) & 0x00FF) | ((n << 8) & 0xFF00);
    return n;
  }
};

/**
 * CRC16 计算（基于反向多项式）
 * @param {Uint8Array} data - 输入数据
 * @returns {number} 计算得到的CRC16值
 */
function computeCRC(data) {
  if (!(data instanceof Uint8Array)) {
    throw new TypeError('Input data must be Uint8Array');
  }

  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let k = 8; k > 0; k--) {
      crc = (crc & 1) ? (crc >> 1) ^ MDC1200.CRC_POLY : crc >> 1;
    }
  }
  return crc ^ 0xffff;
}

/**
 * 生成尾音 PCM 数据
 * @param {number} frequency - 尾音的频率 (Hz)
 * @param {number} duration - 尾音的持续时间 (秒)
 * @param {number} sampleRate - 采样率 (Hz)
 * @returns {Int16Array} 尾音的 PCM 数据
 */
function generateTailTone(frequency, duration, sampleRate = 8000) {
  const numSamples = Math.floor(sampleRate * duration); // 计算样本数
  const pcmData = new Int16Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    // 生成正弦波
    const sample = Math.sin((2 * Math.PI * frequency * i) / sampleRate);
    pcmData[i] = Math.floor(sample * 32767); // 归一化到 16-bit PCM 范围
  }

  return pcmData;
}

/**
 * MDC1200 编码器类
 */
class MDC1200Encoder {
  /**
   * 构造函数
   * @throws {Error} 如果输入参数超出范围
   */
  constructor() {
    this.shiftReg = 0;
  }

  /**
   * Xor 调制
   * @param {Uint8Array} data - 输入数据
   * @returns {Uint8Array} 调制后的数据
   */
  xorModulation(data) {
    const result = new Uint8Array(data.length);
    let prevBit = 0;
    
    for (let i = 0; i < data.length; i++) {
      let outByte = 0;
      for (let bitNum = 7; bitNum >= 0; bitNum--) {
        const newBit = (data[i] >> bitNum) & 1;
        if (newBit !== prevBit) {
          outByte |= (1 << bitNum);
        }
        prevBit = newBit;
      }
      result[i] = outByte ^ 0xFF;
    }
    return result;
  }

  /**
   * FEC 编码
   * @param {Uint8Array} data - 输入数据
   * @returns {Uint8Array} 编码后的数据
   */
  encodeData(data) {
    const fecBytes = new Uint8Array(MDC1200.FEC_K);
    this.shiftReg = 0;

    // 计算 FEC 字节
    for (let i = 0; i < MDC1200.FEC_K; i++) {
      let outByte = 0;
      for (let bitNum = 0; bitNum < 8; bitNum++) {
        this.shiftReg = (this.shiftReg << 1) | ((data[i] >> bitNum) & 1);
        outByte |= (((this.shiftReg >> 6) ^ 
                    (this.shiftReg >> 5) ^ 
                    (this.shiftReg >> 2) ^ 
                    (this.shiftReg >> 0)) & 1) << bitNum;
      }
      fecBytes[i] = outByte;
    }

    // 交织处理
    const interleavedBits = new Uint8Array(112);
    let bitIndex = 0;
    for (let i = 0; i < MDC1200.FEC_K * 2; i++) {
      const b = i < MDC1200.FEC_K ? data[i] : fecBytes[i - MDC1200.FEC_K];
      for (let bitNum = 0; bitNum < 8; bitNum++) {
        interleavedBits[bitIndex] = (b >> bitNum) & 1;
        bitIndex = (bitIndex + 16) % 112;
      }
    }

    // 生成最终编码数据
    const result = new Uint8Array(MDC1200.FEC_K * 2);
    let interleavedIndex = 0;
    for (let i = 0; i < MDC1200.FEC_K * 2; i++) {
      let outByte = 0;
      for (let bitNum = 7; bitNum >= 0; bitNum--) {
        if (interleavedBits[interleavedIndex++]) {
          outByte |= 1 << bitNum;
        }
      }
      result[i] = outByte;
    }
    return result;
  }

  /**
   * 编码单个数据包
   * @param {number} op - 操作码
   * @param {number} arg - 参数
   * @param {number} unitId - 单元ID
   * @returns {Uint8Array} 编码后的数据包
   * @throws {Error} 如果输入参数超出范围
   */
  encodeSinglePacket(op, arg, unitId) {
    // 参数校验
    if (op < PARAM_RANGES.OP.min || op > PARAM_RANGES.OP.max) {
      throw new Error(`Invalid op value: ${op}`);
    }
    if (arg < PARAM_RANGES.ARG.min || arg > PARAM_RANGES.ARG.max) {
      throw new Error(`Invalid arg value: ${arg}`);
    }
    if (unitId < PARAM_RANGES.UNIT_ID.min || unitId > PARAM_RANGES.UNIT_ID.max) {
      throw new Error(`Invalid unitId value: ${unitId}`);
    }

    // 构建基础数据包
    const data = new Uint8Array([
      ...MDC1200.PREAMBLE,
      ...MDC1200.SYNC,
      op,
      arg,
      (unitId >> 8) & 0xff,
      unitId & 0xff
    ]);

    // 计算CRC
    const crc = computeCRC(data.slice(MDC1200.PREAMBLE.length + MDC1200.SYNC.length));

    // 构建完整数据包
    const packetData = new Uint8Array([
      ...data,
      crc & 0xff,
      (crc >> 8) & 0xff,
      0 // 填充字节
    ]);

    // 编码和调制
    const encodedData = this.encodeData(
      packetData.slice(MDC1200.PREAMBLE.length + MDC1200.SYNC.length)
    );
    const finalPacket = new Uint8Array([...data, ...encodedData]);
    
    // 确保数据包长度为512字节以匹配音频帧大小
    const paddedPacket = new Uint8Array(500);
    paddedPacket.set(finalPacket);
    
    return this.xorModulation(paddedPacket);
  }
}


function arrayBufferToBytes(buffer){
    let result=new Array();
    let u8array=new Uint8Array(buffer);
    for(let i=0;i<u8array.length;i++){
        result.push(u8array[i]);
    }
    return result;
}




/**
 * PCM 编码器
 * @param {Uint8Array} mdc1200Data - MDC1200 编码数据
 * @returns {ArrayBuffer} PCM 编码数据
 */
function pcmEncode(mdc1200Data) {
  if (!(mdc1200Data instanceof Uint8Array)) {
    throw new TypeError('Input data must be Uint8Array');
  }

  const pcmData = new Int16Array(mdc1200Data.length * 2);
  for (let i = 0; i < mdc1200Data.length; i++) {
    const sample = (mdc1200Data[i] - 127) << 8;
    pcmData[i * 2] = sample;
    pcmData[i * 2 + 1] = sample;
  }
  return pcmData.buffer;
}

module.exports = {
  MDC1200Encoder,
  pcmEncode
};
