/**
 * Zhang-Suen 骨架化 - 对应 Python zhang_suen_thinning
 * 输出 1 像素宽骨架
 */

/**
 * 在 padded (h+2)*(w+2) 上取 (i,j) 的 8 邻域，越界为 0
 */
function getNeighbors(padded: Uint8Array, w: number, h: number, i: number, j: number): number[] {
  const W = w + 2;
  const idx = (y: number, x: number) => {
    if (y < 0 || y >= h + 2 || x < 0 || x >= W) return 0;
    return padded[y * W + x];
  };
  const P2 = idx(i + 1, j);
  const P3 = idx(i + 1, j + 1);
  const P4 = idx(i, j + 1);
  const P5 = idx(i - 1, j + 1);
  const P6 = idx(i - 1, j);
  const P7 = idx(i - 1, j - 1);
  const P8 = idx(i, j - 1);
  const P9 = idx(i + 1, j - 1);
  return [P2, P3, P4, P5, P6, P7, P8, P9];
}

/**
 * Zhang-Suen 细化：img 为 0/1，返回骨架 (0/1)
 */
export function zhangSuenThinning(mask: Uint8Array, width: number, height: number): Uint8Array {
  const W = width + 2;
  const H = height + 2;
  const padded = new Uint8Array(W * H);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      padded[(y + 1) * W + (x + 1)] = mask[y * width + x] ? 1 : 0;
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const step of [0, 1]) {
      const toRemove: number[] = [];
      for (let i = 1; i <= height; i++) {
        for (let j = 1; j <= width; j++) {
          const pos = i * W + j;
          if (padded[pos] === 0) continue;
          const [P2, P3, P4, P5, P6, P7, P8, P9] = getNeighbors(padded, width, height, i, j);
          const neighbors = P2 + P3 + P4 + P5 + P6 + P7 + P8 + P9;
          let A = 0;
          if (P2 === 0 && P3 === 1) A++;
          if (P3 === 0 && P4 === 1) A++;
          if (P4 === 0 && P5 === 1) A++;
          if (P5 === 0 && P6 === 1) A++;
          if (P6 === 0 && P7 === 1) A++;
          if (P7 === 0 && P8 === 1) A++;
          if (P8 === 0 && P9 === 1) A++;
          if (P9 === 0 && P2 === 1) A++;
          const m1 = step === 0 ? P2 * P4 * P6 : P2 * P4 * P8;
          const m2 = step === 0 ? P4 * P6 * P8 : P2 * P6 * P8;
          if (neighbors >= 2 && neighbors <= 6 && A === 1 && m1 === 0 && m2 === 0) {
            toRemove.push(pos);
          }
        }
      }
      for (const pos of toRemove) {
        padded[pos] = 0;
        changed = true;
      }
    }
  }
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      out[y * width + x] = padded[(y + 1) * W + (x + 1)] ? 1 : 0;
    }
  }
  return out;
}
