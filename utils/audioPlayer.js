// audioPlayer.js
const webAudioContext = wx.createWebAudioContext();

// 音频流相关参数
const SAMPLE_RATE = 8000;
const BUFFER_SIZE = 1024;

// WebAudio 资源
const audioContext = webAudioContext;
const gainNode = audioContext.createGain();
gainNode.connect(audioContext.destination);

let scriptProcessorNode = null;

// G.711 编解码器
import * as g711 from './audioG711';
const g711Codec = new g711.G711Codec();

// 用于保存 source 节点，防止被垃圾回收
let currentSource = null;

// 初始化 WebAudio
function initWebAudio() {
    scriptProcessorNode = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

    scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
        const outputBuffer = audioProcessingEvent.outputBuffer;
        const outputData = outputBuffer.getChannelData(0);

        // 静音填充
        for (let i = 0; i < BUFFER_SIZE; i++) {
            outputData[i] = 0; // 默认填充静音
        }
    };

    scriptProcessorNode.connect(gainNode);
}

// 接收 G.711 数据并解码
async function play(data, type) {
    if (type === 1) {
        const pcmData = new Int16Array(data.length);
        for (let i = 0; i < data.length; i++) {
            pcmData[i] = g711Codec.alaw2linear(data[i]);
        }

       
        // 直接播放 PCM 数据
        playPCMData(pcmData);
    }
}

// 播放 PCM 数据
function playPCMData(pcmData) {
    //console.log("pcmData.length:", pcmData.length);  // 调试

    const buffer = audioContext.createBuffer(1, pcmData.length, SAMPLE_RATE);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < pcmData.length; i++) {
        channelData[i] = pcmData[i] / 32768.0;
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNode);

    // 保存 source 引用，防止被垃圾回收
    currentSource = source;

    source.onended = () => {
        // 播放结束后释放资源
        source.disconnect();
        currentSource = null;
        
    };

    source.start(0);
    
}

module.exports = {
    initWebAudio,
    play,
};