/**
 * 掩码预处理：alpha 掩码、暗边过滤、形态学闭运算（对应 Python filter_dark_borders, preprocess_mask）
 */

const LUMINANCE_R = 0.299;
const LUMINANCE_G = 0.587;
const LUMINANCE_B = 0.114;

/**
 * 从 RGBA 生成 alpha 掩码（alpha >= threshold）
 * mask 为 Uint8Array(w*h)，1=笔画，0=背景
 */
export function alphaMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold: number
): Uint8Array {
  const n = width * height;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3];
    mask[i] = a >= alphaThreshold ? 1 : 0;
  }
  return mask;
}

/**
 * 过滤近黑描边像素：亮度 < brightnessThresh 的像素从 mask 中移除
 */
export function filterDarkBorders(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  mask: Uint8Array,
  brightnessThresh: number
): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (mask[i] === 0) continue;
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const luminance = LUMINANCE_R * r + LUMINANCE_G * g + LUMINANCE_B * b;
      if (luminance >= brightnessThresh) out[i] = 1;
    }
  }
  return out;
}

/**
 * 圆盘结构元： (dx,dy) 满足 dx^2+dy^2 <= r^2
 */
function diskOffsets(radius: number): Array<[number, number]> {
  const off: Array<[number, number]> = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radius * radius) off.push([dy, dx]);
    }
  }
  return off;
}

/**
 * 形态学膨胀：output[y,x] = max{ mask[y+dy, x+dx] } for (dy,dx) in struct
 */
function binaryDilate(
  mask: Uint8Array,
  width: number,
  height: number,
  struct: Array<[number, number]>
): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let maxVal = 0;
      for (const [dy, dx] of struct) {
        const ny = y + dy;
        const nx = x + dx;
        if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
          if (mask[ny * width + nx]) maxVal = 1;
        }
      }
      out[y * width + x] = maxVal;
    }
  }
  return out;
}

/**
 * 形态学腐蚀：output[y,x]=1 仅当以 (y,x) 为中心放置结构元时，所有覆盖点均为 1（越界视为 0）
 */
function binaryErode(
  mask: Uint8Array,
  width: number,
  height: number,
  struct: Array<[number, number]>
): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let allOne = true;
      for (const [dy, dx] of struct) {
        const ny = y + dy;
        const nx = x + dx;
        if (ny < 0 || ny >= height || nx < 0 || nx >= width || !mask[ny * width + nx]) {
          allOne = false;
          break;
        }
      }
      out[y * width + x] = allOne ? 1 : 0;
    }
  }
  return out;
}

/**
 * 形态学闭运算：先膨胀后腐蚀，填充小孔
 */
export function preprocessMask(
  mask: Uint8Array,
  width: number,
  height: number,
  closeRadius: number
): Uint8Array {
  if (closeRadius <= 0) return mask;
  const struct = diskOffsets(closeRadius);
  const dilated = binaryDilate(mask, width, height, struct);
  return binaryErode(dilated, width, height, struct);
}

/** 统计 mask 中 1 的个数 */
export function maskSum(mask: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < mask.length; i++) s += mask[i];
  return s;
}
