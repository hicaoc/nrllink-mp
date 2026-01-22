import * as audio from '../../utils/audioPlayer';
import * as nrl21 from '../../utils/nrl21';
import * as audioUtils from '../../utils/audioUtils';
import * as g711 from '../../utils/audioG711';
import * as nrlHelpers from '../../utils/nrlHelpers';

const app = getApp();

export class VoiceService {
    constructor(page) {
        this.page = page;
        this.voiceEndTimer = null;
        this.incomingVoiceBuffer = [];
        this.g711Codec = new g711.G711Codec();
    }

    /**
     * Main entry point for processing UDP messages.
     */
    handleMessage(data) {
        const packet = nrl21.decodePacket(data);

        switch (packet.type) {
            case 1: // Voice
                audio.play(packet.data, packet.type);
                this.processIncomingVoice(packet);
                break;

            case 2: // Heartbeat
                this.page.setData({
                    lastMessageTime: Date.now(),
                    serverConnected: true
                });
                break;

            case 5: // Text
                this.handleIncomingTextMessage(packet);
                break;
        }
    }

    /**
     * Process chunks of incoming voice data.
     */
    processIncomingVoice(packet) {
        const now = Date.now();
        const { chatLogs, isReceivingVoice, CallSign, SSID, lastVoiceTime, startTime } = this.page.data;

        // Detect end of previous transmission
        if (isReceivingVoice && (
            CallSign !== packet.callSign ||
            SSID !== packet.ssid ||
            now - lastVoiceTime > 2000
        )) {
            this.finishIncomingVoice();
        }

        if (!this.page.data.isReceivingVoice) {
            this.page.setData({
                isReceivingVoice: true,
                receivingBubbleWidth: 10,
                startTime: now,
                CallSign: packet.callSign || '未知',
                SSID: packet.ssid || '00',
                DMRID: packet.dmrid || '',
                lastVoiceTime: now,
                duration: 0
            });
            this.incomingVoiceBuffer = [];
            this.startReceivingAnimation();
        }

        // Convert alaw to PCM and buffer
        const linearData = new Int16Array(packet.data.length);
        for (let i = 0; i < packet.data.length; i++) {
            linearData[i] = this.g711Codec.alaw2linear(packet.data[i]);
        }
        this.incomingVoiceBuffer.push(linearData);

        this.page.setData({
            lastVoiceTime: now,
            duration: Math.floor((now - this.page.data.startTime) / 1000)
        });

        // Reset silence timer
        if (this.voiceEndTimer) clearTimeout(this.voiceEndTimer);
        this.voiceEndTimer = setTimeout(() => {
            this.finishIncomingVoice();
        }, 2500);
    }

    /**
     * Controls the growing bubble animation.
     */
    startReceivingAnimation() {
        if (!this.page.data.isReceivingVoice) return;

        let width = this.page.data.receivingBubbleWidth;
        if (width < 40) width += 2;
        else if (width < 66) width += 0.5;

        this.page.setData({ receivingBubbleWidth: width });

        if (this.page.data.isReceivingVoice) {
            setTimeout(() => this.startReceivingAnimation(), 200);
        }
    }

    /**
     * Finalizes voice reception, saves the WAV file, and adds to log.
     */
    async finishIncomingVoice() {
        if (!this.page.data.isReceivingVoice) return;

        const { CallSign, SSID, DMRID, duration } = this.page.data;
        this.page.setData({ isReceivingVoice: false });
        if (this.voiceEndTimer) clearTimeout(this.voiceEndTimer);

        if (this.incomingVoiceBuffer.length === 0) return;

        const bufferLength = this.incomingVoiceBuffer.reduce((acc, curr) => acc + curr.length, 0);
        const fullBuffer = new Int16Array(bufferLength);
        let offset = 0;
        for (const chunk of this.incomingVoiceBuffer) {
            fullBuffer.set(chunk, offset);
            offset += chunk.length;
        }

        const wavData = audioUtils.addWavHeader(new Uint8Array(fullBuffer.buffer), 8000);
        try {
            const filePath = await audioUtils.saveToFile(wavData, 'wav');
            const qthmap = await app.globalData.getQTH();
            const qth = qthmap[CallSign + '-' + SSID];

            const newLog = {
                id: Date.now(),
                type: 'voice',
                isSelf: false,
                sender: `${CallSign}-${SSID}`,
                callsign: CallSign,
                ssid: SSID,
                dmrid: DMRID,
                qth: qth ? qth.qth + " " + qth.name : '无位置数据',
                duration: duration,
                filePath: filePath,
                timestamp: nrlHelpers.formatLastVoiceTime(Date.now())
            };

            this.addChatLog(newLog);
            audioUtils.cleanupOldFiles();
        } catch (e) {
            console.error('Failed to save incoming voice:', e);
        }
    }

    /**
     * Handle incoming text packets.
     */
    async handleIncomingTextMessage(packet) {
        const content = nrlHelpers.decodeUint8ArrayToText(packet.data || new Uint8Array());
        const qthmap = await app.globalData.getQTH();
        const qth = qthmap[packet.callSign + '-' + packet.ssid];

        const newLog = {
            id: Date.now(),
            type: 'text',
            isSelf: false,
            sender: `${packet.callSign}-${packet.ssid}`,
            callsign: packet.callSign,
            ssid: packet.ssid,
            qth: qth ? qth.qth + " " + qth.name : '无位置数据',
            content: content,
            timestamp: nrlHelpers.formatLastVoiceTime(Date.now())
        };
        this.addChatLog(newLog);
    }

    /**
     * Utility to add a log entry and scroll UI.
     */
    addChatLog(log) {
        const logs = [...this.page.data.chatLogs, log].slice(-100);
        app.globalData.chatLogs = logs;
        this.page.setData({
            chatLogs: logs,
            scrollIntoView: `msg-${log.id}`
        });
    }
}
