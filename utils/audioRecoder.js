const recorderManager = wx.getRecorderManager();


// 初始化音频上下文

// const gainNode = audioContext.createGain();
// gainNode.connect(audioContext.destination);



import * as g711 from './audioG711';
const g711Codec = new g711.G711Codec(); 

class AudioRecorder {
  constructor(codec, onStop) {
    this.codec = codec;
    this.onStop = onStop;
    this.frameQueue = [];
    this.resolveNextFrame = null;
    this.g711Codec = g711Codec; // 使用全局实例
    this.initRecorder();
  }

  initRecorder() {
    recorderManager.onStart(() => {
      console.log('recorder start');
    });

    recorderManager.onStop(() => {
      // 解除 getNextAudioFrame() 的等待，返回 null 让调用方退出循环
      if (this.resolveNextFrame) {
        this.resolveNextFrame(null);
        this.resolveNextFrame = null;
      }
      if (this.onStop) this.onStop();
    });

    recorderManager.onFrameRecorded((res) => {
      if (res.frameBuffer) {
       // console.log('getNextAudioFrame', res.frameBuffer);
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
      duration: 600000, // 最大10分钟，默认60秒
    });
  }

  stop() {
    recorderManager.stop();
    this.frameQueue = [];
    // onStop 事件会负责 resolve，这里不重复调用
  }
}

function startRecording(codec, onStop) {
  return new Promise((resolve) => {
    const recorder = new AudioRecorder(codec, onStop);
    recorder.start();
    resolve(recorder);
  });
}

function stopRecording(recorder) {
  recorder.stop();
}






module.exports = {
  startRecording,
  stopRecording,

};
