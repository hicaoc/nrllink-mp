// audioPlayer.js
console.log('audioPlayer.js loaded');

import * as g711 from './audioG711';

const SAMPLE_RATE = 8000;

// Keep the WebAudio scheduling quantum near 10.7ms at 48kHz. A larger
// quantum would add tens of milliseconds after the packet target is reached.
const BUFFER_SIZE = 512;

const SMALL_PACKET_SIZE = 160;
const LARGE_PACKET_SIZE = 500;
const SMALL_PACKET_MIN_TARGET = 1;
const SMALL_PACKET_MAX_TARGET = 5;
const MAX_BUFFER_MS = 400;
const STREAM_GAP_RESET_MS = 500;
const STABLE_PACKETS_TO_REDUCE_TARGET = 50;

let pcmBuffer = new Float32Array(0);
let isWebAudioInitialized = false;
let isPlaybackPrimed = false;
let prebufferPacketCount = 0;
let prebufferPacketSize = 0;
let lastPacketArrivalAt = 0;
let lastPacketDurationMs = 0;
let jitterEstimateMs = 0;
let adaptiveSmallPacketFloor = SMALL_PACKET_MIN_TARGET;
let stablePacketCount = 0;
let activeStreamId = null;

const webAudioContext = wx.createWebAudioContext();
const gainNode = webAudioContext.createGain();
gainNode.connect(webAudioContext.destination);
gainNode.gain.value = 2.5;

const scriptProcessorNode = webAudioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
scriptProcessorNode.connect(gainNode);

const g711Codec = new g711.G711Codec();

function initWebAudio() {
    if (isWebAudioInitialized) return;

    try {
        resetJitterBuffer();

        scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
            const outputData = audioProcessingEvent.outputBuffer.getChannelData(0);

            if (!isPlaybackPrimed && canStartPlayback()) {
                isPlaybackPrimed = true;
                prebufferPacketCount = 0;
            }

            if (!isPlaybackPrimed) return;

            if (pcmBuffer.length < BUFFER_SIZE) {
                // Keep the short tail intact. No zero samples are appended to the PCM
                // queue; playback resumes only after enough real samples arrive.
                handleUnderflow({ preserveBuffer: true });
                return;
            }

            outputData.set(pcmBuffer.subarray(0, BUFFER_SIZE));
            pcmBuffer = pcmBuffer.slice(BUFFER_SIZE);
        };

        wx.onAudioInterruptionEnd(() => {
            webAudioContext.resume().then(() => {
                console.log('AudioContext resumed app.');
            }).catch((err) => {
                console.error('Failed to resume AudioContext:', err);
            });
        });

        webAudioContext.onstatechange = () => {
            console.log('AudioContext state changed to:', webAudioContext.state);
            if (webAudioContext.state === 'suspended' || webAudioContext.state === 'running') {
                resetJitterBuffer();
                console.log('pcmBuffer cleared.');
            }
        };

        isWebAudioInitialized = true;
        console.log('Web Audio initialized successfully.');
    } catch (err) {
        console.error('Failed to initialize Web Audio:', err);
    }
}

function suspend() {
    webAudioContext.suspend().then(() => {
        console.log('AudioContext suspend.');
    }).catch((err) => {
        console.error('Failed to suspend AudioContext:', err);
    });
    resetJitterBuffer();
}

function clearBuffer() {
    resetJitterBuffer();
}

function resume() {
    if (isRunning()) return;

    webAudioContext.resume().then(() => {
        console.log('AudioContext resume.');
    }).catch((err) => {
        console.error('Failed to resume AudioContext:', err);
    });
    resetJitterBuffer();
}

function getState() {
    return webAudioContext.state;
}

function isRunning() {
    return webAudioContext.state === 'running';
}

// Receive G.711 data and decode it. Kept for compatibility with old callers.
async function play(data, type) {
    if (type !== 1) return;

    const pcmData = new Int16Array(data.length);
    for (let i = 0; i < data.length; i++) {
        pcmData[i] = g711Codec.alaw2linear(data[i]);
    }
    playPCM(pcmData);
}

function playPCM(pcmData, options = {}) {
    if (!pcmData || pcmData.length === 0) return;

    const now = Date.now();
    const packetSize = pcmData.length;
    const packetDurationMs = packetSize * 1000 / SAMPLE_RATE;
    const streamId = options.streamId == null ? null : String(options.streamId);

    if (streamId !== null && activeStreamId !== null && streamId !== activeStreamId) {
        resetJitterBuffer();
    }
    if (streamId !== null) activeStreamId = streamId;

    if (lastPacketArrivalAt > 0) {
        const arrivalIntervalMs = now - lastPacketArrivalAt;
        if (arrivalIntervalMs > STREAM_GAP_RESET_MS) {
            // Treat a long receive gap as a new talk burst and discard stale tail audio.
            resetJitterBuffer({ keepStreamId: true });
        } else {
            updateJitterEstimate(arrivalIntervalMs, lastPacketDurationMs);
        }
    }

    lastPacketArrivalAt = now;
    lastPacketDurationMs = packetDurationMs;

    if (!isPlaybackPrimed) {
        if (prebufferPacketCount > 0 && prebufferPacketSize !== packetSize) {
            // Packet size normally stays constant in one talk burst. Restart cleanly if it changes.
            pcmBuffer = new Float32Array(0);
            prebufferPacketCount = 0;
        }
        prebufferPacketSize = packetSize;
        prebufferPacketCount++;
    }

    const float32Data = new Float32Array(packetSize);
    for (let i = 0; i < packetSize; i++) {
        float32Data[i] = Math.max(-1, Math.min(1, pcmData[i] / 32768.0));
    }

    appendToPlaybackBuffer(resamplePCM(float32Data, SAMPLE_RATE, webAudioContext.sampleRate));
}

function updateJitterEstimate(arrivalIntervalMs, expectedIntervalMs) {
    if (expectedIntervalMs <= 0) return;

    const deviationMs = Math.abs(arrivalIntervalMs - expectedIntervalMs);
    // RFC3550-style EWMA smooths scheduling noise while still following network jitter.
    jitterEstimateMs += (deviationMs - jitterEstimateMs) / 16;

    if (deviationMs < 3) {
        stablePacketCount++;
        if (stablePacketCount >= STABLE_PACKETS_TO_REDUCE_TARGET) {
            adaptiveSmallPacketFloor = Math.max(
                SMALL_PACKET_MIN_TARGET,
                adaptiveSmallPacketFloor - 1
            );
            stablePacketCount = 0;
        }
    } else {
        stablePacketCount = 0;
    }
}

function getTargetPacketCount(packetSize) {
    if (packetSize === LARGE_PACKET_SIZE) return 1;

    if (packetSize === SMALL_PACKET_SIZE) {
        let jitterTarget = SMALL_PACKET_MIN_TARGET;
        if (jitterEstimateMs >= 15) jitterTarget = 5;
        else if (jitterEstimateMs >= 10) jitterTarget = 4;
        else if (jitterEstimateMs >= 6) jitterTarget = 3;
        else if (jitterEstimateMs >= 3) jitterTarget = 2;

        return Math.max(adaptiveSmallPacketFloor, jitterTarget);
    }

    // Unknown packet sizes target about 60ms, bounded to the same 1..5 packet range.
    const packetDurationMs = packetSize * 1000 / SAMPLE_RATE;
    return Math.max(1, Math.min(5, Math.ceil(60 / packetDurationMs)));
}

function canStartPlayback() {
    if (prebufferPacketSize === 0 || pcmBuffer.length < BUFFER_SIZE) return false;

    const samplesPerPacket = Math.round(
        prebufferPacketSize * webAudioContext.sampleRate / SAMPLE_RATE
    );
    const targetSamples = samplesPerPacket * getTargetPacketCount(prebufferPacketSize);
    return pcmBuffer.length >= targetSamples;
}

function handleUnderflow({ preserveBuffer = false } = {}) {
    if (!preserveBuffer) pcmBuffer = new Float32Array(0);
    isPlaybackPrimed = false;
    prebufferPacketCount = 0;
    stablePacketCount = 0;
    adaptiveSmallPacketFloor = Math.min(
        SMALL_PACKET_MAX_TARGET,
        adaptiveSmallPacketFloor + 1
    );
}

function appendToPlaybackBuffer(data) {
    const maxSamples = Math.ceil(MAX_BUFFER_MS * webAudioContext.sampleRate / 1000);
    const combinedLength = pcmBuffer.length + data.length;
    const keptLength = Math.min(combinedLength, maxSamples);
    const newPcmBuffer = new Float32Array(keptLength);

    if (combinedLength <= maxSamples) {
        newPcmBuffer.set(pcmBuffer, 0);
        newPcmBuffer.set(data, pcmBuffer.length);
    } else {
        // Drop the oldest samples so a stalled consumer cannot accumulate latency forever.
        const oldSamplesToKeep = Math.max(0, keptLength - data.length);
        if (oldSamplesToKeep > 0) {
            newPcmBuffer.set(pcmBuffer.subarray(pcmBuffer.length - oldSamplesToKeep), 0);
        }
        const dataSamplesToKeep = Math.min(data.length, keptLength);
        newPcmBuffer.set(
            data.subarray(data.length - dataSamplesToKeep),
            keptLength - dataSamplesToKeep
        );
    }

    pcmBuffer = newPcmBuffer;
}

function resetJitterBuffer({ keepStreamId = false } = {}) {
    pcmBuffer = new Float32Array(0);
    isPlaybackPrimed = false;
    prebufferPacketCount = 0;
    prebufferPacketSize = 0;
    lastPacketArrivalAt = 0;
    lastPacketDurationMs = 0;
    jitterEstimateMs = 0;
    adaptiveSmallPacketFloor = SMALL_PACKET_MIN_TARGET;
    stablePacketCount = 0;
    if (!keepStreamId) activeStreamId = null;
}

function getBufferStats() {
    return {
        bufferedMs: pcmBuffer.length * 1000 / webAudioContext.sampleRate,
        jitterEstimateMs,
        targetPacketCount: getTargetPacketCount(prebufferPacketSize || SMALL_PACKET_SIZE),
        prebufferPacketCount,
        prebufferPacketSize,
        isPlaybackPrimed,
    };
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
    playPCM,
    suspend,
    resume,
    clearBuffer,
    resetJitterBuffer,
    getBufferStats,
    getState,
    isRunning,
};
