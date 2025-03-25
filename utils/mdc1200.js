class MDC1200Encoder {
    constructor() {
        this.sampleRate = 8000;
        this.incru = 644245094; // 1200 Hz @ 8000 Hz
        this.incru18 = 966367642; // 1800 Hz @ 8000 Hz
        this.sintable = this.generateSintable();
        this.loaded = 0;
        this.preamble_set = 0;
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
        if (preambleLength < 0) throw new Error("Preamble length must be non-negative.");
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
        data[9] = 0x2A;
        data[10] = 0x44;
        data[11] = 0x6F;
        return 12;
    }

    _flip(crc, bitnum) {
        let crcout = 0;
        let j = 1;
        for (let i = 1 << (bitnum - 1); i; i >>= 1) {
            if (crc & i) crcout |= j;
            j <<= 1;
        }
        return crcout;
    }

    _docrc(data, len) {
        let crc = 0x0000;
        for (let i = 0; i < len; i++) {
            let c = this._flip(data[i], 8);
            for (let j = 0x80; j; j >>= 1) {
                let bit = crc & 0x8000;
                crc <<= 1;
                if (c & j) bit ^= 0x8000;
                if (bit) crc ^= 0x1021;
            }
        }
        crc = this._flip(crc, 16);
        crc ^= 0xffff;
        return crc & 0xFFFF;
    }

    _encStr(data, offset) {
      //  console.log("--- _encStr Start ---");
      //  console.log("Input data:", data.slice(offset, offset + 14));
       // console.log("Input data.length", data.length);

        // CRC 计算 (现在在 Hamming 编码和交织之前)
        let ccrc = this._docrc(data.slice(offset, offset + 4), 4);
     //   console.log("CRC:", ccrc.toString(16));

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
      //  console.log("Data after Hamming:", data.slice(offset, offset + 14));

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
      //  console.log("lbits (interleaved bits):", lbits);

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

      //  console.log("Data after interleaving:", data.slice(offset, offset + 14));
      //  console.log("Data after _encStr (final):", data.slice(offset, offset + 14));
      //  console.log("_encStr returning. offset:", offset, "data length processed:", 14);
        return offset + 14;
    }

    setPacket(op, arg, unitID) {
        if (this.loaded) throw new Error("Encoder already loaded with data.");
        this.state = 0;
        this.data = new Uint8Array(40);
        let dp = this._encLeader(this.data);

        this.data[dp++] = op;
        this.data[dp++] = arg;
        this.data[dp++] = (unitID >> 8) & 0xff;
        this.data[dp++] = unitID & 0xff;
        this._encStr(this.data, 12);
        this.loaded = 26;
        return 0;
    }

    setDoublePacket(op, arg, unitID, extra0, extra1, extra2, extra3) {
        if (this.loaded) throw new Error("Encoder already loaded with data.");
        this.state = 0;
        this.data = new Uint8Array(60);
        let dp = this._encLeader(this.data);

        this.data[dp++] = op;
        this.data[dp++] = arg;
        this.data[dp++] = (unitID >> 8) & 0xff;
        this.data[dp++] = unitID & 0xff;
        dp = this._encStr(this.data, 12); // 第一部分

        this.data[dp++] = extra0;
        this.data[dp++] = extra1;
        this.data[dp++] = extra2;
        this.data[dp++] = extra3;
        dp = this._encStr(this.data, dp - 4); // 第二部分

        this.loaded = dp; // 应为 40（12 + 14 + 14）
        return 0;
    }

    _encGetSamp() {
        let b;
        let ofs;

        let lthu = this.thu;
        this.thu += this.incru;
        this.thu = this.thu % 0x100000000; // 模拟 32 位无符号整数的环绕

      //  console.log("--- _encGetSamp ---");
        //console.log("this:", this);
      //  console.log("thu:", this.thu, "lthu:", lthu);
        
        if (this.thu < lthu) {
            this.ipos++;
            if (this.ipos > 7) {
                this.ipos = 0;
                // 检查当前 bpos 是否越界, 
                if (this.bpos >= this.loaded)
                {
                    this.state = 0;
                   // console.log("End of data reached");
                    return this.sintable[0];
                }
                this.bpos++; // 递增 bpos
            }
         //   console.log("ipos:", this.ipos, "bpos:", this.bpos);
            b = (this.data[this.bpos] >> (7 - this.ipos)) & 0x01; // MSB first
          //  console.log("Current bit (b):", b, "from data:", this.data[this.bpos].toString(2), "ipos:", this.ipos);

            if (b !== this.lb) {
                this.xorb = 1;
                this.lb = b;
            } else {
                this.xorb = 0;
            }
        }

      //  console.log("xorb:", this.xorb);

        if (this.xorb) {
            this.tthu += this.incru18;
        } else {
            this.tthu += this.incru;
        }

      //  console.log("tthu:", this.tthu);
        //ofs = this.tthu >>> 24;
        ofs = (this.tthu % 0x100000000) >>> 24; // Modulo 2^32 before the shift
      //  console.log("ofs:", ofs);

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
        const preambleSamples = this.preamble_set * 8 * samplesPerBit;  //preamble也需要输出
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

  
  module.exports = {
    MDC1200Encoder,
    //pcmEncode
  };
  



// // --- Example Usage ---
// async function main() {
//     const encoder = new MDC1200Encoder();   //注释掉单包测试
//     encoder.setPreamble(5);

//     // // Simplified test case (更容易调试)
//     let op = 0x01;
//     let arg = 0x01; // Simplified
//     let unitID = 0xd111; // Simplified
//     encoder.encodeSinglePacket(op, arg, unitID);
//     const samples = encoder.getSamples();

//     let wav = new WaveFile();
//     wav.fromScratch(1, 8000, '16', samples);

//     try {
//         await fs.writeFile('output.wav', wav.toBuffer());
//         console.log('WAV file written successfully!');
//     } catch (err) {
//         console.error('Error writing WAV file:', err);
//     }

//     // Double packet example (also in the async function)
//     const encoder2 = new MDC1200Encoder();
//     encoder2.setPreamble(3);
//      op = 0x35;
//      arg = 0xAB;
//      unitID = 0x1234;
//      let extra0 = 0x11;
//      let extra1 = 0x22;
//      let extra2 = 0x33;
//      let extra3 = 0x44;
//     encoder2.setDoublePacket(op, arg, unitID, extra0, extra1, extra2, extra3);
//     const samples2 = encoder2.getSamples();

//     let wav2 = new WaveFile();
//     wav2.fromScratch(1, 8000, '16', samples2);

//     try {
//       await fs.writeFile('output2.wav', wav2.toBuffer());
//       console.log('Double-packet WAV file written successfully!');
//     } catch(err) {
//       console.error('Error writing double-packet WAV file:', err);
//     }
//     // console.log(`Generated ${samples.length} samples for single packet.`);
//     // console.log(`Generated ${samples2.length} samples for double packet.`);
// }
