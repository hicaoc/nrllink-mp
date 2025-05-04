// audioPlayer.js
console.log("audioPlayer.js loaded");



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

let pcmBuffer = new Float32Array(0);

// WebAudio 资源
const webAudioContext = wx.createWebAudioContext();

const gainNode = webAudioContext.createGain();
gainNode.connect(webAudioContext.destination);
gainNode.gain.value = 2.5;

//gainNode.gain.value = 1.0;


 const scriptProcessorNode = webAudioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
scriptProcessorNode.connect(gainNode);




// G.711 编解码器
import * as g711 from './audioG711';
const g711Codec = new g711.G711Codec();

// 用于存储未播放的 PCM 数据




// 调试 Web Audio 初始化
function initWebAudio() {

    try {

        // webAudioContext.close().then(() => {
        //     console.log(audioCtx.state) // bad case：不应该在close后再访问state
        //   })
        // audioContext = webAudioContext;
        // gainNode = audioContext.createGain();
        // gainNode.connect(audioContext.destination);
        // gainNode.gain.value = 2.0;
        pcmBuffer = new Float32Array(0);

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
        



        wx.onAudioInterruptionEnd(() => {
            webAudioContext.resume().then(() => {
                console.log("AudioContext resumed app.");
            }).catch((err) => {
                console.error("Failed to resume AudioContext:", err);
            });
        })


        webAudioContext.resume().then(() => {
            console.log("AudioContext resumed 1.");
        }).catch((err) => {
            console.error("Failed to resume AudioContext:", err);
        });

        // audioContext.suspend().then(() => {
        //     console.log("AudioContext suspend.");
        // }).catch((err) => {
        //     console.error("Failed to suspend AudioContext:", err);
        // });



        //添加状态监听
        webAudioContext.onstatechange = () => {
            console.log('AudioContext state changed to:', webAudioContext.state);

            if (webAudioContext.state === 'suspended') {
                console.log('AudioContext is suspended. Possibly due to backgrounding.');
                pcmBuffer = new Float32Array(0);
                console.log('pcmBuffer cleared.');
                // 在这里处理音频上下文被挂起的情况
                // 例如：保存当前状态，清除数据，停止播放等
            } else if (webAudioContext.state === 'running') {

                console.log('AudioContext is running');
                // audioContext.resume().then(() => {
                //     console.log("AudioContext resumed 2.");
                // }).catch((err) => {
                //     console.error("Failed to resume AudioContext:", err);
                // });

                // 在这里处理音频上下文恢复运行的情况
                // 例如：恢复播放，重新加载数据等
                pcmBuffer = new Float32Array(0);
                console.log('pcmBuffer cleared.');
            }
        };

        console.log("Web Audio initialized successfully.");
    } catch (err) {
        console.error("Failed to initialize Web Audio:", err);
    }
}

function suspend() {
    webAudioContext.suspend().then(() => {
        console.log("AudioContext suspend .");
    }).catch((err) => {
        console.error("Failed to suspend AudioContext:", err);
    });
    pcmBuffer = new Float32Array(0);
}

function resume() {
    webAudioContext.resume().then(() => {
        console.log("AudioContext resume .");
    }).catch((err) => {
        console.error("Failed to resume AudioContext:", err);
    });
    pcmBuffer = new Float32Array(0);
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
        const resampledData = resamplePCM(float32Data, SAMPLE_RATE, webAudioContext.sampleRate);

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
    suspend,
    resume,

};