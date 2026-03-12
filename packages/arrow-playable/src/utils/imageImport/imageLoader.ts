/**
 * 从 File/Blob 加载 RGBA 图像数据（对应 Python load_image）
 */

import type { ImageDataRGBA } from './types';

/**
 * 将图片文件解码为 RGBA 像素数组
 */
export function loadImageFromFile(file: File): Promise<ImageDataRGBA> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2d not available'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      resolve({
        data: imageData.data,
        width: canvas.width,
        height: canvas.height
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image load failed'));
    };
    img.src = url;
  });
}

/**
 * 索引： (y * width + x) * 4 + channel, channel 0=R,1=G,2=B,3=A
 */
export function getPixel(data: Uint8ClampedArray, width: number, height: number, x: number, y: number): [number, number, number, number] {
  if (x < 0 || x >= width || y < 0 || y >= height) return [0, 0, 0, 0];
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

export function getAlpha(data: Uint8ClampedArray, width: number, height: number, x: number, y: number): number {
  if (x < 0 || x >= width || y < 0 || y >= height) return 0;
  return data[(y * width + x) * 4 + 3];
}
