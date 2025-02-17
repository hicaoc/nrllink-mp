// audioPlayer.js
const webAudioContext = wx.createWebAudioContext();

// 音频流相关参数
const SAMPLE_RATE = 8000;

// 建议选择较小的值，以降低延迟
// #if MP
const BUFFER_SIZE = 1024; 
// #elif IOS
const BUFFER_SIZE = 2048; 
// #elif ANDROID
const BUFFER_SIZE = 4096;
// #endif

// WebAudio 资源
const audioContext = webAudioContext;
const gainNode = audioContext.createGain();
gainNode.connect(audioContext.destination);
gainNode.gain.value = 2.0;

//gainNode.gain.value = 1.0;

let scriptProcessorNode = null;

// G.711 编解码器
import * as g711 from './audioG711';
const g711Codec = new g711.G711Codec();

// 用于存储未播放的 PCM 数据
let pcmBuffer = new Float32Array(0);



// 调试 Web Audio 初始化
function initWebAudio() {



    try {
        scriptProcessorNode = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
        scriptProcessorNode.connect(gainNode);

        scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
            //  console.log("onaudioprocess triggered");
            const outputBuffer = audioProcessingEvent.outputBuffer;
            const outputData = outputBuffer.getChannelData(0);

            if (pcmBuffer.length >= BUFFER_SIZE) {
                for (let i = 0; i < BUFFER_SIZE; i++) {
                    outputData[i] = pcmBuffer[i];
                }
                pcmBuffer = pcmBuffer.slice(BUFFER_SIZE);
            } else {
                for (let i = 0; i < BUFFER_SIZE; i++) {
                    outputData[i] = 0;
                }
            }
        };

        audioContext.resume().then(() => {
            console.log("AudioContext resumed.");
        }).catch((err) => {
            console.error("Failed to resume AudioContext:", err);
        });


        audioContext.resume().then(() => {
            console.log("AudioContext resumed.");
        }).catch((err) => {
            console.error("Failed to resume AudioContext:", err);
        });

        console.log("Web Audio initialized successfully.");

        // 添加状态监听
        audioContext.onstatechange = () => {
            console.log('AudioContext state changed to:', audioContext.state);

            if (audioContext.state === 'suspended') {
                console.log('AudioContext is suspended. Possibly due to backgrounding.');
                pcmBuffer = new Float32Array(0);
                console.log('pcmBuffer cleared.');
                // 在这里处理音频上下文被挂起的情况
                // 例如：保存当前状态，清除数据，停止播放等
            } else if (audioContext.state === 'running') {

                console.log('AudioContext is running.  Resetting pcmBuffer');
                // 在这里处理音频上下文恢复运行的情况
                // 例如：恢复播放，重新加载数据等
                // pcmBuffer = new Float32Array(0);
                // console.log('pcmBuffer cleared.');
            }
        };




        console.log("Web Audio initialized successfully.");
    } catch (err) {
        console.error("Failed to initialize Web Audio:", err);
    }
}


// 接收 G.711 数据并解码
async function play(data, type) {
    if (type === 1) {
        const pcmData = new Int16Array(data.length);
        for (let i = 0; i < data.length; i++) {
            pcmData[i] = g711Codec.alaw2linear(data[i]);
        }

        const float32Data = new Float32Array(pcmData.length);
        for (let i = 0; i < pcmData.length; i++) {
            float32Data[i] = Math.max(-1, Math.min(1, pcmData[i] / 32768.0));
        }

        // 采样率转换
        const resampledData = resamplePCM(float32Data, SAMPLE_RATE, audioContext.sampleRate);

        // 合并 PCM 数据
        const newPcmBuffer = new Float32Array(pcmBuffer.length + resampledData.length);
        newPcmBuffer.set(pcmBuffer, 0);
        newPcmBuffer.set(resampledData, pcmBuffer.length);
        pcmBuffer = newPcmBuffer;
    }
}

function resamplePCM(input, inputSampleRate, outputSampleRate) {
    const ratio = outputSampleRate / inputSampleRate;
    const outputLength = Math.round(input.length * ratio);
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
        const originalIndex = i / ratio;
        const lowerIndex = Math.floor(originalIndex);
        const upperIndex = Math.min(Math.ceil(originalIndex), input.length - 1);
        const weight = originalIndex - lowerIndex;

        output[i] = input[lowerIndex] * (1 - weight) + input[upperIndex] * weight;
    }

    return output;
}

module.exports = {
    initWebAudio,
    play,
};