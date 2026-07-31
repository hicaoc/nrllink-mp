// audioPlayer.js
console.log('audioPlayer.js loaded');

import * as g711 from './audioG711';

const DEFAULT_SAMPLE_RATE = 8000;
const MAX_INPUT_SAMPLE_RATE = 16000;
const BUFFER_SIZE = 512;
const SMALL_PACKET_MIN_TARGET = 1;
const SMALL_PACKET_MAX_TARGET = 5;
const MAX_BUFFER_MS = 1000;
const STREAM_GAP_RESET_MS = 500;
const STABLE_PACKETS_TO_REDUCE_TARGET = 250; // About 5s for 20ms packets.
const SMALL_PACKET_START_HOLD_MS = 20;
const MAX_SPEED_ADJUSTMENT = 0.015;

class PcmRingBuffer {
    constructor(capacity) {
        this.capacity = capacity;
        this.data = new Float32Array(capacity);
        this.readIndex = 0;
        this.writeIndex = 0;
        this.size = 0;
    }

    get length() {
        return this.size;
    }

    clear() {
        this.readIndex = 0;
        this.writeIndex = 0;
        this.size = 0;
    }

    write(input) {
        let droppedSamples = 0;
        let start = 0;

        if (input.length >= this.capacity) {
            start = input.length - this.capacity;
            droppedSamples = this.size + start;
            this.clear();
        }

        for (let i = start; i < input.length; i++) {
            if (this.size === this.capacity) {
                this.readIndex = (this.readIndex + 1) % this.capacity;
                this.size--;
                droppedSamples++;
            }

            this.data[this.writeIndex] = input[i];
            this.writeIndex = (this.writeIndex + 1) % this.capacity;
            this.size++;
        }

        return droppedSamples;
    }

    get(offset) {
        if (offset < 0 || offset >= this.size) return 0;
        return this.data[(this.readIndex + offset) % this.capacity];
    }

    discard(count) {
        const discarded = Math.min(Math.max(0, count), this.size);
        this.readIndex = (this.readIndex + discarded) % this.capacity;
        this.size -= discarded;
        return discarded;
    }
}

const pcmRingBuffer = new PcmRingBuffer(Math.ceil(MAX_INPUT_SAMPLE_RATE * MAX_BUFFER_MS / 1000));

let isWebAudioInitialized = false;
let isPlaybackPrimed = false;
let prebufferStartedAt = 0;
let streamPacketSize = 0;
let streamPacketDurationMs = 0;
let activeInputSampleRate = DEFAULT_SAMPLE_RATE;
let lastPacketArrivalAt = 0;
let lastPacketDurationMs = 0;
let jitterEstimateMs = 0;
let adaptiveSmallPacketFloor = SMALL_PACKET_MIN_TARGET;
let stablePacketCount = 0;
let activeStreamId = null;
let sourceReadPosition = 0;
let lastSpeedAdjustment = 0;

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
            }

            // The ScriptProcessor output buffer is NOT zeroed between callbacks
            // on WeChat. Leaving it untouched replays the last rendered block
            // forever (e.g. a loud MDC tail), so always write silence when
            // there is no real audio to render.
            if (!isPlaybackPrimed) {
                outputData.fill(0);
                return;
            }

            if (!renderFromRingBuffer(outputData)) {
                outputData.fill(0);
                handleUnderflow();
            }
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
                console.log('PCM ring buffer cleared.');
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
    const inputSampleRate = Number(options.sampleRate) || DEFAULT_SAMPLE_RATE;
    if (inputSampleRate <= 0 || inputSampleRate > MAX_INPUT_SAMPLE_RATE) {
        console.warn(`Unsupported PCM sample rate: ${inputSampleRate}`);
        return;
    }
    const packetDurationMs = packetSize * 1000 / inputSampleRate;
    const streamId = options.streamId == null ? null : String(options.streamId);

    if (
        (streamId !== null && activeStreamId !== null && streamId !== activeStreamId) ||
        (streamPacketSize > 0 && activeInputSampleRate !== inputSampleRate)
    ) {
        resetJitterBuffer();
    }
    if (streamId !== null) activeStreamId = streamId;
    activeInputSampleRate = inputSampleRate;

    if (lastPacketArrivalAt > 0) {
        const arrivalIntervalMs = now - lastPacketArrivalAt;
        if (arrivalIntervalMs > STREAM_GAP_RESET_MS) {
            resetJitterBuffer({ keepStreamId: true });
            activeInputSampleRate = inputSampleRate;
        } else {
            updateJitterEstimate(arrivalIntervalMs, lastPacketDurationMs);
        }
    }

    lastPacketArrivalAt = now;
    lastPacketDurationMs = packetDurationMs;

    if (streamPacketSize === 0) {
        streamPacketSize = packetSize;
        streamPacketDurationMs = packetDurationMs;
    } else if (!isPlaybackPrimed && streamPacketSize !== packetSize) {
        // Packet size normally stays fixed in a talk burst. A change while waiting
        // starts a new clean prebuffer calculation without mixing policies.
        pcmRingBuffer.clear();
        sourceReadPosition = 0;
        streamPacketSize = packetSize;
        streamPacketDurationMs = packetDurationMs;
        prebufferStartedAt = 0;
    }

    const float32Data = new Float32Array(packetSize);
    for (let i = 0; i < packetSize; i++) {
        float32Data[i] = Math.max(-1, Math.min(1, pcmData[i] / 32768.0));
    }

    let droppedSamples = pcmRingBuffer.write(float32Data);
    const maxBufferedSamples = Math.ceil(activeInputSampleRate * MAX_BUFFER_MS / 1000);
    if (pcmRingBuffer.length > maxBufferedSamples) {
        droppedSamples += pcmRingBuffer.discard(pcmRingBuffer.length - maxBufferedSamples);
    }
    if (droppedSamples > 0) sourceReadPosition = 0;
    if (prebufferStartedAt === 0) prebufferStartedAt = now;
}

function updateJitterEstimate(arrivalIntervalMs, expectedIntervalMs) {
    if (expectedIntervalMs <= 0) return;

    const deviationMs = Math.abs(arrivalIntervalMs - expectedIntervalMs);
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

function isAdaptiveSmallFrame(packetDurationMs) {
    return packetDurationMs >= 15 && packetDurationMs <= 25;
}

function getTargetPacketCount(packetDurationMs) {
    if (isAdaptiveSmallFrame(packetDurationMs)) {
        let jitterTarget = SMALL_PACKET_MIN_TARGET;
        if (jitterEstimateMs >= 15) jitterTarget = 5;
        else if (jitterEstimateMs >= 10) jitterTarget = 4;
        else if (jitterEstimateMs >= 6) jitterTarget = 3;
        else if (jitterEstimateMs >= 3) jitterTarget = 2;

        return Math.max(adaptiveSmallPacketFloor, jitterTarget);
    }

    return Math.max(1, Math.min(5, Math.ceil(60 / packetDurationMs)));
}

function getTargetSourceSamples() {
    const packetSize = streamPacketSize || 160;
    const packetDurationMs = streamPacketDurationMs || 20;
    return packetSize * getTargetPacketCount(packetDurationMs);
}

function canStartPlayback() {
    if (streamPacketSize === 0 || pcmRingBuffer.length < getTargetSourceSamples()) return false;

    const targetPacketCount = getTargetPacketCount(streamPacketDurationMs);
    let startupHoldMs = 0;
    if (targetPacketCount === 1) {
        startupHoldMs = isAdaptiveSmallFrame(streamPacketDurationMs)
            ? SMALL_PACKET_START_HOLD_MS
            : BUFFER_SIZE * 1000 / webAudioContext.sampleRate;
    }
    if (Date.now() - prebufferStartedAt < startupHoldMs) return false;

    return hasEnoughSourceSamples(getNominalSourceStep());
}

function getNominalSourceStep() {
    return activeInputSampleRate / webAudioContext.sampleRate;
}

function getPlaybackSourceStep() {
    const targetSamples = getTargetSourceSamples();
    const occupancyError = pcmRingBuffer.length - targetSamples;
    const normalizedError = occupancyError / Math.max(targetSamples, streamPacketSize || 1);
    lastSpeedAdjustment = Math.max(
        -MAX_SPEED_ADJUSTMENT,
        Math.min(MAX_SPEED_ADJUSTMENT, normalizedError * 0.01)
    );
    return getNominalSourceStep() * (1 + lastSpeedAdjustment);
}

function getRequiredSourceSamples(sourceStep) {
    return Math.floor(sourceReadPosition + sourceStep * (BUFFER_SIZE - 1)) + 2;
}

function hasEnoughSourceSamples(sourceStep) {
    return pcmRingBuffer.length >= getRequiredSourceSamples(sourceStep);
}

function renderFromRingBuffer(outputData) {
    const sourceStep = getPlaybackSourceStep();
    if (!hasEnoughSourceSamples(sourceStep)) return false;

    let position = sourceReadPosition;
    for (let i = 0; i < BUFFER_SIZE; i++) {
        const lowerIndex = Math.floor(position);
        const weight = position - lowerIndex;
        const lowerSample = pcmRingBuffer.get(lowerIndex);
        const upperSample = pcmRingBuffer.get(lowerIndex + 1);
        outputData[i] = lowerSample * (1 - weight) + upperSample * weight;
        position += sourceStep;
    }

    const consumedSamples = Math.floor(position);
    pcmRingBuffer.discard(consumedSamples);
    sourceReadPosition = position - consumedSamples;
    return true;
}

function handleUnderflow() {
    isPlaybackPrimed = false;
    prebufferStartedAt = Date.now();
    stablePacketCount = 0;
    lastSpeedAdjustment = 0;

    if (isAdaptiveSmallFrame(streamPacketDurationMs)) {
        adaptiveSmallPacketFloor = Math.min(
            SMALL_PACKET_MAX_TARGET,
            adaptiveSmallPacketFloor + 1
        );
    }
}

function resetJitterBuffer({ keepStreamId = false } = {}) {
    pcmRingBuffer.clear();
    isPlaybackPrimed = false;
    prebufferStartedAt = 0;
    streamPacketSize = 0;
    streamPacketDurationMs = 0;
    activeInputSampleRate = DEFAULT_SAMPLE_RATE;
    lastPacketArrivalAt = 0;
    lastPacketDurationMs = 0;
    jitterEstimateMs = 0;
    adaptiveSmallPacketFloor = SMALL_PACKET_MIN_TARGET;
    stablePacketCount = 0;
    sourceReadPosition = 0;
    lastSpeedAdjustment = 0;
    if (!keepStreamId) activeStreamId = null;
}

function getBufferStats() {
    const packetDurationMs = streamPacketDurationMs || 20;
    return {
        bufferedSamples: pcmRingBuffer.length,
        bufferedMs: pcmRingBuffer.length * 1000 / activeInputSampleRate,
        targetSourceSamples: getTargetSourceSamples(),
        targetPrebufferMs: getTargetSourceSamples() * 1000 / activeInputSampleRate,
        targetPacketCount: getTargetPacketCount(packetDurationMs),
        packetSize: streamPacketSize,
        packetDurationMs: streamPacketDurationMs,
        sampleRate: activeInputSampleRate,
        jitterEstimateMs,
        speedAdjustment: lastSpeedAdjustment,
        isPlaybackPrimed,
    };
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
