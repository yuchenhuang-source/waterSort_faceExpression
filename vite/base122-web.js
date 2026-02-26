// Provides functions for encoding/decoding data to and from base-122 for web browsers.

const kString = 0;
const kUint8Array = 1;
const kDefaultMimeType = "image/jpeg";
const kDebug = false;
const kIllegals = [
    0,  // null
    10, // newline
    13, // carriage return
    34, // double quote
    38, // ampersand
    92  // backslash
];
const kShortened = 0b111; // Uses the illegal index to signify the last two-byte char encodes <= 7 bits.

/**
 * Encodes raw data into base-122.
 * @param {Uint8Array|String} rawData - The data to be encoded
 * @returns {Array} The base-122 encoded data as a regular array of UTF-8 character byte values
 */
function encode(rawData) {
    let dataType = typeof(rawData) == 'string' ? kString : kUint8Array;
    let curIndex = 0;
    let curBit = 0;
    let outData = [];
    let getByte = i => rawData[i];

    if (dataType == kString) {
        getByte = (i) => {
            let val = rawData.codePointAt(i);
            if (val > 255) {
                throw "Unexpected code point at position: " + i + ". Expected value [0,255]. Got: " + val;
            }
            return val;
        }
    }

    // Get seven bits of input data. Returns false if there is no input left.
    function get7() {
        if (curIndex >= rawData.length) return false;
        let firstByte = getByte(curIndex);
        let firstPart = ((0b11111110 >>> curBit) & firstByte) << curBit;
        firstPart >>= 1;
        curBit += 7;
        if (curBit < 8) return firstPart;
        curBit -= 8;
        curIndex++;
        if (curIndex >= rawData.length) return firstPart;
        let secondByte = getByte(curIndex);
        let secondPart = ((0xFF00 >>> curBit) & secondByte) & 0xFF;
        secondPart >>= 8 - curBit;
        return firstPart | secondPart;
    }

    while(true) {
        let bits = get7();
        if (bits === false) break;

        let illegalIndex = kIllegals.indexOf(bits);
        if (illegalIndex != -1) {
            let nextBits = get7();
            let b1 = 0b11000010, b2 = 0b10000000;
            
            if (nextBits === false) {
                b1 |= (0b111 & kShortened) << 2;
                nextBits = bits;
            } else {
                b1 |= (0b111 & illegalIndex) << 2;
            }

            let firstBit = (nextBits & 0b01000000) > 0 ? 1 : 0;
            b1 |= firstBit;
            b2 |= nextBits & 0b00111111;
            outData.push(b1);
            outData.push(b2);
        } else {
            outData.push(bits);
        }
    }
    return outData;
}

/**
 * Re-encodes a base-64 encoded string into base-122.
 * @param {String} base64String - A base-64 encoded string
 * @returns {Array} - The base-122 encoded data
 */
function encodeFromBase64(base64String) {
    const binaryString = atob(base64String);
    return encode(binaryString);
}

/**
 * Decodes base-122 encoded data back to the original data.
 * @param {Uint8Array|String} base122Data - The data to be decoded
 * @returns {Array} The data in a regular array representing byte values
 */
function decode(base122Data) {
    let strData = typeof(base122Data) == 'string' ? base122Data : utf8DataToString(base122Data);
    let decoded = [];
    let curByte = 0;
    let bitOfByte = 0;

    function push7(byte) {
        byte <<= 1;
        curByte |= (byte >>> bitOfByte);
        bitOfByte += 7;
        if (bitOfByte >= 8) {
            decoded.push(curByte);
            bitOfByte -= 8;
            curByte = (byte << (7 - bitOfByte)) & 255;
        }
    }

    for (let i = 0; i < strData.length; i++) {
        let c = strData.charCodeAt(i);
        if (c > 127) {
            let illegalIndex = (c >>> 8) & 7;
            if (illegalIndex != kShortened) push7(kIllegals[illegalIndex]);
            push7(c & 127);
        } else {
            push7(c);
        }
    }
    return decoded;
}

/**
 * Converts a sequence of UTF-8 bytes to a string.
 * @param {Uint8Array} data - The UTF-8 data
 * @returns {String} A string with each character representing a code point
 */
function utf8DataToString(data) {
    return new TextDecoder().decode(data);
}

