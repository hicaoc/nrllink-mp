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
  // 1. 提取符号位和处理符号
  let sign = 0;
  if (sample < 0) {
    sign = 0x80;
    sample = ~sample;  // ✅ 使用按位取反，而非取负
  }
  
  // 2. 右移4位（使用13位中的12位MSB）
  sample = sample >> 4;
  
 
  // 4. 计算指数和尾数
  let ix = sample;
  if (ix > 15) {
    let iexp = 1;
    while (ix > 31) {  // 16 + 15 = 31
      ix >>= 1;
      iexp++;
    }
    ix -= 16;  // 移除前导 '1'
    ix += iexp << 4;
  }
  
  // 5. 添加符号位
  if (sign === 0) {  // 正数
    ix |= 0x80;
  }
  
  // 6. ✅ 统一异或 0x55（不区分正负）
  return ix ^ 0x55;
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

