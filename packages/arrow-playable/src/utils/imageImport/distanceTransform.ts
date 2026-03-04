/**
 * 欧氏距离变换 (EDT) - 对应 scipy.ndimage.distance_transform_edt
 * 使用 Felzenszwalb-Huttenlocher 1D 算法两次（先按行再按列）
 */

/**
 * 1D squared Euclidean distance transform.
 * f: input (e.g. 0 = foreground, inf = background). We use 0 for foreground, 1e20 for background.
 * Returns: d[i] = min_j ( (i-j)^2 + f[j] )
 * Implementation: parabolic lower envelope, O(n).
 */
function edt1d(f: Float64Array): Float64Array {
  const n = f.length;
  const d = new Float64Array(n);
  const v = new Uint32Array(n); // positions of parabolas
  const z = new Float64Array(n + 1); // boundaries
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;

  for (let q = 1; q < n; q++) {
    let denom = 2 * q - 2 * v[k];
    if (denom === 0) continue;
    let s = ((q * q + f[q]) - (v[k] * v[k] + f[v[k]])) / denom;
    while (k >= 0 && s <= z[k]) {
      k--;
      if (k < 0) break;
      denom = 2 * q - 2 * v[k];
      if (denom === 0) break;
      s = ((q * q + f[q]) - (v[k] * v[k] + f[v[k]])) / denom;
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }

  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const diff = q - v[k];
    d[q] = diff * diff + f[v[k]];
  }
  return d;
}

const INF = 1e20;

/**
 * 2D Euclidean distance transform (squared distances).
 * mask: 1 = foreground, 0 = background.
 * Returns Float64Array(w*h) of squared distances to nearest background (0) pixel.
 */
export function distanceTransformEDT(
  mask: Uint8Array,
  width: number,
  height: number
): Float64Array {
  // First pass: along each row. g[y*width+x] = squared distance to nearest 0 in same row.
  const g = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = new Float64Array(width);
    for (let x = 0; x < width; x++) {
      row[x] = mask[y * width + x] ? 0 : INF;
    }
    const rowOut = edt1d(row);
    for (let x = 0; x < width; x++) {
      g[y * width + x] = rowOut[x];
    }
  }

  // Second pass: along each column. g is updated to 2D squared EDT.
  const col = new Float64Array(height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      col[y] = g[y * width + x];
    }
    const res = edt1d(col);
    for (let y = 0; y < height; y++) {
      g[y * width + x] = res[y];
    }
  }

  // Convert squared distance to distance
  const out = new Float64Array(width * height);
  for (let i = 0; i < g.length; i++) {
    out[i] = Math.sqrt(g[i]);
  }
  return out;
}

/**
 * 获取 mask 为 1 的像素在 dt 中的值（用于线宽估计等）
 */
export function getDTValuesAtMask(dt: Float64Array, mask: Uint8Array): number[] {
  const vals: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) vals.push(dt[i]);
  }
  return vals;
}
