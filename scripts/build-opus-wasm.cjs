const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const esbuild = require('esbuild');

const projectDir = path.resolve(__dirname, '..');
const sourceEntryPath = path.join(
    projectDir,
    'node_modules',
    'libopus-wasm',
    'dist',
    'index.js'
);
const outputDir = path.join(projectDir, 'utils', 'vendor');
const outputPath = path.join(outputDir, 'libopusWasm.js');
const generatedModulePath = path.join(
    projectDir,
    'node_modules',
    'libopus-wasm',
    'dist',
    'generated',
    'libopus.generated.mjs'
);
const wasmOutputPath = path.join(outputDir, 'libopus.wasm.br');

if (!fs.existsSync(sourceEntryPath) || !fs.existsSync(generatedModulePath)) process.exit(0);
fs.mkdirSync(outputDir, { recursive: true });

function extractEmbeddedWasm() {
    const source = fs.readFileSync(generatedModulePath, 'utf8');
    const { literalStart, literalEnd } = findEmbeddedWasmLiteral(source);
    const literal = source.slice(literalStart, literalEnd + 1);
    const encoded = Function(`"use strict"; return (${literal});`)();
    const wasm = Buffer.allocUnsafe(encoded.length);
    for (let i = 0; i < encoded.length; i++) {
        const charCode = encoded.charCodeAt(i);
        wasm[i] = (~charCode >> 8) & charCode;
    }
    if (wasm.subarray(0, 4).toString('hex') !== '0061736d') {
        throw new Error('Extracted libopus data is not a WASM module');
    }
    return wasm;
}

function findEmbeddedWasmLiteral(source) {
    const marker = 'function findWasmBinary(){return binaryDecode(';
    const markerIndex = source.indexOf(marker);
    if (markerIndex < 0) throw new Error('Unable to locate embedded libopus WASM');

    const literalStart = markerIndex + marker.length;
    const quote = source[literalStart];
    if (quote !== "'" && quote !== '"') throw new Error('Unexpected embedded WASM string');

    let literalEnd = -1;
    for (let i = literalStart + 1; i < source.length; i++) {
        if (source[i] !== quote) continue;
        let backslashes = 0;
        for (let j = i - 1; j > literalStart && source[j] === '\\'; j--) backslashes++;
        if (backslashes % 2 === 0) {
            literalEnd = i;
            break;
        }
    }
    if (literalEnd < 0) throw new Error('Unterminated embedded WASM string');
    return { literalStart, literalEnd };
}

async function main() {
    const wasm = extractEmbeddedWasm();
    const compressedWasm = zlib.brotliCompressSync(wasm, {
        params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: 11
        }
    });
    fs.writeFileSync(wasmOutputPath, compressedWasm);

    // The WeChat npm builder cannot follow libopus-wasm's exports-only ESM/.mjs
    // graph. Generate one local CommonJS module containing JS glue + WASM so the
    // mini-program compiler only has to resolve a normal relative require().
    await esbuild.build({
        entryPoints: [sourceEntryPath],
        outfile: outputPath,
        bundle: true,
        format: 'cjs',
        platform: 'browser',
        target: 'es2017',
        minify: true,
        legalComments: 'none',
        define: {
            'globalThis.process': 'undefined'
        },
        plugins: [{
            name: 'remove-embedded-wasm',
            setup(build) {
                build.onLoad({ filter: /libopus\.generated\.mjs$/ }, args => {
                    const source = fs.readFileSync(args.path, 'utf8');
                    const { literalStart, literalEnd } = findEmbeddedWasmLiteral(source);
                    return {
                        contents: `${source.slice(0, literalStart)}''${source.slice(literalEnd + 1)}`,
                        loader: 'js'
                    };
                });
            }
        }, {
            name: 'ignore-node-builtins',
            setup(build) {
                build.onResolve({ filter: /^node:/ }, args => ({
                    path: args.path,
                    namespace: 'node-shim'
                }));
                build.onLoad({ filter: /.*/, namespace: 'node-shim' }, () => ({
                    contents: 'export function createRequire() { throw new Error("Node APIs are unavailable"); } export default {};',
                    loader: 'js'
                }));
            }
        }],
        logLevel: 'warning'
    });
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
