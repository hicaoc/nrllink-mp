const recorderManager = wx.getRecorderManager();
const webAudioContext = wx.createWebAudioContext();

// 音频播放队列
let audioQueue = [];
let isPlaying = false;

// 初始化音频上下文
const audioContext = webAudioContext;
const gainNode = audioContext.createGain();
gainNode.connect(audioContext.destination);

// 音频输出管理
let currentAudioOutput = 'speaker'; // 默认扬声器
let isBluetoothConnected = false;

// 初始化蓝牙状态
wx.getBluetoothAdapterState({
  success: (res) => {
    isBluetoothConnected = res.available && res.discovering;
    currentAudioOutput = isBluetoothConnected ? 'bluetooth' : 'speaker';
  }
});

// 监听蓝牙适配器状态变化
wx.onBluetoothAdapterStateChange((res) => {
  isBluetoothConnected = res.available && res.discovering;
  currentAudioOutput = isBluetoothConnected ? 'bluetooth' : 'speaker';
});

function setAudioOutput(outputType) {
  return new Promise((resolve, reject) => {
    if (outputType === 'bluetooth' && !isBluetoothConnected) {
      return reject(new Error('蓝牙设备未连接'));
    }

    // 设置音频输出选项
    wx.setInnerAudioOption({
      obeyMuteSwitch: false,
      speakerOn: outputType !== 'earpiece'
    });

    currentAudioOutput = outputType;
    resolve();
  });
}

// 音频播放器
class AudioPlayer {
  constructor() {
    this.source = null;
    this.buffer = null;
  }

  async play(buffer) {
    if (this.source) {
      this.source.stop();
    }
    this.buffer = buffer;
    this.source = audioContext.createBufferSource();
    this.source.buffer = buffer;
    
    // 根据当前音频输出模式设置
    setAudioOutput(currentAudioOutput)
      .then(() => {
        this.source.connect(gainNode);
        this.source.start(0);
        this.source.onended = () => {
          audioQueue.shift();
          if (audioQueue.length > 0) {
            this.play(audioQueue[0]);
          } else {
            isPlaying = false;
          }
        };
      })
      .catch((err) => {
        console.error('音频输出设置失败:', err);
        // 回退到默认扬声器模式
        currentAudioOutput = 'speaker';
        this.source.connect(gainNode);
        this.source.start(0);
      });
  }
}

const player = new AudioPlayer();
// 全局G711编解码器实例

// G.711编解码器
class G711Codec {
  constructor() {
    this.SEG_SHIFT = 4;
    this.QUANT_MASK = 0xf;
    this.SEG_MASK = 0x70;
    this.BIAS = 0x84;

    console.log("g711code")
  }

  

  linear2alaw(sample) {
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
  encode(pcmData) {
    const encoded = new Uint8Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      encoded[i] = this.linear2alaw(pcmData[i]);
    }
    return encoded;
  }

  alaw2linear(code) {
    code ^= 0x55;
    const seg = (code & this.SEG_MASK) >> 4;
    const quant = code & this.QUANT_MASK;
    let sample = (quant << 4) | 0x08;
    
    if (seg > 0) {
      sample = (sample + 0x100) << (seg - 1);
    }
    
    if (code & 0x80) {
      return sample;
    }
    return -sample;
  }
}

const g711Codec = new G711Codec(); 

class AudioRecorder {
  constructor(codec) {
    this.codec = codec;
    this.frameQueue = [];
    this.resolveNextFrame = null;
    this.g711Codec = g711Codec; // 使用全局实例
    this.initRecorder();
  }

  initRecorder() {
    recorderManager.onStart(() => {
      console.log('recorder start');
    });

    recorderManager.onFrameRecorded((res) => {
      
      if (res.frameBuffer) {
        this.frameQueue.push(res.frameBuffer);
        if (this.resolveNextFrame) {
          this.resolveNextFrame(this.frameQueue.shift());
          this.resolveNextFrame = null;
        }
      }
    });
  }

  async getNextAudioFrame() { 
    
    let frame;
    if (this.frameQueue.length > 0) {
      frame = this.frameQueue.shift();
    } else {
      frame = await new Promise((resolve) => {
        this.resolveNextFrame = resolve;
      });
    }

    if (this.codec === 'g711') {  
      const encoded = this.g711Codec.encode(new Int16Array(frame));
      //console.log('getNextAudioFrame', frame ,'encoded:', encoded);

      // if (encoded.length >= 512) {
      //   return encoded.slice(0, 512);
      // }

      return encoded;
    }
    return frame;
  }

  start() {
    recorderManager.start({
      format: 'PCM',
      sampleRate: 8000,
      encodeBitRate: 16000,
      numberOfChannels: 1,
      frameSize: 1,
    });
  }

  stop() {
    recorderManager.stop();
    this.frameQueue = [];
    if (this.resolveNextFrame) {
      this.resolveNextFrame(null);
    }
  }
}

function startRecording(codec) {
  return new Promise((resolve) => {
    const recorder = new AudioRecorder(codec);
    recorder.start();
    resolve(recorder);
  });
}

function stopRecording(recorder) {
  recorder.stop();
}

async function play(data, type) {
  if (type === 1) { // G711
    // 解码G711数据
    const pcmData = new Int16Array(data.length);
    for (let i = 0; i < data.length; i++) {
      pcmData[i] = g711Codec.alaw2linear(data[i]);
    }
    
    // 将PCM数据转换为AudioBuffer
    const buffer = audioContext.createBuffer(1, pcmData.length, 8000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < pcmData.length; i++) {
      channelData[i] = pcmData[i] / 32768.0;
    }
    
    audioQueue.push(buffer);
    if (!isPlaying) {
      isPlaying = true;
      player.play(buffer);
    }
    
  } else if (type === 8) { // Opus
    const arrayBuffer = await new Response(data).arrayBuffer();
    const buffer = await audioContext.decodeAudioData(arrayBuffer);
    
    audioQueue.push(buffer);
    if (!isPlaying) {
      isPlaying = true;
      player.play(buffer);
    }
  }
}

/**
 * G.711 编码器 (A-law)
 * @param {Uint8Array} mdc1200Data - MDC1200 的编码数据
 * @param {number} tailFrequency - 尾音的频率 (Hz)
 * @param {number} tailDuration - 尾音的持续时间 (秒)
 * @param {number} sampleRate - 采样率 (Hz)
 * @returns {ArrayBuffer} G.711 (A-law) 编码后的数据
 */
function g711Encode(mdc1200Data, tailFrequency = 800, tailDuration = 0.1, sampleRate = 8000) {
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


module.exports = {
  startRecording,
  stopRecording,
  play,
  g711Encode
};
