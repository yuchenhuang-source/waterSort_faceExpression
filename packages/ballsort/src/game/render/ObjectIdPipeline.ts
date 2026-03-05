/**
 * Color-coded ID rendering for CV detection.
 *
 * Each capture frame uses randomly generated colors (to avoid encoding fragility).
 * The color→ID mapping is sent alongside the frame to the CV server,
 * which does nearest-color matching rather than formula decoding.
 *
 * ID ranges (unchanged):
 *   Tubes:    0 ~ N-1
 *   Balls:    100 + tubeId*10 + slotIndex
 *   Hand:     200
 *   Icon:     201
 *   Download: 202
 */

/** Hex color string (rrggbb lowercase) → object ID */
export type ColorMap = Record<string, number>;

function colorDistanceSq(
    r1: number, g1: number, b1: number,
    r2: number, g2: number, b2: number,
): number {
    return (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
}

function toHex(r: number, g: number, b: number): string {
    return r.toString(16).padStart(2, '0') +
           g.toString(16).padStart(2, '0') +
           b.toString(16).padStart(2, '0');
}

/**
 * Generate a random color map for the given object IDs.
 * Colors are bright, mutually distinct (min Euclidean distance 40),
 * and guaranteed not near-white (background).
 *
 * Returns:
 *   colorMap  – hex→id lookup to send to the CV server
 *   idToColor – id→Phaser-integer-color for applying to game objects
 */
export function generateColorMap(objectIds: number[]): {
    colorMap: ColorMap;
    idToColor: Map<number, number>;
} {
    const MIN_DIST_SQ = 40 ** 2;   // minimum Euclidean distance² between any two colors
    const WHITE_THRESH = 215;       // avoid R,G,B all > this (near-white background)

    const colorMap: ColorMap = {};
    const idToColor = new Map<number, number>();
    const usedRGB: Array<[number, number, number]> = [];

    for (const id of objectIds) {
        let r = 0, g = 0, b = 0;
        let found = false;

        for (let attempt = 0; attempt < 600 && !found; attempt++) {
            // Sample in [40, 220] to stay away from very dark and very bright
            r = Math.floor(Math.random() * 181) + 40;
            g = Math.floor(Math.random() * 181) + 40;
            b = Math.floor(Math.random() * 181) + 40;

            // Skip near-white
            if (r > WHITE_THRESH && g > WHITE_THRESH && b > WHITE_THRESH) continue;

            // Must be far enough from every already-chosen color
            let ok = true;
            for (const [ur, ug, ub] of usedRGB) {
                if (colorDistanceSq(r, g, b, ur, ug, ub) < MIN_DIST_SQ) {
                    ok = false;
                    break;
                }
            }
            if (ok) found = true;
        }

        if (!found) {
            // Deterministic fallback: spread using index-based hash
            const i = usedRGB.length;
            r = ((i * 37 + 50) % 181) + 40;
            g = ((i * 71 + 90) % 181) + 40;
            b = ((i * 113 + 130) % 181) + 40;
        }

        usedRGB.push([r, g, b]);
        colorMap[toHex(r, g, b)] = id;
        idToColor.set(id, (r << 16) | (g << 8) | b);
    }

    return { colorMap, idToColor };
}

// Legacy helpers kept for other modules that may reference them
export function encodeIdToColor(id: number): number {
    return id & 0xffffff;
}

export function decodeColorToId(r: number, g: number, b: number): number {
    return (r << 16) | (g << 8) | b;
}
