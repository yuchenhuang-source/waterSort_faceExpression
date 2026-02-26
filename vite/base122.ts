import { encode, decode } from './base.js';
import { gunzipSync, gzipSync } from 'zlib';
import { brotliCompressSync, brotliDecompressSync, constants } from 'zlib';

/**
 * 将base64字符串转换为gzip压缩后的base122编码
 * @param base64Str - 原始base64字符串
 * @returns base122编码的字符串
 */
export function base64ToGzippedBase122(base64Str: string): string {
    // 1. 将base64转换为Buffer
    const buffer = Buffer.from(base64Str, 'base64');
    
    // 2. 使用gzip压缩Buffer
    // const gzipped = gzipSync(buffer, { level: 3 });
    
    // 3. 将压缩后的数据转换为base122编码
    const base122Encoded = encode(buffer);
    
    // 4. 将编码结果转换为字符串
    return String.fromCharCode(...base122Encoded);
}

/**
 * 解码gzip压缩的base122字符串
 * @param base122Str - base122编码的字符串
 * @returns 原始的base64字符串
 */
export function decodeGzippedBase122ToBase64(base122Str: string): string {
    // 1. Convert string to Uint8Array for decoding
    const base122Bytes = new Uint8Array(base122Str.split('').map(char => char.charCodeAt(0)));
    
    // 2. Decode base122
    const decoded = decode(base122Bytes);
    
    // 3. Decompress gzip
    const unzipped = gunzipSync(Buffer.from(decoded));
    
    // 4. Convert back to base64
    return unzipped.toString('base64');
}



/**
 * 将base64字符串转换为brotli压缩后的base122编码
 * @param base64Str - 原始base64字符串
 * @returns base122编码的字符串
 */
export function base64ToBrotliBase122(base64Str: string): string {
    // 1. 将base64转换为Buffer
    const buffer = Buffer.from(base64Str, 'base64');
    
    // 2. 使用brotli压缩Buffer
    const compressed = brotliCompressSync(buffer, {
        params: {
            [constants.BROTLI_PARAM_QUALITY]: 11,  // 压缩质量 0-11，使用最高压缩率
            [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_GENERIC,  // 通用模式以获得最佳压缩
            [constants.BROTLI_PARAM_SIZE_HINT]: buffer.length,  // 提供大小提示以优化压缩
        }
    });
    // 3. 将压缩后的数据转换为base122编码
    const base122Encoded = encode(compressed);
    
    // 4. 将编码结果转换为字符串
    return String.fromCharCode(...base122Encoded);
}

/**
 * 解码brotli压缩的base122字符串
 * @param base122Str - base122编码的字符串
 * @returns 原始的base64字符串
 */
export function decodeBrotliBase122ToBase64(base122Str: string): string {
    // 1. Convert string to Uint8Array for decoding
    const base122Bytes = new Uint8Array(base122Str.split('').map(char => char.charCodeAt(0)));
    
    // 2. Decode base122
    const decoded = decode(base122Bytes);
    
    // 3. Decompress brotli
    const decompressed = brotliDecompressSync(Buffer.from(decoded));
    
    // 4. Convert back to base64
    return decompressed.toString('base64');
}