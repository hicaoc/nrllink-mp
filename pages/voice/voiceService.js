import * as audio from '../../utils/audioPlayer';
import * as nrl21 from '../../utils/nrl21';
import * as audioUtils from '../../utils/audioUtils';
import * as g711 from '../../utils/audioG711';
import * as opus from '../../utils/audioOpus';
import * as nrlHelpers from '../../utils/nrlHelpers';
const devModels = require('./devmodels');

const app = getApp();
const devModelMap = new Map(devModels.map(model => [Number(model.id), model.name]));
// Count is already parsed, but legacy devices may keep sending zero. Keep packet
// reordering disabled until sequence support can be negotiated or auto-detected.
const ENABLE_VOICE_PACKET_REORDER = false;
const VOICE_REORDER_WINDOW = 3;
const VOICE_REORDER_RESET_MS = 500;

export class VoiceService {
    constructor(page) {
        this.page = page;
        this.voiceEndTimer = null;
        this.incomingVoiceBuffer = [];
        this.g711Codec = new g711.G711Codec();
        this.accumulatedDuration = 0; // Accurate duration in milliseconds
        this.durationUpdateTimer = null; // Timer for throttled duration updates
        this.voiceReorderBuffer = new Map();
        this.expectedVoiceCount = null;
        this.reorderStreamId = null;
        this.lastReorderPacketAt = 0;
        this.opusDecodeChain = Promise.resolve();
        this.opusDecoderSender = null;
        this.opusDecoderSession = 0;
        this.lastOpusPacketAt = 0;
        this.opusDecodeErrorShown = false;

        // Track current receiving state to avoid relying on async page.data
        this.currentReceiving = {
            isReceiving: false,
            callSign: null,
            ssid: null,
            dmrid: null,
            devModel: null,
            devModelName: '',
            codec: 'g711',
            codecLabel: 'G.711',
            sampleRate: 8000,
            startTime: null,
            lastReceiveTime: null
        };
    }

    /**
     * Main entry point for processing UDP messages.
     */
    handleMessage(data) {
        const packet = nrl21.decodePacket(data);

        switch (packet.type) {
            case 1: // G.711 voice
            case 8: // Opus voice, 16 kHz mono
                if (ENABLE_VOICE_PACKET_REORDER) {
                    this.enqueueOrderedVoicePacket(packet);
                } else {
                    this.dispatchVoicePacket(packet);
                }
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

    dispatchVoicePacket(packet) {
        if (packet.type === 8) {
            this.opusDecodeChain = this.opusDecodeChain
                .then(() => this.playOpusVoicePacket(packet))
                .catch((err) => {
                    console.error('Opus packet decode failed:', err);
                    if (!this.opusDecodeErrorShown) {
                        this.opusDecodeErrorShown = true;
                        wx.showToast({ title: '收到 Opus 音频，但当前环境无法解码', icon: 'none' });
                    }
                });
            return;
        }
        this.playVoicePacket(packet);
    }

    playVoicePacket(packet) {
        // Decode once and reuse for both playback and recording.
        const linearData = new Int16Array(packet.data.length);
        for (let i = 0; i < packet.data.length; i++) {
            linearData[i] = this.g711Codec.alaw2linear(packet.data[i]);
        }
        audio.playPCM(linearData, {
            streamId: `${packet.callSign || ''}-${packet.ssid == null ? '' : packet.ssid}-g711`,
            sampleRate: 8000
        });
        this.processIncomingVoice(packet, linearData, {
            codec: 'g711',
            codecLabel: 'G.711',
            sampleRate: 8000
        });
    }

    async playOpusVoicePacket(packet) {
        const now = Date.now();
        const sender = `${packet.callSign || ''}-${packet.ssid == null ? '' : packet.ssid}`;
        if (sender !== this.opusDecoderSender || now - this.lastOpusPacketAt > 1000) {
            this.opusDecoderSender = sender;
            this.opusDecoderSession++;
        }
        this.lastOpusPacketAt = now;

        const decoderStreamId = `${sender}-${this.opusDecoderSession}`;
        const linearData = await opus.decodeFrame(packet.data, decoderStreamId);
        audio.playPCM(linearData, {
            streamId: `${sender}-opus`,
            sampleRate: opus.OPUS_SAMPLE_RATE
        });
        this.processIncomingVoice(packet, linearData, {
            codec: 'opus',
            codecLabel: 'Opus',
            sampleRate: opus.OPUS_SAMPLE_RATE
        });
    }

    enqueueOrderedVoicePacket(packet) {
        const now = Date.now();
        const streamId = `${packet.callSign || ''}-${packet.ssid == null ? '' : packet.ssid}-${packet.type}`;
        const count = Number(packet.count) & 0xffff;

        if (
            this.reorderStreamId !== streamId ||
            (this.lastReorderPacketAt > 0 && now - this.lastReorderPacketAt > VOICE_REORDER_RESET_MS)
        ) {
            this.voiceReorderBuffer.clear();
            this.expectedVoiceCount = count;
            this.reorderStreamId = streamId;
        }
        this.lastReorderPacketAt = now;

        if (!this.voiceReorderBuffer.has(count)) {
            this.voiceReorderBuffer.set(count, packet);
        }
        this.flushOrderedVoicePackets();

        if (this.voiceReorderBuffer.size >= VOICE_REORDER_WINDOW) {
            let nearestCount = null;
            let nearestDistance = 0x10000;
            for (const queuedCount of this.voiceReorderBuffer.keys()) {
                const distance = (queuedCount - this.expectedVoiceCount + 0x10000) & 0xffff;
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestCount = queuedCount;
                }
            }
            if (nearestCount !== null) {
                this.expectedVoiceCount = nearestCount;
                this.flushOrderedVoicePackets();
            }
        }
    }

    flushOrderedVoicePackets() {
        while (
            this.expectedVoiceCount !== null &&
            this.voiceReorderBuffer.has(this.expectedVoiceCount)
        ) {
            const packet = this.voiceReorderBuffer.get(this.expectedVoiceCount);
            this.voiceReorderBuffer.delete(this.expectedVoiceCount);
            this.dispatchVoicePacket(packet);
            this.expectedVoiceCount = (this.expectedVoiceCount + 1) & 0xffff;
        }
    }

    /**
     * Process chunks of incoming voice data.
     * @param {Object} packet - The decoded packet
     * @param {Int16Array} linearData - Pre-decoded PCM data to avoid duplicate decoding
     */
    processIncomingVoice(packet, linearData, audioFormat = {}) {
        const now = Date.now();
        const codec = audioFormat.codec === 'opus' ? 'opus' : 'g711';
        const codecLabel = codec === 'opus' ? 'Opus' : 'G.711';
        const sampleRate = Number(audioFormat.sampleRate) || 8000;

        // Normalize packet values with same defaults used when storing
        const packetCallSign = packet.callSign || '未知';
        const packetSSID = packet.ssid || '00';
        const packetDevModel = Number(packet.devModel || 0);
        const packetDevModelName = this.getDevModelName(packetDevModel);

        // Detect end of previous transmission using local state (not page.data)
        if (this.currentReceiving.isReceiving) {
            // Check if this is a different sender or too long interval
            const isDifferentSender =
                this.currentReceiving.callSign !== packetCallSign ||
                this.currentReceiving.ssid !== packetSSID ||
                this.currentReceiving.codec !== codec;

            const timeSinceLastPacket = now - this.currentReceiving.lastReceiveTime;
            const isTooLongInterval = timeSinceLastPacket > 1000; // 1 second gap = new transmission (normal interval is 20-62.5ms)

            if (isDifferentSender) {
                console.warn(`[Voice] ⚠️ Different sender! Current: ${this.currentReceiving.callSign}-${this.currentReceiving.ssid}, New: ${packetCallSign}-${packetSSID}`);
                this.finishIncomingVoice();
            } else if (isTooLongInterval) {
                console.warn(`[Voice] ⚠️ Long interval (${timeSinceLastPacket}ms), treating as new transmission`);
                this.finishIncomingVoice();
            }
        }

        // Start new reception if not already receiving
        if (!this.currentReceiving.isReceiving) {
            console.log(`[Voice] 🎤 START receiving from ${packetCallSign}-${packetSSID}`);
            this.currentReceiving = {
                isReceiving: true,
                callSign: packetCallSign,
                ssid: packetSSID,
                dmrid: packet.dmrid || '',
                devModel: packetDevModel,
                devModelName: packetDevModelName,
                codec,
                codecLabel,
                sampleRate,
                startTime: now,
                lastReceiveTime: now
            };

            this.page.setData({
                isReceivingVoice: true,
                receivingBubbleWidth: 10,
                startTime: now,
                CallSign: this.currentReceiving.callSign,
                SSID: this.currentReceiving.ssid,
                DMRID: this.currentReceiving.dmrid,
                DevModelName: this.currentReceiving.devModelName,
                ReceivingCodec: this.currentReceiving.codec,
                ReceivingCodecLabel: this.currentReceiving.codecLabel,
                ReceivingTime: nrlHelpers.formatLastVoiceTime(now),
                lastVoiceTime: now,
                duration: 0
            });
            this.incomingVoiceBuffer = [];
            this.accumulatedDuration = 0; // Reset accumulated duration
            this.startReceivingAnimation();
            this.startDurationUpdateTimer(); // Start throttled duration updates
        }

        // Update last receive time
        this.currentReceiving.lastReceiveTime = now;

        // Use pre-decoded linearData (already decoded in handleMessage to avoid duplication)
        this.incomingVoiceBuffer.push(linearData);

        // Duration must use decoded PCM samples. Opus payload bytes are VBR and
        // therefore cannot be used to infer frame duration.
        this.accumulatedDuration += linearData.length * 1000 / sampleRate;

        // Only update lastVoiceTime, duration is updated by timer
        this.page.setData({ lastVoiceTime: now });

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
     * Start throttled duration updates (every 1 second instead of every packet).
     */
    startDurationUpdateTimer() {
        if (this.durationUpdateTimer) return;
        this.durationUpdateTimer = setInterval(() => {
            if (this.page.data.isReceivingVoice) {
                this.page.setData({
                    duration: Math.ceil(this.accumulatedDuration / 1000) // Round up to whole seconds
                });
            }
        }, 1000); // Update every 1 second to save resources (since we only show whole seconds)
    }

    /**
     * Stop duration update timer.
     */
    stopDurationUpdateTimer() {
        if (this.durationUpdateTimer) {
            clearInterval(this.durationUpdateTimer);
            this.durationUpdateTimer = null;
        }
    }

    /**
     * Finalizes voice reception, saves the WAV file, and adds to log.
     */
    async finishIncomingVoice() {
        if (!this.currentReceiving.isReceiving) return;

        const bufLen = this.incomingVoiceBuffer.length;
        const dur = Math.ceil(this.accumulatedDuration / 1000);
        console.log(`[Voice] 💾 FINISH ${this.currentReceiving.callSign}-${this.currentReceiving.ssid}: ${bufLen} packets, ${dur}s`);

        // Stop duration update timer and do final update
        this.stopDurationUpdateTimer();
        const finalDuration = Math.ceil(this.accumulatedDuration / 1000); // Round up to whole seconds

        const CallSign = this.currentReceiving.callSign;
        const SSID = this.currentReceiving.ssid;
        const DMRID = this.currentReceiving.dmrid;
        const DevModel = this.currentReceiving.devModel;
        const DevModelName = this.currentReceiving.devModelName;
        const codec = this.currentReceiving.codec;
        const codecLabel = this.currentReceiving.codecLabel;
        const sampleRate = this.currentReceiving.sampleRate;

        // Reset receiving state
        this.currentReceiving = {
            isReceiving: false,
            callSign: null,
            ssid: null,
            dmrid: null,
            devModel: null,
            devModelName: '',
            codec: 'g711',
            codecLabel: 'G.711',
            sampleRate: 8000,
            startTime: null,
            lastReceiveTime: null
        };

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

        const wavData = audioUtils.addWavHeader(new Uint8Array(fullBuffer.buffer), sampleRate);
        try {
            const filePath = await audioUtils.saveToFile(wavData, 'wav');
            const qthmap = await app.globalData.getQTH(true);
            const qth = qthmap[CallSign + '-' + SSID];

            const newLog = {
                id: Date.now(),
                type: 'voice',
                isSelf: false,
                sender: `${CallSign}-${SSID}`,
                callsign: CallSign,
                ssid: SSID,
                dmrid: DMRID,
                devModel: DevModel,
                devModelName: DevModelName,
                codec,
                codecLabel,
                qth: qth ? qth.qth + " " + qth.name : '无位置数据',
                duration: finalDuration,
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
        const rawContent = nrlHelpers.decodeUint8ArrayToText(packet.data || new Uint8Array());
        const { subType, body } = this.parseContent(rawContent);

        if (subType === 'loc') {
            return;
        }

        const qthmap = await app.globalData.getQTH(true);
        const qth = qthmap[packet.callSign + '-' + packet.ssid];

        const newLog = {
            id: Date.now(),
            type: 'text',
            subType: subType,
            isSelf: false,
            sender: `${packet.callSign}-${packet.ssid}`,
            callsign: packet.callSign,
            ssid: packet.ssid,
            qth: qth ? qth.qth + " " + qth.name : '无位置数据',
            content: body,
            timestamp: nrlHelpers.formatLastVoiceTime(Date.now())
        };
        this.addChatLog(newLog);
    }

    parseContent(content) {
        const regex = /^\[(text|loc|json|xml|html|bin|img|video|audio)\](.*)$/s;
        const match = content.match(regex);
        if (match) {
            return {
                subType: match[1],
                body: match[2]
            };
        }
        return {
            subType: 'text',
            body: content
        };
    }

    getDevModelName(devModelId) {
        return devModelMap.get(Number(devModelId)) || `未知(${devModelId})`;
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
