import * as recoder from '../../utils/audioRecoder';
import * as audioUtils from '../../utils/audioUtils';
import * as nrlHelpers from '../../utils/nrlHelpers';

const app = getApp();

export class RecorderService {
    constructor(page) {
        this.page = page;
        this.recorder = null;
        this.audioProcessor = null;
        this.outgoingVoiceBuffer = [];
    }

    /**
     * Check for microphone permission.
     */
    async checkAudioPermission() {
        try {
            const authSetting = await wx.getAppAuthorizeSetting();
            if (authSetting['microphoneAuthorized'] === true) return true;
            if (authSetting['microphoneAuthorized'] !== "authorized") {
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

    /**
     * Start audio recording and packet transmission.
     */
    async startRecording() {
        if (this.page.data.isTalking) return;
        this.outgoingVoiceBuffer = [];

        try {
            await this.checkAudioPermission();
        } catch (err) {
            return;
        }

        this.page.setData({ isTalking: true });
        try {
            this.recorder = await recoder.startRecording(this.page.data.codec);
        } catch (err) {
            wx.showToast({ title: '录音启动失败', icon: 'none' });
            this.page.setData({ isTalking: false });
            return;
        }

        const processAudio = async () => {
            let buffer = new Uint8Array(0);
            while (this.page.data.isTalking) {
                try {
                    const data = await this.recorder.getNextAudioFrame();
                    if (!data) continue;

                    this.outgoingVoiceBuffer.push(new Int16Array(data));

                    const newBuffer = new Uint8Array(buffer.length + data.length);
                    newBuffer.set(buffer);
                    newBuffer.set(new Uint8Array(data), buffer.length);
                    buffer = newBuffer;

                    while (buffer.length >= 160) {
                        const packetData = buffer.slice(0, 160);
                        buffer = buffer.slice(160);
                        this.page.audioPacket.set(packetData, 48);
                        if (app.globalData.udpClient) {
                            await new Promise(resolve => {
                                app.globalData.udpClient.send(this.page.audioPacket);
                                setTimeout(resolve, 55);
                            });
                        }
                    }
                } catch (err) {
                    console.error('Recording process error:', err);
                    break;
                }
            }
        };
        this.audioProcessor = processAudio();
    }

    /**
     * Stop audio recording and save the file.
     */
    async stopRecording() {
        this.page.setData({ isTalking: false });
        try {
            if (this.audioProcessor) await this.audioProcessor;
            if (this.recorder) recoder.stopRecording(this.recorder);

            if (!this.outgoingVoiceBuffer || this.outgoingVoiceBuffer.length === 0) return;

            const bufferLength = this.outgoingVoiceBuffer.reduce((acc, curr) => acc + curr.length, 0);
            const fullBuffer = new Int16Array(bufferLength);
            let offset = 0;
            for (const chunk of this.outgoingVoiceBuffer) {
                fullBuffer.set(chunk, offset);
                offset += chunk.length;
            }

            const wavData = audioUtils.addWavHeader(new Uint8Array(fullBuffer.buffer), 8000);
            const filePath = await audioUtils.saveToFile(wavData, 'wav');
            const duration = Math.ceil((Date.now() - app.globalData.recoderStartTime) / 1000);

            const newLog = {
                id: Date.now(),
                type: 'voice',
                isSelf: true,
                sender: '我',
                duration: duration,
                filePath: filePath,
                timestamp: nrlHelpers.formatLastVoiceTime(Date.now())
            };

            this.page.voiceService.addChatLog(newLog);

            // Send MDC
            const mdcPacket = app.globalData.mdcPacket;
            if (mdcPacket) {
                const packetSize = 160;
                const totalPackets = Math.ceil(mdcPacket.length / packetSize);
                for (let i = 0; i < totalPackets; i++) {
                    const start = i * packetSize;
                    const end = Math.min(start + packetSize, mdcPacket.length);
                    this.page.audioPacket.set(mdcPacket.slice(start, end), 48);
                    if (app.globalData.udpClient) {
                        await new Promise(resolve => {
                            app.globalData.udpClient.send(this.page.audioPacket);
                            setTimeout(resolve, 62);
                        });
                    }
                }
            }
        } catch (err) {
            console.error('Stop recording failed:', err);
        } finally {
            this.recorder = null;
            this.audioProcessor = null;
        }
    }
}
