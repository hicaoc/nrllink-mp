const recorderManager = wx.getRecorderManager();
const innerAudioContext = wx.createInnerAudioContext();

class AudioRecorder {
  constructor(codec) {
    this.codec = codec;
    this.frameQueue = [];
    this.resolveNextFrame = null;
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
    if (this.frameQueue.length > 0) {
      return this.frameQueue.shift();
    }
    return new Promise((resolve) => {
      this.resolveNextFrame = resolve;
    });
  }

  start() {
    const format = this.codec === 'g711' ? 'PCM' : 'OPUS';
    const frameSize = this.codec === 'g711' ? 500 : 80; // G711: 500字节/帧, Opus: 80字节/帧
    recorderManager.start({
      format,
      sampleRate: 8000,
      numberOfChannels: 1,
      frameSize
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
  if (type === 5) { // G711
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
