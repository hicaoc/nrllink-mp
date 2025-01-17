const recorderManager = wx.getRecorderManager();
const webAudioContext = wx.createWebAudioContext();

// 音频播放队列
let audioQueue = [];
let isPlaying = false;

// 初始化音频上下文
const audioContext = webAudioContext;
const gainNode = audioContext.createGain();
gainNode.connect(audioContext.destination);

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
  }
}

const player = new AudioPlayer();

// G.711编解码器
class G711Codec {
  constructor() {
    this.SEG_SHIFT = 4;
    this.QUANT_MASK = 0xf;
    this.SEG_MASK = 0x70;
    this.BIAS = 0x84;
  }

  linear2alaw(sample) {
    let sign = (sample >> 8) & 0x80;
    if (sign) sample = -sample;
    if (sample > 32767) sample = 32767;
    
    sample += 132;
    if (sample < 0) sample = 0;
    
    let seg = 7;
    for (let i = 0x4000; i > 0 && (sample & i) === 0; i >>= 1) {
      seg--;
    }
    
    let mant = (seg === 0) ? (sample >> 4) : (sample >> (seg + 3));
    let alaw = (seg << 4) | (mant & 0x0f);
    
    return (sign ? (alaw ^ 0xD5) : (alaw ^ 0x55)) & 0xff;
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

class AudioRecorder {
  constructor(codec) {
    this.codec = codec;
    this.frameQueue = [];
    this.resolveNextFrame = null;
    this.g711Codec = new G711Codec();
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

      console.log(frame)

      const encoded = this.g711Codec.encode(new Int16Array(frame));
      // 确保每次返回500字节(62.5ms)

      console.log(frame,encoded)
    
      if (encoded.length >= 512) {
        return encoded.slice(0, 512);
      }
      return encoded;
    }
    return frame;
  }

  start() {
    recorderManager.start({
      format: 'PCM',
      sampleRate: 8000,
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
    const g711Codec = new G711Codec();
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

module.exports = {
  startRecording,
  stopRecording,
  play
};
