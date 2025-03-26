class MDC1200Encoder {
    constructor() {
        this.sampleRate = 8000;
        // --- Phase increments for 8000 Hz ---
        this.incru = 644245094;    // 1200 Hz @ 8000 Hz
        this.incru18 = 966367642;   // 1800 Hz @ 8000 Hz
        // Use the S16 full amplitude sintable matching mdc_encode.c
        this.sintable = this._generateS16FullAmplitudeSintable();
        this.loaded = 0;
        this.state = 0;
        // Match mdc_encode.c structure - preamble_set controls repeats of data[0]
        this.preamble_set = 0; // Default: no extra repeats of data[0]

        // Encoder state variables used during sample generation
        this.tthu = 0; // Tone phase accumulator
        this.thu = 0;  // Bit clock phase accumulator
        this.bpos = 0; // Byte position in this.data
        this.ipos = 0; // Bit position within byte (0-7, MSB first as per _enc_get_samp read)
        this.lb = 0;   // Last raw bit read
        this.xorb = 1; // Last XOR state (1 if transition needed, 0 otherwise), init to 1 as per C
        this.preamble_count = 0; // Countdown for data[0] repeats
        this.data = null; // Buffer holding the full packet (leader + encoded data)
    }

    _generateS16FullAmplitudeSintable() {
       // This matches the table in mdc_encode.c for S16 Full Amplitude
       return new Int16Array([
            0,    784,   1569,   2352,   3134,   3914,   4692,   5467,
            6239,   7007,   7770,   8529,   9283,  10031,  10774,  11509,
            12238,  12960,  13673,  14379,  15075,  15763,  16441,  17109,
            17767,  18414,  19051,  19675,  20288,  20889,  21477,  22052,
            22613,  23162,  23696,  24216,  24721,  25212,  25687,  26147,
            26591,  27019,  27431,  27826,  28204,  28566,  28910,  29237,
            29546,  29838,  30111,  30366,  30603,  30822,  31022,  31203,
            31366,  31510,  31634,  31740,  31827,  31894,  31942,  31971,
            31981,  31971,  31942,  31894,  31827,  31740,  31634,  31510,
            31366,  31203,  31022,  30822,  30603,  30366,  30111,  29838,
            29546,  29237,  28910,  28566,  28204,  27826,  27431,  27019,
            26591,  26147,  25687,  25212,  24721,  24216,  23696,  23162,
            22613,  22052,  21477,  20889,  20288,  19675,  19051,  18414,
            17767,  17109,  16441,  15763,  15075,  14379,  13673,  12960,
            12238,  11509,  10774,  10031,   9283,   8529,   7770,   7007,
            6239,   5467,   4692,   3914,   3134,   2352,   1569,    784,
            0,   -784,  -1569,  -2352,  -3134,  -3914,  -4692,  -5467,
            -6239,  -7007,  -7770,  -8529,  -9283, -10031, -10774, -11509,
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
            -12238, -11509, -10774, -10031,  -9283,  -8529,  -7770,  -7007,
            -6239,  -5467,  -4692,  -3914,  -3134,  -2352,  -1569,   -784
        ]);
    }

    // Matches mdc_encode.c function
    setPreamble(preambleLength) {
        if (preambleLength < 0) {
            console.error("Preamble length must be non-negative.");
            return -1; // Match C error return
        }
        this.preamble_set = preambleLength;
        console.log(`Preamble repeat count set to: ${this.preamble_set}`);
        return 0; // Match C success return
    }

    // --- CRC function (Using the logic from the *initial* JS code provided) ---
    _flip(val, bits) {
        let res = 0;
        for (let i = 0; i < bits; i++) {
            if ((val >> i) & 1) {
                res |= 1 << (bits - 1 - i);
            }
        }
        return res;
    }

    // Assuming this CRC matches the (unknown) C _docrc implementation
    _docrc(dataSlice, len) {
         let crc = 0x0000;
         for (let i = 0; i < len; i++) {
             let c = this._flip(dataSlice[i], 8); // Reflect data byte
             for (let j = 0x80; j; j >>= 1) { // Process MSB first
                 let bit = crc & 0x8000;
                 crc <<= 1;
                 if (c & j) bit ^= 0x8000; // XOR data bit if 1
                 if (bit) crc ^= 0x1021; // XOR with poly if necessary
             }
         }
         crc = this._flip(crc, 16); // Reflect result
         crc ^= 0xffff; // Final XOR
         return crc & 0xFFFF;
    }
    // --- End CRC function ---

    // --- Leader function (Matches mdc_encode.c _enc_leader) ---
    _enc_leader(outDataArray) {
        outDataArray[0] = 0x55;
        outDataArray[1] = 0x55;
        outDataArray[2] = 0x55;
        outDataArray[3] = 0x55;
        outDataArray[4] = 0x55;
        outDataArray[5] = 0x55;
        outDataArray[6] = 0x55;
        outDataArray[7] = 0x07; // Sync word starts
        outDataArray[8] = 0x09;
        outDataArray[9] = 0x2a;
        outDataArray[10] = 0x44;
        outDataArray[11] = 0x6f; // Sync word ends
        // Returns the index *after* the leader (12)
        return 12;
    }
    // --- End Leader function ---

    // --- ECC and Interleaving (Replicating mdc_encode.c _enc_str) ---
      // --- ECC 和 Interleaving (尝试更明确的 ECC 写法) ---
      _enc_str(dataArray, offset) {

        // 1. CRC (保持不变)
        const crcInput = dataArray.slice(offset, offset + 4);
        let ccrc = this._docrc(crcInput, 4);
        console.log(`JS CRC: ${ccrc.toString(16).padStart(4, '0')} (LSB: ${(ccrc & 0xff).toString(16).padStart(2, '0')}, MSB: ${((ccrc >> 8) & 0xff).toString(16).padStart(2, '0')})`);
        dataArray[offset + 4] = ccrc & 0x00ff;
        dataArray[offset + 5] = (ccrc >> 8) & 0x00ff;
        dataArray[offset + 6] = 0;
 
        // 3. "Pseudo-ECC" Encoding (更明确的版本)
        let csr = [0, 0, 0, 0, 0, 0, 0]; // 明确初始化为数字 0
 
        for (let i = 0; i < 7; i++) { // 遍历 7 个输入字节
            const currentInputByte = dataArray[offset + i];
            let currentOutputByte = 0; // 初始化将生成的 ECC 字节为 0
 
            for (let j = 0; j < 8; j++) { // 遍历输入字节的 8 个比特, LSB first (j=0 to 7)
                // 显式更新 csr 数组 (从后往前复制)
                csr[6] = csr[5];
                csr[5] = csr[4];
                csr[4] = csr[3];
                csr[3] = csr[2];
                csr[2] = csr[1];
                csr[1] = csr[0];
 
                // 获取输入比特并放入 csr[0] (确保是 0 或 1)
                csr[0] = (currentInputByte >> j) & 0x01;
 
                // 明确获取抽头值 (确保是 0 或 1)
                const bit0 = csr[0];
                const bit2 = csr[2];
                const bit5 = csr[5];
                const bit6 = csr[6];
 
                // 计算校验比特
                const outputEccBit = (bit0 ^ bit2 ^ bit5 ^ bit6) & 0x01; // 确保结果是 0 或 1
 
                // 打包校验比特 (LSB first)
                currentOutputByte |= (outputEccBit << j);
            }
            // 存储完成的 ECC 字节
            dataArray[offset + 7 + i] = currentOutputByte;
        }
 
        // --- PRINT AFTER ECC (BEFORE INTERLEAVE) ---
        let afterEccBytes = [];
        for(let i=0; i<14; i++) afterEccBytes.push(dataArray[offset + i].toString(16).padStart(2, '0').toUpperCase());
        console.log(`JS After ECC (Before Interleave): ${afterEccBytes.join(' ')}`);
 
 
        // 4. Interleaving (保持不变)
        let lbits = new Array(112);
        let k = 0;
        let m = 0;
        for (let i = 0; i < 14; i++) {
            const currentByte = dataArray[offset + i];
            for (let j = 0; j < 8; j++) {
                const bit = (currentByte >> j) & 0x01;
                lbits[k] = bit;
                k += 16;
                if (k >= 112) { k = ++m; }
            }
        }
        k = 0;
        for (let i = 0; i < 14; i++) {
            let outputByte = 0;
            for (let j = 7; j >= 0; j--) {
                if (lbits[k]) { outputByte |= (1 << j); }
                k++;
            }
            dataArray[offset + i] = outputByte;
        }
 
        // --- PRINT FINAL OUTPUT (AFTER INTERLEAVE) ---
        let finalBytes = [];
        for(let i=0; i<14; i++) finalBytes.push(dataArray[offset + i].toString(16).padStart(2, '0').toUpperCase());
        console.log(`JS Final Output (After Interleave): ${finalBytes.join(' ')}`);
 
        return offset + 14;
    }
    // --- End of _enc_str ---


    // --- Packet Setting (Matches mdc_encode.c structure) ---
    setPacket(op, arg, unitID) {
        if (this.loaded) {
            console.error("Encoder already loaded with data.");
            return -1;
        }
        this.state = 0; // Reset state machine

        const leaderLength = 12;
        const encodedDataLength = 14;
        const totalDataLength = leaderLength + encodedDataLength;
        this.data = new Uint8Array(totalDataLength); // Allocate buffer

        // 1. Add Leader (7x 0x55 + 5x Sync)
        let dp = this._enc_leader(this.data); // dp is now 12

        // 2. Add Data Part (op, arg, unitID) starting at index 12
        this.data[dp++] = op;
        this.data[dp++] = arg;
        this.data[dp++] = (unitID >> 8) & 0xff; // ID MSB
        this.data[dp++] = unitID & 0xff;        // ID LSB

        // 3. Encode Data Part (CRC, "Pseudo-ECC", Interleave) starting from offset 12
        //    _enc_str operates in-place on this.data
        this._enc_str(this.data, leaderLength); // Pass offset 12

        this.loaded = totalDataLength; // 12 + 14 = 26
        console.log(`Single packet set. Total bytes loaded: ${this.loaded}`);
        return 0; // Success
    }

    setDoublePacket(op, arg, unitID, extra0, extra1, extra2, extra3) {
        if (this.loaded) {
            console.error("Encoder already loaded with data.");
            return -1;
        }
        this.state = 0;

        const leaderLength = 12;
        const encodedDataLength = 14;
        const totalDataLength = leaderLength + encodedDataLength * 2;
        this.data = new Uint8Array(totalDataLength);

        // 1. Add Leader
        let dp = this._enc_leader(this.data); // dp = 12

        // --- First Data Block ---
        // 2a. Add Data Part 1
        this.data[dp++] = op;
        this.data[dp++] = arg;
        this.data[dp++] = (unitID >> 8) & 0xff;
        this.data[dp++] = unitID & 0xff;

        // 3a. Encode Data Part 1 (offset 12)
        dp = this._enc_str(this.data, leaderLength); // dp is now 12 + 14 = 26

        // --- Second Data Block ---
        // 2b. Add Data Part 2 (starting at index 26)
        this.data[dp++] = extra0;
        this.data[dp++] = extra1;
        this.data[dp++] = extra2;
        this.data[dp++] = extra3;

        // 3b. Encode Data Part 2 (starting from offset 26)
        this._enc_str(this.data, dp - 4); // Pass offset 26

        this.loaded = totalDataLength; // 12 + 14 + 14 = 40
        console.log(`Double packet set. Total bytes loaded: ${this.loaded}`);
        return 0; // Success
    }
    // --- End Packet Setting ---

    // --- Sample Generation (Matches mdc_encode.c logic) ---
    _enc_get_samp() { // Renamed to match C function name
        let b;      // The raw bit read from data
        let ofs;    // Offset into sintable

        // Bit clock based on 1200 Hz tone
        const lthu = this.thu; // Store previous phase
        this.thu += this.incru;
        this.thu %= 0x100000000; // Simulate uint32 wrap

        // Check if bit clock wrapped (time for next bit)
        if (this.thu < lthu) {
            this.ipos++; // Advance bit position within byte (0..7)
            if (this.ipos > 7) {
                this.ipos = 0; // Reset bit position

                // Handle preamble repeat count vs normal byte advance
                if (this.preamble_count > 0) {
                    this.preamble_count--;
                    // Do NOT advance bpos during preamble repeat
                } else {
                    this.bpos++; // Advance to next byte in data buffer
                }

                // Check if we are past the loaded data
                if (this.bpos >= this.loaded) {
                    this.state = 0; // Encoding finished
                    // console.log("End of data reached.");
                    // Return silence (or center value for unsigned formats)
                 
                        return this.sintable[0]; // Midpoint for unsigned
             
                }
            }

            // Read the current bit (MSB first) from the data buffer
            // bpos is correctly managed by the preamble/advance logic above
            b = (this.data[this.bpos] >> (7 - this.ipos)) & 0x01;

            // Update XOR state based on transition detection
            if (b !== this.lb) {
                this.xorb = 1; // Transition occurred
            } else {
                this.xorb = 0; // No transition
            }
            this.lb = b; // Store current bit for next comparison
        }
        // Note: xorb state persists between bit clock ticks

        // Update tone phase accumulator based on XOR state
        if (this.xorb) {
            this.tthu += this.incru18; // Use 1800 Hz increment
        } else {
            this.tthu += this.incru;   // Use 1200 Hz increment
        }
        this.tthu %= 0x100000000; // Simulate uint32 wrap

        // Calculate sintable offset from high byte of tone phase
        ofs = this.tthu >>> 24;

        // Return sample from table
        return this.sintable[ofs];
    }

    // --- Get Samples Public Method (Matches mdc_encode.c structure) ---
    getSamples(bufferSize) { // Now expects bufferSize like C code
        if (!this.loaded) {
            console.warn("Encoder not loaded with data.");
            return 0; // No samples generated
        }

        // Initialize state if starting a new packet generation
        if (this.state === 0) {
            this.tthu = 0;
            this.thu = 0;
            this.bpos = 0;
            this.ipos = -1; // Will become 0 on first bit clock tick in _enc_get_samp
            this.state = 1;
            this.xorb = 1; // Initial XOR state matches C code
            this.lb = 0;   // Initial last bit matches C code
            // Set the countdown for repeating data[0] based on preamble_set
            this.preamble_count = this.preamble_set;
            console.log(`Starting sample generation. Preamble repeats: ${this.preamble_count}`);
        }

        // Generate samples into a *new* buffer (more JS-like than C's pass-in buffer)
        // We don't know exact size beforehand, so use an array and trim later
        const samples = [];
        let count = 0;

        // Generate samples until bufferSize is reached OR encoding finishes
        // Use a safety limit to prevent potential infinite loops
        const maxSamples = bufferSize ? bufferSize * 1.2 : (this.loaded * 8 * (this.sampleRate / 1200)) * 1.5; // Estimate + 50%
        let safetyCounter = 0;

        while (this.state === 1 && safetyCounter < maxSamples) {
            const sample = this._enc_get_samp();
            samples.push(sample);
            count++;
            safetyCounter++;
            // If a specific bufferSize was requested, stop when reached
            if (bufferSize && count >= bufferSize) {
                break;
            }
        }

         if (this.state === 1 && safetyCounter >= maxSamples) {
             console.error("Sample generation stopped due to safety limit. Possible infinite loop or incorrect state.");
             this.state = 0; // Force stop
         }


        // If encoding finished naturally (state became 0)
        if (this.state === 0) {
            this.loaded = 0; // Reset loaded flag, ready for next packet
            console.log(`Encoding finished naturally after ${count} samples.`);
        } else {
            console.log(`Sample generation stopped after ${count} samples (bufferSize limit?). State: ${this.state}`);
        }

        // Return the generated samples as an Int16Array
        return new Int16Array(samples);
    }
    // --- End Sample Generation ---

} // End of class MDC1200Encoder

module.exports = {
    MDC1200Encoder,
};