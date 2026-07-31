export class MDC1200Encoder {
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
            0, 546, 1093, 1639, 2184, 2727, 3269, 3809, 4347, 4882, 5414, 5942, 6468, 6989, 7506, 8019,
            8527, 9029, 9526, 10018, 10503, 10982, 11455, 11920, 12379, 12830, 13273, 13708, 14135, 14554, 14963, 15364,
            15755, 16137, 16510, 16872, 17224, 17566, 17897, 18217, 18527, 18825, 19112, 19387, 19651, 19903, 20142, 20370,
            20586, 20789, 20979, 21157, 21322, 21475, 21614, 21740, 21854, 21954, 22041, 22114, 22174, 22221, 22255, 22275,
            22282, 22275, 22255, 22221, 22174, 22114, 22041, 21954, 21854, 21740, 21614, 21475, 21322, 21157, 20979, 20789,
            20586, 20370, 20142, 19903, 19651, 19387, 19112, 18825, 18527, 18217, 17897, 17566, 17224, 16872, 16510, 16137,
            15755, 15364, 14963, 14554, 14135, 13708, 13273, 12830, 12379, 11920, 11455, 10982, 10503, 10018, 9526, 9029,
            8527, 8019, 7506, 6989, 6468, 5942, 5414, 4882, 4347, 3809, 3269, 2727, 2184, 1639, 1093, 546,
            0, -546, -1093, -1639, -2184, -2727, -3269, -3809, -4347, -4882, -5414, -5942, -6468, -6989, -7506, -8019,
            -8527, -9029, -9526, -10018, -10503, -10982, -11455, -11920, -12379, -12830, -13273, -13708, -14135, -14554, -14963, -15364,
            -15755, -16137, -16510, -16872, -17224, -17566, -17897, -18217, -18527, -18825, -19112, -19387, -19651, -19903, -20142, -20370,
            -20586, -20789, -20979, -21157, -21322, -21475, -21614, -21740, -21854, -21954, -22041, -22114, -22174, -22221, -22255, -22275,
            -22282, -22275, -22255, -22221, -22174, -22114, -22041, -21954, -21854, -21740, -21614, -21475, -21322, -21157, -20979, -20789,
            -20586, -20370, -20142, -19903, -19651, -19387, -19112, -18825, -18527, -18217, -17897, -17566, -17224, -16872, -16510, -16137,
            -15755, -15364, -14963, -14554, -14135, -13708, -13273, -12830, -12379, -11920, -11455, -10982, -10503, -10018, -9526, -9029,
            -8527, -8019, -7506, -6989, -6468, -5942, -5414, -4882, -4347, -3809, -3269, -2727, -2184, -1639, -1093, -546
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
        for (let i = 0; i < 14; i++) afterEccBytes.push(dataArray[offset + i].toString(16).padStart(2, '0').toUpperCase());
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
        for (let i = 0; i < 14; i++) finalBytes.push(dataArray[offset + i].toString(16).padStart(2, '0').toUpperCase());
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
            samples.push(sample * 0.2); //音量小一半
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

// ---------------------------------------------------------------------------
// MDC1200 Decoder
// Ported from Matthew Kaufman's mdc_decode.c (FOURPOINT strategy, MDC_ND=5).
// Expects S16 PCM samples; supported sample rates follow the incru table of
// the original library (8000/16000/22050/32000/44100/48000 Hz).
// ---------------------------------------------------------------------------

const MDC_ND = 5;
const MDC_GDTHRESH = 5; // "good bits" threshold for sync detection

function _decoderIncru(sampleRate) {
    switch (Number(sampleRate)) {
        case 8000: return 644245094;
        case 16000: return 322122547;
        case 22050: return 233739716;
        case 32000: return 161061274;
        case 44100: return 116869858;
        case 48000: return 107374182;
        default: return Math.floor(1200 * 2 * (0x80000000 / sampleRate));
    }
}

function _decFlip(val, bits) {
    let res = 0;
    for (let i = 0; i < bits; i++) {
        if ((val >> i) & 1) {
            res |= 1 << (bits - 1 - i);
        }
    }
    return res;
}

function _decDocrc(dataSlice, len) {
    let crc = 0x0000;
    for (let i = 0; i < len; i++) {
        const c = _decFlip(dataSlice[i], 8); // Reflect data byte
        for (let j = 0x80; j; j >>= 1) { // Process MSB first
            let bit = crc & 0x8000;
            crc <<= 1;
            if (c & j) bit ^= 0x8000; // XOR data bit if 1
            if (bit) crc ^= 0x1021; // XOR with poly if necessary
        }
    }
    crc = _decFlip(crc, 16); // Reflect result
    crc ^= 0xffff; // Final XOR
    return crc & 0xFFFF;
}

function _popcount32(n) {
    let count = 0;
    let v = n | 0;
    while (v) {
        ++count;
        v &= (v - 1);
    }
    return count;
}

export class MDC1200Decoder {
    constructor(sampleRate = 8000) {
        this.incru = _decoderIncru(sampleRate);
        this.incr5 = 5 * this.incru;
        this.sampleRate = Number(sampleRate) || 8000;

        this.good = 0;
        this.indouble = 0;
        this.op = 0;
        this.arg = 0;
        this.unitID = 0;
        this.extra0 = 0;
        this.extra1 = 0;
        this.extra2 = 0;
        this.extra3 = 0;

        this.du = [];
        for (let i = 0; i < MDC_ND; i++) {
            this.du.push({
                thu: Math.floor(i * 2 * (0x80000000 / MDC_ND)) >>> 0,
                xorb: 0,
                invert: 0,
                nlstep: i,
                nlevel: new Float64Array(10),
                synclow: 0,
                synchigh: 0,
                shstate: -1,
                shcount: 0,
                bits: new Uint8Array(112),
            });
        }
    }

    _clearbits(x) {
        this.du[x].bits.fill(0);
    }

    // Convolutional ECC single-error correction (mdc_decode.c _gofix)
    _gofix(data) {
        const csr = [0, 0, 0, 0, 0, 0, 0];
        let syn = 0;

        for (let i = 0; i < 7; i++) {
            for (let j = 0; j <= 7; j++) {
                for (let k = 6; k > 0; k--) csr[k] = csr[k - 1];

                csr[0] = (data[i] >> j) & 0x01;
                const b = csr[0] + csr[2] + csr[5] + csr[6];
                syn <<= 1;
                if ((b & 0x01) ^ ((data[i + 7] >> j) & 0x01)) {
                    syn |= 1;
                }
                let ec = 0;
                if (syn & 0x80) ++ec;
                if (syn & 0x20) ++ec;
                if (syn & 0x04) ++ec;
                if (syn & 0x02) ++ec;
                if (ec >= 3) {
                    syn ^= 0xa6;
                    let fixi = i;
                    let fixj = j - 7;
                    if (fixj < 0) {
                        --fixi;
                        fixj += 8;
                    }
                    if (fixi >= 0) {
                        data[fixi] ^= 1 << fixj; // flip
                    }
                }
            }
        }
    }

    _procbits(x, out) {
        const du = this.du[x];
        const lbits = new Uint8Array(112);
        let lbc = 0;

        // Deinterleave 112 bits
        for (let i = 0; i < 16; i++) {
            for (let j = 0; j < 7; j++) {
                lbits[lbc++] = du.bits[(j * 16) + i];
            }
        }

        const data = new Uint8Array(14);
        for (let i = 0; i < 14; i++) {
            for (let j = 0; j < 8; j++) {
                if (lbits[(i * 8) + j]) {
                    data[i] |= 1 << j;
                }
            }
        }

        this._gofix(data);

        const ccrc = _decDocrc(data, 4);
        const rcrc = (data[5] << 8) | data[4];

        if (ccrc === rcrc) {
            if (du.shstate === 2) {
                // Second half of a double packet
                this.extra0 = data[0];
                this.extra1 = data[1];
                this.extra2 = data[2];
                this.extra3 = data[3];

                for (let k = 0; k < MDC_ND; k++) this.du[k].shstate = -1;

                this.good = 2;
                this.indouble = 0;
            } else if (!this.indouble) {
                this.good = 1;
                this.op = data[0];
                this.arg = data[1];
                this.unitID = (data[2] << 8) | data[3];

                if (data[0] === 0x35 || data[0] === 0x55) {
                    // Opcodes that mean a double packet follows
                    this.good = 0;
                    this.indouble = 1;
                    du.shstate = 2;
                    du.shcount = 0;
                    this._clearbits(x);
                } else {
                    for (let k = 0; k < MDC_ND; k++) this.du[k].shstate = -1;
                }
            } else {
                // Any subsequent good decoder allowed to attempt second half
                du.shstate = 2;
                du.shcount = 0;
                this._clearbits(x);
            }
        } else {
            du.shstate = -1;
        }

        if (this.good) {
            out.push({
                frames: this.good,
                op: this.op,
                arg: this.arg,
                unitID: this.unitID,
                extra: [this.extra0, this.extra1, this.extra2, this.extra3],
            });
            this.good = 0;
        }
    }

    _shiftin(x, out) {
        const du = this.du[x];
        const bit = du.xorb;

        if (du.shstate === -1) {
            du.synchigh = 0;
            du.synclow = 0;
            du.shstate = 0;
        }

        if (du.shstate === 0) {
            du.synchigh = du.synchigh << 1;
            if (du.synclow & 0x80000000) du.synchigh |= 1;
            du.synclow = du.synclow << 1;
            if (bit) du.synclow |= 1;

            let gcount = _popcount32(0x000000ff & (0x00000007 ^ du.synchigh));
            gcount += _popcount32(0x092a446f ^ du.synclow);

            if (gcount <= MDC_GDTHRESH) {
                du.shstate = 1;
                du.shcount = 0;
                this._clearbits(x);
            } else if (gcount >= 40 - MDC_GDTHRESH) {
                // Inverted sync: flip polarity and continue
                du.shstate = 1;
                du.shcount = 0;
                du.xorb = du.xorb ? 0 : 1;
                du.invert = du.invert ? 0 : 1;
                this._clearbits(x);
            }
            return;
        }

        if (du.shstate === 1 || du.shstate === 2) {
            du.bits[du.shcount] = bit;
            du.shcount++;
            if (du.shcount > 111) {
                this._procbits(x, out);
            }
        }
    }

    _nlproc(x, out) {
        const du = this.du[x];
        let vnow;
        let vpast;

        switch (du.nlstep) {
            case 3:
                vnow = (-0.60 * du.nlevel[3]) + (0.97 * du.nlevel[1]);
                vpast = (-0.60 * du.nlevel[7]) + (0.97 * du.nlevel[9]);
                break;
            case 8:
                vnow = (-0.60 * du.nlevel[8]) + (0.97 * du.nlevel[6]);
                vpast = (-0.60 * du.nlevel[2]) + (0.97 * du.nlevel[4]);
                break;
            default:
                return;
        }

        du.xorb = vnow > vpast ? 1 : 0;
        if (du.invert) du.xorb = du.xorb ? 0 : 1;
        this._shiftin(x, out);
    }

    /**
     * Feed S16 PCM samples. Returns an array of decoded packets (usually
     * empty): { frames: 1|2, op, arg, unitID, extra: [e0, e1, e2, e3] }
     */
    processSamples(samples) {
        const out = [];
        if (!samples || !samples.length) return out;

        for (let i = 0; i < samples.length; i++) {
            const value = samples[i] / 65536.0;

            for (let j = 0; j < MDC_ND; j++) {
                const du = this.du[j];
                const lthu = du.thu;
                du.thu = (du.thu + this.incr5) >>> 0;
                if (du.thu < lthu) { // wrapped
                    du.nlstep++;
                    if (du.nlstep > 9) du.nlstep = 0;
                    du.nlevel[du.nlstep] = value;
                    this._nlproc(j, out);
                }
            }
        }

        return out;
    }
} // End of class MDC1200Decoder

// --- Display helpers ---

const MDC_OP_LABELS = {
    0x00: 'PTT ID',
    0x01: 'PTT ID',
    0x40: '紧急报警',
    0x11: '远程监听',
    0x63: '呼叫提醒',
};

export function formatMdcId(unitID) {
    return (Number(unitID) & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

export function describeMdcPacket(packet) {
    if (!packet) return '';

    let label = MDC_OP_LABELS[packet.op];
    if (!label) {
        if (packet.op === 0x35) {
            label = packet.frames === 2 ? '选呼' : '请求通话';
        } else if (packet.op === 0x55) {
            label = '状态消息';
        } else {
            label = `OP:0x${(packet.op & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
        }
    }

    return `MDC:${formatMdcId(packet.unitID)} ${label}`;
}

export default {
    MDC1200Encoder,
    MDC1200Decoder,
    formatMdcId,
    describeMdcPacket,
};