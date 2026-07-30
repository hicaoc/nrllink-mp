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
