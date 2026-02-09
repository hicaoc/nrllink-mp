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
        this.accumulatedDuration = 0; // Accurate duration in milliseconds
        this.durationUpdateTimer = null; // Timer for throttled duration updates

        // Track current receiving state to avoid relying on async page.data
        this.currentReceiving = {
            isReceiving: false,
            callSign: null,
            ssid: null,
            dmrid: null,
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
            case 1: // Voice
                // Decode once and reuse for both playback and recording
                const linearData = new Int16Array(packet.data.length);
                for (let i = 0; i < packet.data.length; i++) {
                    linearData[i] = this.g711Codec.alaw2linear(packet.data[i]);
                }
                audio.playPCM(linearData);
                this.processIncomingVoice(packet, linearData);
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
     * @param {Object} packet - The decoded packet
     * @param {Int16Array} linearData - Pre-decoded PCM data to avoid duplicate decoding
     */
    processIncomingVoice(packet, linearData) {
        const now = Date.now();

        // Normalize packet values with same defaults used when storing
        const packetCallSign = packet.callSign || '未知';
        const packetSSID = packet.ssid || '00';

        // Detect end of previous transmission using local state (not page.data)
        if (this.currentReceiving.isReceiving) {
            // Check if this is a different sender or too long interval
            const isDifferentSender =
                this.currentReceiving.callSign !== packetCallSign ||
                this.currentReceiving.ssid !== packetSSID;

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

        // Calculate accurate duration based on packet size
        // 160 bytes = 20ms, 500 bytes = 62.5ms
        const packetSize = packet.data.length;
        let packetDurationMs = 0;
        if (packetSize === 160) {
            packetDurationMs = 20;
        } else if (packetSize === 500) {
            packetDurationMs = 62.5;
        } else {
            // Fallback: estimate based on 8kHz sample rate (1 byte = 0.125ms)
            packetDurationMs = packetSize * 0.125;
        }
        this.accumulatedDuration += packetDurationMs;

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

        // Reset receiving state
        this.currentReceiving = {
            isReceiving: false,
            callSign: null,
            ssid: null,
            dmrid: null,
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

        const wavData = audioUtils.addWavHeader(new Uint8Array(fullBuffer.buffer), 8000);
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
