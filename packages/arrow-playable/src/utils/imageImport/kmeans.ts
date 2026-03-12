/**
 * KMeans 聚类 + 肘部法选 k - 对应 Python sklearn.cluster.KMeans 与 _find_elbow
 */

/** RGB 像素 [r,g,b] */
type Pixel = [number, number, number];

/** 随机种子：简单 LCG */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/**
 * 肘部法：在 inertia 曲线上找拐点（到首尾连线的最大垂直距离）
 */
function findElbow(ks: number[], inertias: number[]): number {
  const kRange = ks[ks.length - 1] - ks[0];
  const iRange = inertias[0] - inertias[inertias.length - 1];
  if (kRange === 0 || iRange <= 0) return ks[0];
  const ksN = ks.map((k) => (k - ks[0]) / kRange);
  const inN = inertias.map((i) => (i - inertias[inertias.length - 1]) / iRange);
  const p1x = ksN[0];
  const p1y = inN[0];
  const p2x = ksN[ksN.length - 1];
  const p2y = inN[inN.length - 1];
  const lx = p2x - p1x;
  const ly = p2y - p1y;
  const lineLen = Math.hypot(lx, ly);
  if (lineLen === 0) return ks[0];
  let maxDist = -1;
  let bestIdx = 0;
  for (let i = 0; i < ks.length; i++) {
    const crossVal = lx * (p1y - inN[i]) - ly * (p1x - ksN[i]);
    const dist = Math.abs(crossVal) / lineLen;
    if (dist > maxDist) {
      maxDist = dist;
      bestIdx = i;
    }
  }
  return ks[bestIdx];
}

function sqDist(a: Pixel, b: Pixel): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

/**
 * 单次 KMeans 拟合，返回 centers 和 inertia（到最近中心的距离和）
 */
function kmeansFit(
  pixels: Pixel[],
  k: number,
  random: () => number
): { centers: Pixel[]; labels: number[]; inertia: number } {
  const n = pixels.length;
  if (n === 0 || k <= 0) return { centers: [], labels: [], inertia: 0 };
  k = Math.min(k, n);
  const centers: Pixel[] = [];
  const indices = new Set<number>();
  while (indices.size < k) {
    indices.add(Math.floor(random() * n));
  }
  indices.forEach((i) => centers.push([...pixels[i]]));
  const labels = new Int32Array(n);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = sqDist(pixels[i], centers[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (labels[i] !== best) {
        labels[i] = best;
        changed = true;
      }
    }
    if (!changed) break;
    const sums: number[][] = [];
    const counts: number[] = [];
    for (let c = 0; c < k; c++) {
      sums.push([0, 0, 0]);
      counts.push(0);
    }
    for (let i = 0; i < n; i++) {
      const c = labels[i];
      counts[c]++;
      sums[c][0] += pixels[i][0];
      sums[c][1] += pixels[i][1];
      sums[c][2] += pixels[i][2];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        centers[c] = [
          Math.round(sums[c][0] / counts[c]),
          Math.round(sums[c][1] / counts[c]),
          Math.round(sums[c][2] / counts[c])
        ];
      }
    }
  }
  let inertia = 0;
  for (let i = 0; i < n; i++) {
    inertia += sqDist(pixels[i], centers[labels[i]]);
  }
  return { centers, labels: Array.from(labels), inertia };
}

const MAX_FIT_SAMPLES = 200_000;
const CENTER_PERCENTILE = 40;

/**
 * 自动聚类：肘部法选 k，返回所有像素的 label、中心 RGB、k
 */
export function autoClusterColors(
  allPixels: Pixel[],
  dtValues: number[] | null,
  maxK: number = 8
): { labels: number[]; centers: Pixel[]; k: number } {
  const n = allPixels.length;
  let centerPixels = allPixels;
  if (dtValues != null && dtValues.length === n) {
    const sorted = [...dtValues].sort((a, b) => a - b);
    const idx = Math.floor((CENTER_PERCENTILE / 100) * sorted.length);
    const dtThresh = Math.max(sorted[Math.max(0, idx)], 0.5);
    const filtered = allPixels.filter((_, i) => dtValues[i] >= dtThresh);
    if (filtered.length >= 200) centerPixels = filtered;
  }
  const nCenter = centerPixels.length;
  const actualMaxK = Math.min(maxK, nCenter - 1);
  if (actualMaxK < 2) {
    const labels = allPixels.map(() => 0);
    const c = centerPixels[0] || [0, 0, 0];
    return { labels, centers: [c], k: 1 };
  }
  const rng = seededRandom(0);
  const fitSample =
    nCenter <= MAX_FIT_SAMPLES
      ? centerPixels
      : shuffle([...centerPixels], rng).slice(0, MAX_FIT_SAMPLES);
  const ks: number[] = [];
  const inertias: number[] = [];
  const models: Map<number, { centers: Pixel[]; labels: number[] }> = new Map();
  for (let k = 2; k <= actualMaxK; k++) {
    const res = kmeansFit(fitSample, k, rng);
    ks.push(k);
    inertias.push(res.inertia);
    models.set(k, { centers: res.centers, labels: res.labels });
  }
  const bestK = ks.length >= 3 ? findElbow(ks, inertias) : ks[0];
  const model = models.get(bestK)!;
  const centers = model.centers.map((c) => [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])] as Pixel);
  const allLabels = allPixelsPredict(allPixels, centers);
  return { labels: allLabels, centers, k: bestK };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 固定 k 的 KMeans，用于用户指定颜色数
 */
export function kmeansFixedK(
  pixels: Pixel[],
  k: number,
  randomState: number = 0
): { labels: number[]; centers: Pixel[] } {
  const n = pixels.length;
  const sample = n <= MAX_FIT_SAMPLES ? pixels : shuffle([...pixels], seededRandom(randomState)).slice(0, MAX_FIT_SAMPLES);
  const res = kmeansFit(sample, k, seededRandom(randomState));
  const allLabels = allPixelsPredict(pixels, res.centers);
  const centers = res.centers.map((c) => [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])] as Pixel);
  return { labels: allLabels, centers };
}

function allPixelsPredict(pixels: Pixel[], centers: Pixel[]): number[] {
  return pixels.map((p) => {
    let best = 0;
    let bestD = Infinity;
    for (let c = 0; c < centers.length; c++) {
      const d = sqDist(p, centers[c]);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  });
}

export type { Pixel };
