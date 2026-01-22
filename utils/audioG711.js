// G.711编解码器
export class G711Codec {
  constructor() {
    this.SEG_SHIFT = 4;
    this.QUANT_MASK = 0xf;
    this.SEG_MASK = 0x70;
    this.BIAS = 0x84;

    this.initTables();
  }

  initTables() {
    if (G711Codec.encodeTable) return;

    G711Codec.encodeTable = new Uint8Array(65536);
    G711Codec.decodeTable = new Int16Array(256);

    // 预计算编码表 (PCM 16-bit to A-law)
    for (let i = -32768; i <= 32767; i++) {
      G711Codec.encodeTable[i + 32768] = this._linear2alaw(i);
    }

    // 预计算解码表 (A-law to PCM 16-bit)
    for (let i = 0; i < 256; i++) {
      G711Codec.decodeTable[i] = this._alaw2linear(i);
    }
  }

  _linear2alaw(sample) {
    // 1. 提取符号位
    let sign = (sample >> 8) & 0x80; // 提取最高位（符号位）

    // 2. 处理负数，避免溢出
    if (sign) {
      if (sample === -32768) {
        sample = 32767; // 处理最小负数（避免溢出）
      } else {
        sample = -sample; // 取反，将负数转换为正数
      }
    }

    // 3. 限制样本范围
    if (sample > 32767) sample = 32767; // 确保样本不超过最大值

    // 4. 添加偏置（A-law编码的偏置为132）
    sample += 132;
    if (sample < 0) sample = 0; // 确保样本不为负

    // 5. 计算段号 (seg)
    let seg = 7; // 初始化段号为7（最大段号）
    for (let i = 0x4000; i >= 0x40 && (sample & i) === 0; i >>= 1) {
      seg--; // 根据样本的高位确定段号
    }

    // 6. 计算尾数 (mant)
    let mant = (sample >> (seg + 3)) & 0x0f; // 提取尾数（低4位）

    // 7. 组合段号和尾数
    let alaw = (seg << 4) | mant; // 将段号和尾数组合成8位值

    // 8. 根据符号位进行异或操作并返回结果
    return (alaw ^ (sign ? 0xD5 : 0x55)) & 0xff; // 异或操作并确保结果为8位
  }

  _alaw2linear(code) {
    let c = code ^ 0x55;
    const seg = (c & 0x70) >> 4;
    const quant = c & 0x0f;
    let sample = (quant << 4) | 0x08;
    if (seg > 0) {
      sample = (sample + 0x100) << (seg - 1);
    }
    return (c & 0x80) ? sample : -sample;
  }

  linear2alaw(sample) {
    // 确保 sample 在 Int16 范围内并映射到 0-65535
    const index = (sample + 32768) & 0xffff;
    return G711Codec.encodeTable[index];
  }

  encode(pcmData) {
    const encoded = new Uint8Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      encoded[i] = this.linear2alaw(pcmData[i]);
    }
    return encoded;
  }

  alaw2linear(code) {
    return G711Codec.decodeTable[code & 0xff];
  }

}

const g711Codec = new G711Codec();


export function g711Encode(mdc1200Data, tailFrequency = 800, tailDuration = 0.1, sampleRate = 8000) {
  if (!(mdc1200Data instanceof Uint8Array)) {
    throw new TypeError('Input data must be Uint8Array');
  }

  // 引入 G.711 编码器（需要提前准备 g711Codec 模块）
  //const g711Codec = require('g711'); // 确保安装了 g711 模块： npm install g711

  // 生成尾音 PCM 数据
  const numSamples = Math.floor(sampleRate * tailDuration);
  const tailTone = new Int16Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const sample = Math.sin((2 * Math.PI * tailFrequency * i) / sampleRate);
    tailTone[i] = Math.floor(sample * 32767); // 归一化到 16-bit PCM 范围
  }

  // 将 MDC1200 PCM 数据与尾音数据合并
  const combinedPCM = new Int16Array(mdc1200Data.length * 2 + tailTone.length);

  // 将 MDC1200 数据转换为 PCM 格式并写入 combinedPCM
  for (let i = 0; i < mdc1200Data.length; i++) {
    const pcmValue = (mdc1200Data[i] - 127) << 8;
    combinedPCM[i] = pcmValue;
  }

  // 将尾音数据添加到 combinedPCM 的尾部
  combinedPCM.set(tailTone, mdc1200Data.length);

  // 编码为 G.711 A-law 格式
  const g711Data = new Uint8Array(combinedPCM.length);
  for (let i = 0; i < combinedPCM.length; i++) {
    g711Data[i] = g711Codec.linear2alaw(combinedPCM[i]);
  }

  return g711Data; // 返回 G.711 编码后的数据
}

export function MDC2g711Encode(mdc1200Data) {

  // 编码为 G.711 A-law 格式
  const g711Data = new Uint8Array(mdc1200Data.length);
  for (let i = 0; i < mdc1200Data.length; i++) {
    g711Data[i] = g711Codec.linear2alaw(mdc1200Data[i]);
  }

  return g711Data; // 返回 G.711 编码后的数据
}


export default {
  G711Codec,
  g711Encode,
  MDC2g711Encode
};

