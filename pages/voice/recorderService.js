import * as recoder from '../../utils/audioRecoder';
import * as audioUtils from '../../utils/audioUtils';
import * as nrlHelpers from '../../utils/nrlHelpers';
import * as nrl21 from '../../utils/nrl21';
import * as opus from '../../utils/audioOpus';

const app = getApp();
const G711_SAMPLE_RATE = 8000;
const G711_PACKET_SIZE = 160;

function appendUint8(left, right) {
    const result = new Uint8Array(left.length + right.length);
    result.set(left, 0);
    result.set(right, left.length);
    return result;
}

function appendInt16(left, right) {
    const result = new Int16Array(left.length + right.length);
    result.set(left, 0);
    result.set(right, left.length);
    return result;
}

export class RecorderService {
    constructor(page) {
        this.page = page;
        this.recorder = null;
        this.audioProcessor = null;
        this.sendTimer = null;
        this.sendQueue = [];
        this.outgoingVoiceBuffer = [];
        this.voicePacketCount = 0;
        this.activeCodec = 'g711';
        this.activeSampleRate = G711_SAMPLE_RATE;
    }

    async checkAudioPermission() {
        try {
            const authSetting = await wx.getAppAuthorizeSetting();
            const microphoneAuthorized = authSetting.microphoneAuthorized;
            if (microphoneAuthorized === true || microphoneAuthorized === 'authorized') return true;
            if (microphoneAuthorized === false || microphoneAuthorized === 'denied') {
                wx.showToast({ title: '录音权限被拒绝，请手动开启', icon: 'none' });
                throw new Error('Mic denied');
            }
            await wx.authorize({ scope: 'scope.record' });
            return true;
        } catch (err) {
            wx.showToast({ title: '获取麦克风权限失败', icon: 'none' });
            throw err;
        }
    }

    async ensureSelectedCodec(codec) {
        if (codec !== 'opus') return true;

        wx.showLoading({ title: '初始化 Opus...' });
        try {
            await opus.checkOpusSupport();
            return true;
        } catch (err) {
            console.error('Opus initialization failed:', err);
            this.page.setData({ codec: 'g711' });
            wx.setStorageSync('voiceSendCodec', 'g711');
            wx.showToast({ title: '当前环境不支持 Opus，已切回 G.711', icon: 'none' });
            return false;
        } finally {
            wx.hideLoading();
        }
    }

    sendVoicePayload(type, payload) {
        const header = type === 8
            ? this.page.opusAudioPacketHeader
            : this.page.g711AudioPacketHeader;
        if (!header || !payload || !app.globalData.udpClient) return false;

        const packet = new Uint8Array(header.length + payload.length);
        packet.set(header, 0);
        packet.set(payload, header.length);
        nrl21.setPacketCount(packet, this.voicePacketCount);
        this.voicePacketCount = (this.voicePacketCount + 1) & 0xffff;
        return app.globalData.udpClient.send(packet);
    }

    async startRecording() {
        if (this.page.data.isTalking) return;

        const codec = this.page.data.codec === 'opus' ? 'opus' : 'g711';
        this.outgoingVoiceBuffer = [];
        this.sendQueue = [];
        this.voicePacketCount = 0;

        try {
            await this.checkAudioPermission();
        } catch (err) {
            return;
        }
        if (!await this.ensureSelectedCodec(codec)) return;

        this.activeCodec = codec;
        this.activeSampleRate = codec === 'opus' ? opus.OPUS_SAMPLE_RATE : G711_SAMPLE_RATE;
        this.page.setData({ isTalking: true });

        try {
            this.recorder = await recoder.startRecording(codec, () => {
                if (this.page.data.isTalking) this.stopRecording();
            });
        } catch (err) {
            console.error('Recorder start failed:', err);
            wx.showToast({ title: '录音启动失败', icon: 'none' });
            this.page.setData({ isTalking: false });
            return;
        }

        let g711Buffer = new Uint8Array(0);
        let opusPcmBuffer = new Int16Array(0);

        // Both codecs send one 20 ms audio frame per tick. Opus payload length is
        // variable, so encoded frames are queued instead of concatenated by byte.
        this.sendTimer = setInterval(() => {
            const payload = this.sendQueue.shift();
            if (payload) this.sendVoicePayload(codec === 'opus' ? 8 : 1, payload);
        }, 20);

        const processAudio = async () => {
            while (this.page.data.isTalking) {
                try {
                    const frame = await this.recorder.getNextAudioFrame();
                    if (!frame) break;

                    const { encoded, raw } = frame;
                    this.outgoingVoiceBuffer.push(raw.slice());

                    if (codec === 'g711') {
                        g711Buffer = appendUint8(g711Buffer, encoded);
                        while (g711Buffer.length >= G711_PACKET_SIZE) {
                            this.sendQueue.push(g711Buffer.slice(0, G711_PACKET_SIZE));
                            g711Buffer = g711Buffer.slice(G711_PACKET_SIZE);
                        }
                        continue;
                    }

                    opusPcmBuffer = appendInt16(opusPcmBuffer, raw);
                    while (opusPcmBuffer.length >= opus.OPUS_FRAME_SIZE) {
                        const pcmFrame = opusPcmBuffer.slice(0, opus.OPUS_FRAME_SIZE);
                        opusPcmBuffer = opusPcmBuffer.slice(opus.OPUS_FRAME_SIZE);
                        this.sendQueue.push(await opus.encodeFrame(pcmFrame));
                    }
                } catch (err) {
                    console.error('Recording process error:', err);
                    this.page.setData({ isTalking: false });
                    break;
                }
            }
        };
        this.audioProcessor = processAudio();
    }

    async flushQueuedFrames(codec) {
        while (this.sendQueue.length > 0) {
            const payload = this.sendQueue.shift();
            this.sendVoicePayload(codec === 'opus' ? 8 : 1, payload);
            await new Promise(resolve => setTimeout(resolve, 20));
        }
    }

    async stopRecording() {
        if (this.stopPromise) return this.stopPromise;

        this.stopPromise = this.finishRecording();
        try {
            await this.stopPromise;
        } finally {
            this.stopPromise = null;
        }
    }

    async finishRecording() {
        const codec = this.activeCodec;
        const sampleRate = this.activeSampleRate;
        this.page.setData({ isTalking: false });

        try {
            if (this.recorder) recoder.stopRecording(this.recorder);
            if (this.audioProcessor) await this.audioProcessor;
            if (this.sendTimer) {
                clearInterval(this.sendTimer);
                this.sendTimer = null;
            }
            await this.flushQueuedFrames(codec);

            if (!this.outgoingVoiceBuffer.length) return;

            const bufferLength = this.outgoingVoiceBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
            const fullBuffer = new Int16Array(bufferLength);
            let offset = 0;
            for (const chunk of this.outgoingVoiceBuffer) {
                fullBuffer.set(chunk, offset);
                offset += chunk.length;
            }

            const wavData = audioUtils.addWavHeader(new Uint8Array(fullBuffer.buffer), sampleRate);
            const filePath = await audioUtils.saveToFile(wavData, 'wav');
            const duration = Math.max(1, Math.ceil(fullBuffer.length / sampleRate));
            const codecLabel = codec === 'opus' ? 'Opus' : 'G.711';

            this.page.voiceService.addChatLog({
                id: Date.now(),
                type: 'voice',
                isSelf: true,
                sender: '我',
                codec,
                codecLabel,
                duration,
                filePath,
                timestamp: nrlHelpers.formatLastVoiceTime(Date.now())
            });

            // Send MDC tail tone using the same codec as the voice transmission.
            // Opus MDC frames are pre-encoded in initMdcAndUdp, mirroring the G711 approach.
            if (codec === 'opus' && app.globalData.mdcOpusFrames && app.globalData.mdcOpusFrames.length > 0) {
                for (const frame of app.globalData.mdcOpusFrames) {
                    this.sendVoicePayload(8, frame);
                    await new Promise(resolve => setTimeout(resolve, 20));
                }
            } else {
                const mdcPacket = app.globalData.mdcPacket;
                if (mdcPacket) {
                    const totalPackets = Math.ceil(mdcPacket.length / G711_PACKET_SIZE);
                    for (let i = 0; i < totalPackets; i++) {
                        const payload = new Uint8Array(G711_PACKET_SIZE);
                        payload.set(mdcPacket.slice(
                            i * G711_PACKET_SIZE,
                            Math.min((i + 1) * G711_PACKET_SIZE, mdcPacket.length)
                        ));
                        this.sendVoicePayload(1, payload);
                        await new Promise(resolve => setTimeout(resolve, 20));
                    }
                }
            }
        } catch (err) {
            console.error('Stop recording failed:', err);
        } finally {
            if (this.sendTimer) clearInterval(this.sendTimer);
            this.sendTimer = null;
            this.sendQueue = [];
            this.recorder = null;
            this.audioProcessor = null;
        }
    }
}
