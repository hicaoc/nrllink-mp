// mdc1200.js

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { WaveFile } = require('wavefile');

import * as fs from 'node:fs/promises';

class MDC1200Encoder {
    constructor() {
        this.sampleRate = 8000;
        this.incru = 644245094; // For 8000 Hz
        this.incru18 = 966367642; // For 8000 Hz
        this.loaded = 0;
        this.preamble_set = 0;
        this.sintable = this.generateSintable();
    }

    generateSintable() {
        const sintable = new Int16Array([
            0, 784, 1569, 2352, 3134, 3914, 4692, 5467,
            6239, 7007, 7770, 8529, 9283, 10031, 10774, 11509,
            12238, 12960, 13673, 14379, 15075, 15763, 16441, 17109,
            17767, 18414, 19051, 19675, 20288, 20889, 21477, 22052,
            22613, 23162, 23696, 24216, 24721, 25212, 25687, 26147,
            26591, 27019, 27431, 27826, 28204, 28566, 28910, 29237,
            29546, 29838, 30111, 30366, 30603, 30822, 31022, 31203,
            31366, 31510, 31634, 31740, 31827, 31894, 31942, 31971,
            31981, 31971, 31942, 31894, 31827, 31740, 31634, 31510,
            31366, 31203, 31022, 30822, 30603, 30366, 30111, 29838,
            29546, 29237, 28910, 28566, 28204, 27826, 27431, 27019,
            26591, 26147, 25687, 25212, 24721, 24216, 23696, 23162,
            22613, 22052, 21477, 20889, 20288, 19675, 19051, 18414,
            17767, 17109, 16441, 15763, 15075, 14379, 13673, 12960,
            12238, 11509, 10774, 10031, 9283, 8529, 7770, 7007,
            6239, 5467, 4692, 3914, 3134, 2352, 1569, 784,
            0, -784, -1569, -2352, -3134, -3914, -4692, -5467,
            -6239, -7007, -7770, -8529, -9283, -10031, -10774, -11509,
            -12238, -12960, -13673, -14379, -15075, -15763, -16441, -17109,
            -17767, -18414, -19051, -19675, -20288, -20889, -21477, -22052,
            -22613, -23162, -23696, -24216, -24721, -25212, -25687, -26147,
            -26591, -27019, -27431, -27826, -28204, -28566, -28910, -29237,
            -29546, -29838, -30111, -30366, -30603, -30822, -31022, -31203,
            -31366, -31510, -31634, -31740, -31827, -31894, -31942, -31971,
            -31981, -31971, -31942, -31894, -31827, -31740, -31634, -31510,
            -31366, -31203, -31022, -30822, -30603, -30366, -30111, -29838,
            -29546, -29237, -28910, -28566, -28204, -27826, -27431, -27019,
            -26591, -26147, -25687, -25212, -24721, -24216, -23696, -23162,
            -22613, -22052, -21477, -20889, -20288, -19675, -19051, -18414,
            -17767, -17109, -16441, -15763, -15075, -14379, -13673, -12960,
            -12238, -11509, -10774, -10031, -9283, -8529, -7770, -7007,
            -6239, -5467, -4692, -3914, -3134, -2352, -1569, -784
        ]);
        return sintable;
    }

    setPreamble(preambleLength) {
        if (preambleLength < 0) {
            throw new Error("Preamble length must be non-negative.");
        }
        this.preamble_set = preambleLength;
        return 0;
    }

    _encLeader(data) {
        data[0] = 0x55;
        data[1] = 0x55;
        data[2] = 0x55;
        data[3] = 0x55;
        data[4] = 0x55;
        data[5] = 0x55;
        data[6] = 0x55;

        data[7] = 0x07;
        data[8] = 0x09;
        data[9] = 0x2a;
        data[10] = 0x44;
        data[11] = 0x6f;

        return 12;
    }

    _docrc(data, len) {
        let crc = 0xFFFF;
        for (let i = 0; i < len; i++) {
            crc ^= data[i];
            for (let j = 0; j < 8; j++) {
                if (crc & 1) {
                    crc = (crc >>> 1) ^ 0x8408;
                } else {
                    crc >>>= 1;
                }
            }
        }
        return crc;
    }

    _encStr(data, offset) {
        console.log("--- _encStr Start ---");
        console.log("Input data:", data.slice(offset, offset + 14));

        let ccrc = this._docrc(data.slice(offset), 4);
        console.log("CRC:", ccrc.toString(16));

        data[offset + 4] = ccrc & 0x00ff;
        data[offset + 5] = (ccrc >> 8) & 0x00ff;
        data[offset + 6] = 0;

        let csr = new Uint8Array(7); // 确保 csr 数组被重新初始化

        // Calculate and insert Hamming code (ECC)
        for (let i = 0; i < 7; i++) {
            data[offset + 7 + i] = 0;
            for (let j = 0; j < 8; j++) {
                for (let k = 6; k > 0; k--) {
                    csr[k] = csr[k - 1];
                }
                csr[0] = (data[offset + i] >> j) & 0x01;
                let b = csr[0] + csr[2] + csr[5] + csr[6]; // 加法
                data[offset + 7 + i] |= (b & 0x01) << j;
            }
        }
        console.log("Data after Hamming:", data.slice(offset, offset + 14));

        // Interleaving (bit reordering)
        let lbits = new Uint8Array(112);
        let k = 0;
        let m = 0;

        for (let i = 0; i < 14; i++) {
            for (let j = 0; j < 8; j++) {
                let b = (data[offset + i] >> j) & 0x01;
                lbits[k] = b;
                k += 16;
                if (k > 111) {
                    k = ++m;
                }
            }
        }
        console.log("lbits (interleaved bits):", lbits);

        k = 0;
        for (let i = 0; i < 14; i++) {
            data[offset + i] = 0;
            for (let j = 7; j >= 0; j--) {
                if (lbits[k]) {
                    data[offset + i] |= 1 << j;
                }
                k++;
            }
        }

        console.log("Data after interleaving:", data.slice(offset, offset + 14));
        console.log("Data after _encStr (final):", data.slice(offset, offset + 14)); // 打印最终的 data 数组
        return offset + 14;
    }


    encodeSinglePacket(op, arg, unitID) {
        if (this.loaded) {
            throw new Error("Encoder already loaded with data.");
        }

        this.state = 0;
        this.data = new Uint8Array(40);
        let dp = this._encLeader(this.data);

        this.data[dp++] = op;
        this.data[dp++] = arg;
        this.data[dp++] = (unitID >> 8) & 0x00ff;
        this.data[dp++] = unitID & 0x00ff;

        console.log("Data before _encStr:", this.data.slice(0, 26)); // 调试打印
        this._encStr(this.data, 12);
        this.loaded = 26;

        return 0;
    }

    setDoublePacket(op, arg, unitID, extra0, extra1, extra2, extra3) {
        if (this.loaded) {
            throw new Error("Encoder already loaded with data.");
        }
        this.state = 0;
        this.data = new Uint8Array(60); // Increased size for double packet
        let dp = this._encLeader(this.data); // dp = 12
    
        // First part of the double packet
        this.data[dp++] = op;
        this.data[dp++] = arg;
        this.data[dp++] = (unitID >> 8) & 0x00ff;
        this.data[dp++] = unitID & 0x00ff;
    
        console.log("Data before _encStr (double - part 1):", this.data.slice(0, 40));
        let dp1_end = this._encStr(this.data, 12); // Encode the first part, starting from data[12]
        //dp1_end 现在是 12 + 14 = 26
    
        // Second part of the double packet
        this.data[dp1_end++] = extra0; // dp1_end = 26
        this.data[dp1_end++] = extra1; // dp1_end = 27
        this.data[dp1_end++] = extra2; // dp1_end = 28
        this.data[dp1_end++] = extra3; // dp1_end = 29
        console.log("Data before _encStr (double - part 2):", this.data.slice(0, 40));
        let dp2_end = this._encStr(this.data, dp1_end); // Encode the second part, starting from extra0
        //dp2_end 现在是 26 + 14 = 40
        console.log("Data after second _encStr:", this.data.slice(0, dp2_end));
        this.loaded = dp2_end; //  this.loaded 设置为第二个包结束的位置.
        console.log("this.loaded", this.loaded)
    
        return 0;
    }
    _encGetSamp() {
        let b;
        let ofs;

        let lthu = this.thu;
        this.thu += this.incru;
        this.thu = this.thu % 0x100000000; // 模拟 32 位无符号整数的环绕

        console.log("--- _encGetSamp ---");
        //console.log("this:", this);
        console.log("thu:", this.thu, "lthu:", lthu);

        if (this.thu < lthu) {
            this.ipos++;
            if (this.ipos > 7) {
                this.ipos = 0;
                this.bpos++; // 递增字节位置

            }

            if (this.preamble_count > 0) {
                this.preamble_count--;
                b = 0; // 前导码期间，位值始终为 0
                if (this.lb != 0) {
                    this.xorb = 1;
                    this.lb = 0;
                } else {
                    this.xorb = 0;
                }

                console.log("Preamble bit. ipos:", this.ipos, "bpos:", this.bpos, "preamble_count:", this.preamble_count);
            } else {

                if (this.bpos >= this.loaded) {
                    this.state = 0;
                    console.log("End of data reached");
                    return this.sintable[0];
                }
                console.log("ipos:", this.ipos, "bpos:", this.bpos);
                //b = (this.data[this.bpos] >> this.ipos) & 0x01; // LSB first
                b = (this.data[this.bpos] >> (7-this.ipos)) & 0x01; // 改为 MSB first
                console.log("Current bit (b):", b, "from data:", this.data[this.bpos].toString(2), "ipos:", this.ipos);


                if (b !== this.lb) {
                    this.xorb = 1;
                    this.lb = b;
                } else {
                    this.xorb = 0;
                }
            }
        }

        console.log("xorb:", this.xorb);

        if (this.xorb) {
            this.tthu += this.incru18;
        } else {
            this.tthu += this.incru;
        }

        console.log("tthu:", this.tthu);
        //ofs = this.tthu >>> 24;
        ofs = (this.tthu % 0x100000000) >>> 24; // Modulo 2^32 before the shift
        console.log("ofs:", ofs);

        return this.sintable[ofs];
    }


    getSamples() {
        if (!this.loaded) {
            return new Int16Array(0);
        }

        if (this.state === 0) {
            this.tthu = 0;
            this.thu = 0;
            this.bpos = 0;
            this.ipos = 0;
            this.state = 1;
            this.xorb = 1;
            this.lb = 0;
            this.preamble_count = this.preamble_set * 8;
            console.log("Initial state - bpos:", this.bpos, "ipos:", this.ipos, "preamble_count:", this.preamble_count, "lb:", this.lb, "xorb:", this.xorb);
            console.log("Loaded data:", this.data.slice(0, this.loaded));
        }


        const bitsPerPacket = this.loaded * 8;
        const samplesPerBit = this.sampleRate / 1200;
        const preambleSamples = this.preamble_set * 8 * samplesPerBit;
        let totalSamples = Math.ceil((bitsPerPacket + preambleSamples) * samplesPerBit);

        const buffer = new Int16Array(totalSamples);
        let i = 0;

        while (i < totalSamples && this.state) {
            buffer[i++] = this._encGetSamp();
        }

        if (this.state === 0) {
            this.loaded = 0;
        }
        return buffer;
    }
}


/**
 * PCM 编码器
 * @param {Uint8Array} mdc1200Data - MDC1200 编码数据
 * @returns {ArrayBuffer} PCM 编码数据
 */
function pcmEncode(mdc1200Data) {
    if (!(mdc1200Data instanceof Uint8Array)) {
      throw new TypeError('Input data must be Uint8Array');
    }
  
    const pcmData = new Int16Array(mdc1200Data.length * 2);
    for (let i = 0; i < mdc1200Data.length; i++) {
      const sample = (mdc1200Data[i] - 127) << 8;
      pcmData[i * 2] = sample;
      pcmData[i * 2 + 1] = sample;
    }
    return pcmData.buffer;
  }
  
  module.exports = {
    MDC1200Encoder,
    pcmEncode
  };
  



// --- Example Usage ---
async function main() {
    const encoder = new MDC1200Encoder();   //注释掉单包测试
    encoder.setPreamble(5);

    // // Simplified test case (更容易调试)
    let op = 0x12;
    let arg = 0x34; // Simplified
    let unitID = 0x5678; // Simplified
    encoder.setPacket(op, arg, unitID);
    const samples = encoder.getSamples();

    let wav = new WaveFile();
    wav.fromScratch(1, 8000, '16', samples);

    try {
        await fs.writeFile('output.wav', wav.toBuffer());
        console.log('WAV file written successfully!');
    } catch (err) {
        console.error('Error writing WAV file:', err);
    }

    // Double packet example (also in the async function)
    const encoder2 = new MDC1200Encoder();
    encoder2.setPreamble(3);
     op = 0x35;
     arg = 0xAB;
     unitID = 0x1234;
     let extra0 = 0x11;
     let extra1 = 0x22;
     let extra2 = 0x33;
     let extra3 = 0x44;
    encoder2.setDoublePacket(op, arg, unitID, extra0, extra1, extra2, extra3);
    const samples2 = encoder2.getSamples();

    let wav2 = new WaveFile();
    wav2.fromScratch(1, 8000, '16', samples2);

    try {
      await fs.writeFile('output2.wav', wav2.toBuffer());
      console.log('Double-packet WAV file written successfully!');
    } catch(err) {
      console.error('Error writing double-packet WAV file:', err);
    }
    // console.log(`Generated ${samples.length} samples for single packet.`);
    // console.log(`Generated ${samples2.length} samples for double packet.`);
}
