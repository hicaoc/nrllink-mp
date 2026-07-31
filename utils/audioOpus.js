const {
    Application,
    Bandwidth,
    Signal,
    createDecoder,
    createEncoder,
} = require('./vendor/libopusWasm');

export const OPUS_SAMPLE_RATE = 16000;
export const OPUS_CHANNELS = 1;
export const OPUS_FRAME_SIZE = 320;
export const OPUS_FRAME_DURATION_MS = 20;
export const OPUS_BITRATE = 40000;
const WECHAT_OPUS_WASM_PATH = 'utils/vendor/libopus.wasm.br';

let encoderPromise = null;
let decoderPromise = null;
let decoderStreamId = null;

function ensureWebAssemblyRuntime() {
    if (typeof WXWebAssembly !== 'undefined' && typeof globalThis !== 'undefined') {
        if (!globalThis.WebAssembly || !globalThis.WebAssembly.__nrlWxAdapter) {
            const wxWasm = WXWebAssembly;
            class WxWasmRuntimeError extends Error {
                constructor(message) {
                    super(message);
                    this.name = 'RuntimeError';
                }
            }

            globalThis.WebAssembly = {
                __nrlWxAdapter: true,
                RuntimeError: WxWasmRuntimeError,
                Memory: wxWasm.Memory,
                Table: wxWasm.Table,
                Global: wxWasm.Global,
                instantiate: async (_embeddedBytes, imports) => {
                    const result = await wxWasm.instantiate(WECHAT_OPUS_WASM_PATH, imports);
                    const instance = result && result.instance ? result.instance : result;
                    return {
                        instance,
                        module: result && result.module ? result.module : null
                    };
                }
            };
        }
        return;
    }

    if (typeof WebAssembly === 'undefined') {
        throw new Error('当前微信基础库不支持 WebAssembly，无法使用 Opus');
    }
}

export async function getEncoder() {
    ensureWebAssemblyRuntime();
    if (!encoderPromise) {
        encoderPromise = createEncoder({
            sampleRate: OPUS_SAMPLE_RATE,
            channels: OPUS_CHANNELS,
            frameSize: OPUS_FRAME_SIZE,
            bitrate: OPUS_BITRATE,
            application: Application.Voip,
            complexity: 10,
            signal: Signal.Voice,
            maxBandwidth: Bandwidth.Wideband,
            vbr: true,
            dtx: false,
            fec: false,
        }).catch((err) => {
            encoderPromise = null;
            throw err;
        });
    }
    return encoderPromise;
}

export async function encodeFrame(pcm) {
    if (!(pcm instanceof Int16Array) || pcm.length !== OPUS_FRAME_SIZE) {
        throw new Error(`Opus 每帧需要 ${OPUS_FRAME_SIZE} 个 PCM16 采样`);
    }
    const encoder = await getEncoder();
    return encoder.encode(pcm);
}

async function resetDecoder(streamId) {
    if (decoderPromise) {
        try {
            const decoder = await decoderPromise;
            decoder.free();
        } catch (err) {
            console.warn('Opus decoder cleanup failed:', err);
        }
    }

    decoderStreamId = streamId;
    decoderPromise = createDecoder({
        sampleRate: OPUS_SAMPLE_RATE,
        channels: OPUS_CHANNELS,
        maxFrameSize: OPUS_SAMPLE_RATE * 120 / 1000,
    }).catch((err) => {
        decoderPromise = null;
        throw err;
    });
    return decoderPromise;
}

export async function decodeFrame(packet, streamId = '') {
    ensureWebAssemblyRuntime();
    const normalizedStreamId = String(streamId);
    const decoder = !decoderPromise || decoderStreamId !== normalizedStreamId
        ? await resetDecoder(normalizedStreamId)
        : await decoderPromise;
    return decoder.decode(packet, { maxFrameSize: OPUS_SAMPLE_RATE * 120 / 1000 });
}

export async function checkOpusSupport() {
    await getEncoder();
    return true;
}

let mdcEncoderPromise = null;

/**
 * Get a dedicated Opus encoder for MDC signaling.
 * Uses Application.Audio + Signal.Auto to faithfully preserve FSK tones
 * (1200/1800 Hz), unlike the voice encoder which suppresses non-speech.
 */
function getMdcEncoder() {
    ensureWebAssemblyRuntime();
    if (!mdcEncoderPromise) {
        mdcEncoderPromise = createEncoder({
            sampleRate: OPUS_SAMPLE_RATE,
            channels: OPUS_CHANNELS,
            frameSize: OPUS_FRAME_SIZE,
            bitrate: 64000,
            application: Application.Audio,
            complexity: 10,
            signal: Signal.Auto,
            maxBandwidth: Bandwidth.Wideband,
            vbr: true,
            dtx: false,
            fec: false,
        }).catch((err) => {
            mdcEncoderPromise = null;
            throw err;
        });
    }
    return mdcEncoderPromise;
}

/**
 * Pre-encode MDC1200 PCM samples (16000 Hz) into Opus frames.
 * The MDC encoder should be instantiated with sampleRate=16000 so that
 * samples are natively at Opus rate — no upsampling needed.
 * Uses a dedicated Audio-mode encoder to preserve FSK tone integrity.
 * Returns an array of encoded Uint8Array frames, each representing 20 ms.
 */
export async function encodeMdcToOpusFrames(mdcSamples) {
    if (!(mdcSamples instanceof Int16Array) || mdcSamples.length === 0) {
        return [];
    }

    // Split into OPUS_FRAME_SIZE frames and encode each
    const frames = [];
    const encoder = await getMdcEncoder();
    for (let offset = 0; offset + OPUS_FRAME_SIZE <= mdcSamples.length; offset += OPUS_FRAME_SIZE) {
        const pcmFrame = mdcSamples.slice(offset, offset + OPUS_FRAME_SIZE);
        frames.push(encoder.encode(pcmFrame));
    }

    // If there are remaining samples that don't fill a full frame, pad with silence
    const remaining = mdcSamples.length % OPUS_FRAME_SIZE;
    if (remaining > 0) {
        const lastFrame = new Int16Array(OPUS_FRAME_SIZE); // zero-padded
        lastFrame.set(mdcSamples.slice(mdcSamples.length - remaining), 0);
        frames.push(encoder.encode(lastFrame));
    }

    return frames;
}
