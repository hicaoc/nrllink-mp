
import g711 from './utils/audioG711.js';
const { G711Codec } = g711;

const codec = new G711Codec();

function verify() {
    console.log("Starting verification...");

    // Test encoding for all possible Int16 values
    let encodeErrors = 0;
    for (let i = -32768; i <= 32767; i++) {
        const tableResult = codec.linear2alaw(i);
        const algoResult = codec._linear2alaw(i);
        if (tableResult !== algoResult) {
            if (encodeErrors < 10) {
                console.error(`Encode Error at ${i}: table=${tableResult}, algo=${algoResult}`);
            }
            encodeErrors++;
        }
    }

    if (encodeErrors === 0) {
        console.log("✅ Encoding verification passed for all 65536 values.");
    } else {
        console.error(`❌ Encoding verification failed with ${encodeErrors} errors.`);
    }

    // Test decoding for all possible 8-bit values
    let decodeErrors = 0;
    for (let i = 0; i < 256; i++) {
        const tableResult = codec.alaw2linear(i);
        const algoResult = codec._alaw2linear(i);
        if (tableResult !== algoResult) {
            if (decodeErrors < 10) {
                console.error(`Decode Error at ${i}: table=${tableResult}, algo=${algoResult}`);
            }
            decodeErrors++;
        }
    }

    if (decodeErrors === 0) {
        console.log("✅ Decoding verification passed for all 256 values.");
    } else {
        console.error(`❌ Decoding verification failed with ${decodeErrors} errors.`);
    }

    // Performance test
    const iterations = 1000000;
    const samples = new Int16Array(iterations);
    for (let i = 0; i < iterations; i++) samples[i] = (Math.random() * 65536) - 32768;

    console.log(`Starting performance test with ${iterations} iterations...`);

    const startAlgo = Date.now();
    for (let i = 0; i < iterations; i++) codec._linear2alaw(samples[i]);
    const endAlgo = Date.now();
    console.log(`Algorithm time: ${endAlgo - startAlgo}ms`);

    const startTable = Date.now();
    for (let i = 0; i < iterations; i++) codec.linear2alaw(samples[i]);
    const endTable = Date.now();
    console.log(`Table time: ${endTable - startTable}ms`);

    const speedup = (endAlgo - startAlgo) / (endTable - startTable);
    console.log(`Speedup: ${speedup.toFixed(2)}x`);
}

verify();
