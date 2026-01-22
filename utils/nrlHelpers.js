/**
 * nrlHelpers.js - Shared utilities for NRL Link Mini Program
 */

/**
 * Decodes a Uint8Array into a UTF-8 string.
 */
function decodeUint8ArrayToText(data) {
    if (!data || !data.length) return '';
    try {
        let text = '';
        let i = 0;
        let uint8Array = new Uint8Array(data);
        // Find the first null byte (0x00) and truncate
        const nullIndex = uint8Array.indexOf(0);
        if (nullIndex !== -1) {
            uint8Array = uint8Array.slice(0, nullIndex);
        }
        while (i < uint8Array.length) {
            const byte1 = uint8Array[i++];
            if (byte1 < 0x80) text += String.fromCharCode(byte1);
            else if (byte1 >= 0xC0 && byte1 < 0xE0) {
                const byte2 = uint8Array[i++];
                text += String.fromCharCode(((byte1 & 0x1F) << 6) | (byte2 & 0x3F));
            } else if (byte1 >= 0xE0 && byte1 < 0xF0) {
                const byte2 = uint8Array[i++];
                const byte3 = uint8Array[i++];
                text += String.fromCharCode(((byte1 & 0x0F) << 12) | ((byte2 & 0x3F) << 6) | (byte3 & 0x3F));
            } else if (byte1 >= 0xF0) {
                const byte2 = uint8Array[i++];
                const byte3 = uint8Array[i++];
                const byte4 = uint8Array[i++];
                const codePoint = ((byte1 & 0x07) << 18) | ((byte2 & 0x3F) << 12) | ((byte3 & 0x3F) << 6) | (byte4 & 0x3F);
                text += String.fromCodePoint(codePoint);
            }
        }
        return text;
    } catch (e) {
        console.error('Failed to decode Uint8Array:', e);
        return '';
    }
}

/**
 * Encodes a string into a Uint8Array (UTF-8).
 */
function encodeTextToUint8Array(text) {
    const codePoints = [];
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code <= 0x7F) codePoints.push(code);
        else if (code <= 0x7FF) {
            codePoints.push(0xC0 | (code >> 6));
            codePoints.push(0x80 | (code & 0x3F));
        } else if (code <= 0xFFFF) {
            codePoints.push(0xE0 | (code >> 12));
            codePoints.push(0x80 | ((code >> 6) & 0x3F));
            codePoints.push(0x80 | (code & 0x3F));
        } else {
            codePoints.push(0xF0 | (code >> 18));
            codePoints.push(0x80 | ((code >> 12) & 0x3F));
            codePoints.push(0x80 | ((code >> 6) & 0x3F));
            codePoints.push(0x80 | (code & 0x3F));
        }
    }
    return new Uint8Array(codePoints);
}

/**
 * Formats duration in milliseconds to m:ss.
 */
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
}

/**
 * Formats timestamp to HH:mm.
 */
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return `${date.getHours()}:${date.getMinutes() < 10 ? '0' : ''}${date.getMinutes()}`;
}

/**
 * Formats timestamp to HH:mm:ss.
 */
function formatLastVoiceTime(isoString) {
    const date = new Date(isoString);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

module.exports = {
    decodeUint8ArrayToText,
    encodeTextToUint8Array,
    formatDuration,
    formatTime,
    formatLastVoiceTime
};
