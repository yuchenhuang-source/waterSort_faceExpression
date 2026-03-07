/**
 * Color-coded ID rendering for CV detection.
 *
 * Colors are drawn from a structured per-channel quantization grid.
 * Any GPU-blended pixel lands between grid points and is rejected by the
 * per-channel tolerance check, eliminating edge-blending contamination.
 *
 * Grid: 6 values per channel, step = 34, starting at 40.
 * Provides 216 distinct colors — sufficient for any game with < 216 objects.
 *
 * ID ranges (unchanged):
 *   Tubes:    0 ~ N-1
 *   Balls:    100 + tubeId*10 + slotIndex
 *   Hand:     500
 *   Icon:     501
 *   Download: 502
 */

/** Hex color string (rrggbb lowercase) → object ID */
export type ColorMap = Record<string, number>;

// ── Grid constants (exported for use by pixel extractor and tests) ─────────────
/** Quantized channel values. step = COLOR_GRID_STEP between adjacent entries. */
export const COLOR_GRID_VALS: readonly number[] = [40, 74, 108, 142, 176, 210];
/** Distance between adjacent grid values. */
export const COLOR_GRID_STEP = 34;
/**
 * Per-channel snap tolerance.
 * A pixel channel must be within this many units of a grid value to be accepted.
 * Set to 6 so that cutoff alpha = 6/34 ≈ 17.6%:
 * any blend > 17.6% in any changing channel is rejected.
 * The contaminated region [0.20, 0.80] has zero slip-through.
 */
export const COLOR_GRID_TOL = 1;
/** Near-white rejection: skip colors where ALL channels exceed this. */
const WHITE_THRESH = 215;
/** Euclidean distance² threshold for initial nearest-color snap. */
const MAX_DIST_SQ = 20 * 20;

// ── Pre-built ordered list of all valid grid colors ──────────────────────────
/** All (r,g,b) grid combinations, near-white excluded, in deterministic order. */
const GRID_COLORS: ReadonlyArray<readonly [number, number, number]> = (() => {
    const out: [number, number, number][] = [];
    for (const r of COLOR_GRID_VALS) {
        for (const g of COLOR_GRID_VALS) {
            for (const b of COLOR_GRID_VALS) {
                if (!(r > WHITE_THRESH && g > WHITE_THRESH && b > WHITE_THRESH)) {
                    out.push([r, g, b]);
                }
            }
        }
    }
    return out;
})();

function toHex(r: number, g: number, b: number): string {
    return r.toString(16).padStart(2, '0') +
           g.toString(16).padStart(2, '0') +
           b.toString(16).padStart(2, '0');
}

/**
 * Generate a deterministic color map for the given object IDs.
 * Each ID is assigned the next unused grid color in order.
 * Throws if more IDs are requested than grid colors available (216 max).
 *
 * Returns:
 *   colorMap  – hex→id lookup to send to the CV server
 *   idToColor – id→Phaser-integer-color for applying to game objects
 */
export function generateColorMap(objectIds: number[]): {
    colorMap: ColorMap;
    idToColor: Map<number, number>;
} {
    if (objectIds.length > GRID_COLORS.length) {
        throw new Error(
            `generateColorMap: requested ${objectIds.length} colors but only ${GRID_COLORS.length} grid colors available`,
        );
    }

    const colorMap: ColorMap = {};
    const idToColor = new Map<number, number>();

    objectIds.forEach((id, idx) => {
        const [r, g, b] = GRID_COLORS[idx];
        colorMap[toHex(r, g, b)] = id;
        idToColor.set(id, (r << 16) | (g << 8) | b);
    });

    return { colorMap, idToColor };
}

/** Options for extractValidPixels */
export interface ExtractValidPixelsOptions {
    /** When true, relax blend rejection so edge/blended pixels are kept. Default: false. */
    keepBlendedPixels?: boolean;
}

/**
 * Extract valid (non-blended) pixels from a rendered CV canvas.
 *
 * Generic — no Phaser dependency. Can be used by any game that renders
 * object IDs as flat colors onto a transparent-background canvas.
 *
 * Pipeline:
 *   1. Downsample canvas with nearest-neighbor (no interpolation blending).
 *   2. Skip pixels with alpha < 200 (transparent/semi-transparent edges).
 *   3. Find nearest color in colorMap by Euclidean distance.
 *   4. Reject if nearest distance² > MAX_DIST_SQ (20²).
 *   5. Reject if any channel deviates > COLOR_GRID_TOL from the snapped value
 *      (catches GPU-blended edge pixels that slip past the distance check).
 *   6. 4-neighbor consistency check: reject pixels with fewer than 2 matching
 *      orthogonal neighbors. Out-of-bounds neighbors are skipped. Blended
 *      boundary pixels typically have 0–1 matches and are discarded.
 *
 * When keepBlendedPixels is true: relax alpha (128), per-channel tol (17), skip neighbor check.
 *
 * @param canvas    The game's WebGL canvas after ID-color rendering.
 * @param colorMap  Hex→id mapping produced by generateColorMap().
 * @param downsample  Downscale factor (default 4). Nearest-neighbor only.
 * @param options   Optional. keepBlendedPixels: true to retain blended edge pixels.
 * @returns Base64-encoded packed pixel data.
 */
export function extractValidPixels(
    canvas: HTMLCanvasElement,
    colorMap: ColorMap,
    downsample = 4,
    options?: ExtractValidPixelsOptions,
): string {
    const keepBlended = options?.keepBlendedPixels ?? false;
    const alphaMin = keepBlended ? 128 : 200;
    const channelTol = keepBlended ? Math.ceil(COLOR_GRID_STEP / 2) : COLOR_GRID_TOL; // 17 vs 1

    const w = Math.round(canvas.width / downsample);
    const h = Math.round(canvas.height / downsample);

    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, 0, 0, w, h);

    const imageData = ctx.getImageData(0, 0, w, h).data;

    // Build flat snap lookup from colorMap
    const hexKeys = Object.keys(colorMap);
    const snapR = new Uint8Array(hexKeys.length);
    const snapG = new Uint8Array(hexKeys.length);
    const snapB = new Uint8Array(hexKeys.length);
    for (let k = 0; k < hexKeys.length; k++) {
        const hex = hexKeys[k];
        snapR[k] = parseInt(hex.slice(0, 2), 16);
        snapG[k] = parseInt(hex.slice(2, 4), 16);
        snapB[k] = parseInt(hex.slice(4, 6), 16);
    }
    const snapLen = hexKeys.length;

    // Pass 1: snap every pixel → record color index in snapIdx (-1 = rejected).
    // Use Int16Array so -1 fits and indices up to 32767 are supported.
    const snapIdx = new Int16Array(w * h).fill(-1);

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;

            // Skip transparent / semi-transparent edge pixels
            if (imageData[i + 3] < alphaMin) continue;

            const pr = imageData[i];
            const pg = imageData[i + 1];
            const pb = imageData[i + 2];

            // Find nearest grid color
            let bestDist = Infinity;
            let si = 0;
            for (let k = 0; k < snapLen; k++) {
                const dr = pr - snapR[k];
                const dg = pg - snapG[k];
                const db = pb - snapB[k];
                const d = dr * dr + dg * dg + db * db;
                if (d < bestDist) { bestDist = d; si = k; }
            }

            // Reject if too far from every known color (boundary artifact)
            if (bestDist > MAX_DIST_SQ) continue;

            // Per-channel grid validity check:
            // GPU-blended pixels land between grid points, so at least one channel
            // will exceed channelTol even if Euclidean distance passes.
            if (Math.abs(pr - snapR[si]) > channelTol ||
                Math.abs(pg - snapG[si]) > channelTol ||
                Math.abs(pb - snapB[si]) > channelTol) continue;

            snapIdx[y * w + x] = si;
        }
    }

    // Pass 2: 4-neighbor consistency check (relaxed).
    // Accept if at least 2 orthogonal neighbors share the same snap index.
    // Out-of-bounds neighbors are not counted. Blended boundary pixels
    // typically have 0–1 matching neighbors and are discarded.
    const packedBuf = new Uint8Array(w * h * 7);
    let pixelCount = 0;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const si = snapIdx[y * w + x];
            if (si < 0) continue;

            // 4-neighbor consistency: skip when keepBlendedPixels is false
            if (!keepBlended) {
                let matchCount = 0;
                if (y > 0 && snapIdx[(y - 1) * w + x] === si) matchCount++;
                if (y < h - 1 && snapIdx[(y + 1) * w + x] === si) matchCount++;
                if (x > 0 && snapIdx[y * w + (x - 1)] === si) matchCount++;
                if (x < w - 1 && snapIdx[y * w + (x + 1)] === si) matchCount++;
                if (matchCount < 2) continue;
            }

            const o = pixelCount * 7;
            packedBuf[o]     = x & 0xff;
            packedBuf[o + 1] = (x >> 8) & 0xff;
            packedBuf[o + 2] = y & 0xff;
            packedBuf[o + 3] = (y >> 8) & 0xff;
            packedBuf[o + 4] = snapR[si];
            packedBuf[o + 5] = snapG[si];
            packedBuf[o + 6] = snapB[si];
            pixelCount++;
        }
    }

    const packed = packedBuf.subarray(0, pixelCount * 7);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < packed.length; i += chunkSize) {
        binary += String.fromCharCode(...packed.subarray(i, Math.min(i + chunkSize, packed.length)));
    }
    return btoa(binary);
}

// Legacy helpers kept for other modules that may reference them
export function encodeIdToColor(id: number): number {
    return id & 0xffffff;
}

export function decodeColorToId(r: number, g: number, b: number): number {
    return (r << 16) | (g << 8) | b;
}
