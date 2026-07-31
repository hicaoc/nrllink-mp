// Roundtrip test for MDC1200 encoder/decoder (utils/mdc1200.js).
// Run: node verify_mdc.mjs

import { MDC1200Encoder, MDC1200Decoder, describeMdcPacket } from './utils/mdc1200.js';

let failures = 0;

function check(name, cond, detail = '') {
    if (cond) {
        console.log(`✅ ${name}`);
    } else {
        failures++;
        console.error(`❌ ${name} ${detail}`);
    }
}

function encodeSamples(setupFn) {
    const enc = new MDC1200Encoder();
    setupFn(enc);
    return enc.getSamples(); // Int16Array @ 8000 Hz
}

// Feed samples to decoder in fixed-size chunks (simulates 20ms voice packets)
function decodeInChunks(sampleRate, samples, chunkSize) {
    const dec = new MDC1200Decoder(sampleRate);
    const packets = [];
    for (let off = 0; off < samples.length; off += chunkSize) {
        const chunk = samples.subarray(off, Math.min(off + chunkSize, samples.length));
        packets.push(...dec.processSamples(chunk));
    }
    return packets;
}

function pad(samples, leadingZeros, trailingZeros) {
    const out = new Int16Array(samples.length + leadingZeros + trailingZeros);
    out.set(samples, leadingZeros);
    return out;
}

function addNoise(samples, sigma) {
    const out = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        // Box-Muller gaussian noise
        const u1 = Math.random() || 1e-9;
        const u2 = Math.random();
        const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        let v = Math.round(samples[i] + g * sigma);
        if (v > 32767) v = 32767;
        if (v < -32768) v = -32768;
        out[i] = v;
    }
    return out;
}

function invert(samples) {
    const out = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) out[i] = -samples[i];
    return out;
}

function upsample2x(samples, interpolate) {
    const out = new Int16Array(samples.length * 2);
    for (let i = 0; i < samples.length; i++) {
        out[i * 2] = samples[i];
        const next = i + 1 < samples.length ? samples[i + 1] : samples[i];
        out[i * 2 + 1] = interpolate ? Math.round((samples[i] + next) / 2) : samples[i];
    }
    return out;
}

// --- Test 1: single packet roundtrip at 8000 Hz ---
{
    const samples = pad(encodeSamples(enc => enc.setPacket(0x01, 0x80, 0x1234)), 160, 800);
    const packets = decodeInChunks(8000, samples, 160);
    check('8kHz single packet decoded', packets.length === 1, `got ${packets.length}`);
    if (packets.length === 1) {
        const p = packets[0];
        check(
            '8kHz single packet fields',
            p.frames === 1 && p.op === 0x01 && p.arg === 0x80 && p.unitID === 0x1234,
            JSON.stringify(p)
        );
        console.log(`   label: ${describeMdcPacket(p)}`);
    }
}

// --- Test 2: double packet roundtrip at 8000 Hz ---
{
    const samples = pad(encodeSamples(enc => enc.setDoublePacket(0x35, 0x80, 0x0E8A, 0x85, 0x63, 0x00, 0x01)), 160, 800);
    const packets = decodeInChunks(8000, samples, 160);
    check('8kHz double packet decoded', packets.length === 1, `got ${packets.length}`);
    if (packets.length === 1) {
        const p = packets[0];
        check(
            '8kHz double packet fields',
            p.frames === 2 && p.op === 0x35 && p.arg === 0x80 && p.unitID === 0x0E8A &&
                p.extra[0] === 0x85 && p.extra[1] === 0x63 && p.extra[2] === 0x00 && p.extra[3] === 0x01,
            JSON.stringify(p)
        );
        console.log(`   label: ${describeMdcPacket(p)}`);
    }
}

// --- Test 3: 16000 Hz decoder with 2x upsampled stream (Opus path) ---
{
    const base = pad(encodeSamples(enc => enc.setPacket(0x00, 0x80, 0xABCD)), 160, 800);
    for (const interpolate of [false, true]) {
        const samples = upsample2x(base, interpolate);
        const packets = decodeInChunks(16000, samples, 320);
        const mode = interpolate ? 'interpolated' : 'zero-order-hold';
        check(`16kHz (${mode}) packet decoded`, packets.length === 1, `got ${packets.length}`);
        if (packets.length === 1) {
            const p = packets[0];
            check(
                `16kHz (${mode}) packet fields`,
                p.op === 0x00 && p.arg === 0x80 && p.unitID === 0xABCD,
                JSON.stringify(p)
            );
        }
    }
}

// --- Test 4: noisy signal (gaussian noise, sigma ~15% of tone peak) ---
{
    const clean = pad(encodeSamples(enc => enc.setPacket(0x01, 0x80, 0x2222)), 400, 800);
    const noisy = addNoise(clean, 1000);
    const packets = decodeInChunks(8000, noisy, 160);
    check('noisy packet decoded', packets.length === 1, `got ${packets.length}`);
    if (packets.length === 1) {
        check('noisy packet unitID', packets[0].unitID === 0x2222, JSON.stringify(packets[0]));
    }
}

// --- Test 5: inverted polarity ---
{
    const samples = invert(pad(encodeSamples(enc => enc.setPacket(0x01, 0x80, 0x3333)), 160, 800));
    const packets = decodeInChunks(8000, samples, 160);
    check('inverted packet decoded', packets.length === 1, `got ${packets.length}`);
    if (packets.length === 1) {
        check('inverted packet unitID', packets[0].unitID === 0x3333, JSON.stringify(packets[0]));
    }
}

// --- Test 6: no false positives on silence and noise ---
{
    const silence = new Int16Array(8000);
    const noiseOnly = addNoise(silence, 3000);
    const p1 = decodeInChunks(8000, silence, 160);
    const p2 = decodeInChunks(8000, noiseOnly, 160);
    check('no false positive on silence', p1.length === 0, `got ${p1.length}`);
    check('no false positive on noise', p2.length === 0, `got ${p2.length}`);
}

// --- Test 7: bit error tolerance (flip ~1% of samples' sign) ---
{
    const samples = pad(encodeSamples(enc => enc.setPacket(0x01, 0x80, 0x5678)), 160, 800);
    for (let i = 0; i < samples.length; i += 97) samples[i] = -samples[i];
    const packets = decodeInChunks(8000, samples, 160);
    check('degraded packet decoded', packets.length >= 1, `got ${packets.length}`);
    if (packets.length >= 1) {
        check('degraded packet unitID', packets[0].unitID === 0x5678, JSON.stringify(packets[0]));
    }
}

// --- Test 8: op label formatting ---
{
    check(
        'label for PTT ID',
        describeMdcPacket({ frames: 1, op: 0x01, arg: 0x80, unitID: 0x00E8 }) === 'MDC:00E8 PTT ID'
    );
    check(
        'label for emergency',
        describeMdcPacket({ frames: 1, op: 0x40, arg: 0x80, unitID: 0xFFFF }) === 'MDC:FFFF 紧急报警'
    );
    check(
        'label for unknown op',
        describeMdcPacket({ frames: 1, op: 0x99, arg: 0x00, unitID: 0x0001 }) === 'MDC:0001 OP:0x99'
    );
}

if (failures === 0) {
    console.log('\nAll MDC1200 tests passed.');
} else {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
}
