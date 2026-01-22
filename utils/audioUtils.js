/**
 * Utility for converting PCM data to WAV format and saving to local storage.
 */

/**
 * Prepends a WAV header to PCM data.
 * @param {Uint8Array} pcmData - The PCM data (16-bit, mono).
 * @param {number} sampleRate - The sample rate (e.g., 8000).
 * @returns {Uint8Array} - The WAV data with header.
 */
function addWavHeader(pcmData, sampleRate) {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    /* RIFF identifier */
    writeString(view, 0, 'RIFF');
    /* RIFF chunk length */
    view.setUint32(4, 36 + pcmData.length, true);
    /* RIFF type */
    writeString(view, 8, 'WAVE');
    /* format chunk identifier */
    writeString(view, 12, 'fmt ');
    /* format chunk length */
    view.setUint32(16, 16, true);
    /* sample format (raw) */
    view.setUint16(20, 1, true);
    /* channel count */
    view.setUint16(22, 1, true);
    /* sample rate */
    view.setUint32(24, sampleRate, true);
    /* byte rate (sample rate * block align) */
    view.setUint32(28, sampleRate * 2, true);
    /* block align (channel count * bytes per sample) */
    view.setUint16(32, 2, true);
    /* bits per sample */
    view.setUint16(34, 16, true);
    /* data chunk identifier */
    writeString(view, 36, 'data');
    /* data chunk length */
    view.setUint32(40, pcmData.length, true);

    const wavData = new Uint8Array(44 + pcmData.length);
    wavData.set(new Uint8Array(header), 0);
    wavData.set(pcmData, 44);

    return wavData;
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

/**
 * Saves a Uint8Array as a local file.
 * @param {Uint8Array} data - The data to save.
 * @param {string} ext - File extension (e.g., 'wav').
 * @returns {Promise<string>} - The local file path.
 */
function saveToFile(data, ext) {
    return new Promise((resolve, reject) => {
        const fs = wx.getFileSystemManager();
        const fileName = `${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
        const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;

        fs.writeFile({
            filePath,
            data: data.buffer,
            encoding: 'binary',
            success: () => {
                resolve(filePath);
            },
            fail: (err) => {
                console.error('Save to file failed:', err);
                reject(err);
            }
        });
    });
}

/**
 * Cleans up old audio files to save space (keep last 50 files).
 */
function cleanupOldFiles() {
    const fs = wx.getFileSystemManager();
    fs.readdir({
        dirPath: wx.env.USER_DATA_PATH,
        success: (res) => {
            const audioFiles = res.files.filter(f => f.endsWith('.wav')).sort();
            if (audioFiles.length > 50) {
                const toDelete = audioFiles.slice(0, audioFiles.length - 50);
                toDelete.forEach(f => {
                    fs.unlink({ filePath: `${wx.env.USER_DATA_PATH}/${f}` });
                });
            }
        }
    });
}

module.exports = {
    addWavHeader,
    saveToFile,
    cleanupOldFiles
};
