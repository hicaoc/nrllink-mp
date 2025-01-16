const recorderManager = wx.getRecorderManager();
const innerAudioContext = wx.createInnerAudioContext();

// G.711编解码器
class G711Codec {
  constructor() {
    this.SEG_SHIFT = 4;
    this.QUANT_MASK = 0xf;
    this.SEG_MASK = 0x70;
    this.BIAS = 0x84;
  }

  linear2alaw(sample) {
    let mask = (sample >> 15) & 0xff;
    let seg;
    
    sample = Math.abs(sample);
    if (sample > 32767) sample = 32767;
    
    if (sample >= 256) {
      seg = this.SEG_MASK;
      sample = sample >> 4;
    } else {
      seg = 0;
      sample = sample >> 3;
    }
    
    return ((mask ^ 0x55) | (seg << 4) | ((sample >> 4) & this.QUANT_MASK)) & 0xff;
  }

  encode(pcmData) {
    const encoded = new Uint8Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      encoded[i] = this.linear2alaw(pcmData[i]);
    }
    return encoded;
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
      console.log('编码前长度:', frame)
      const encoded = this.g711Codec.encode(new Int16Array(frame));
      // 确保每次返回500字节(62.5ms)
      console.log('编码后长度:', encoded.length,encoded)
      if (encoded.length >= 500) {
        return encoded.slice(0, 500);
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

function play(data, type) {
  if (type === 1) { // G711
    innerAudioContext.src = data;
    innerAudioContext.play();
  } else if (type === 8) { // Opus
    innerAudioContext.src = URL.createObjectURL(new Blob([data], {type: 'audio/ogg'}));
    innerAudioContext.play();
  }
}

module.exports = {
  startRecording,
  stopRecording,
  play
};
