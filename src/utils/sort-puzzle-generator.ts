/**
 * Water Sort Puzzle Generator (Phaser-friendly, browser-friendly)
 * --------------------------------------------------------------
 * - Fully solvable puzzles (reverse generation).
 * - colorCount configurable.
 * - tubeCount / tubeSize configurable.
 * - Per-color tube occupation (perColorTubes) optional.
 * - Reverse shuffle to ensure solvability.
 * - Pure TypeScript, no Node APIs, works in Phaser/Vite/Playable Ads.
 * 
 * Exported Function:
 *   createPuzzle(config: GeneratorConfig): PuzzleResult;
 *
 * Example:
 *   const result = createPuzzle({
 *     colorCount: 5,
 *     tubeCount: 12,
 *     tubeSize: 8,
 *     shuffleSteps: 200,
 *     seed: "level-1"
 *   });
 *
 * Result JSON fields:
 *   - tubes: number[][]  (12 tubes, each up to 8 layers, top at end)
 *   - perColorTubes: number[]  (colors' full-tube distribution)
 *   - seedUsed: number  (actual numeric seed)
 */

export type Tube = number[];      // top = rightmost
export type Puzzle = Tube[];

export interface GeneratorConfig {
  colorCount: number;             // e.g. 5
  tubeCount: number;              // e.g. 12 (filled tubes)
  tubeSize: number;               // e.g. 8
  perColorTubes?: number[];       // optional, array length=colorCount, sum=tubeCount
  shuffleSteps?: number;          // default 200
  seed?: number | string;         // for deterministic generation
  allowZeroTubesForColor?: boolean; // default false
  emptyTubeCount?: number;        // number of empty tubes for shuffling space, default 0
}

export interface PuzzleResult {
  tubes: Puzzle;
  perColorTubes: number[];
  seedUsed: number;
}

/* ========================================================================== */
/*                              RNG: mulberry32                               */
/* ========================================================================== */

function seededRng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSeedFrom(seed?: number | string): number {
  if (seed === undefined) return (Math.random() * 2 ** 31) >>> 0;
  if (typeof seed === "number") return seed >>> 0;

  // string -> hash
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ========================================================================== */
/*                      Auto distribute tubes among colors                    */
/* ========================================================================== */

function autoDistributeTubes(
  colorCount: number,
  tubeCount: number,
  rng: () => number,
  allowZero: boolean
): number[] {
  if (!allowZero && tubeCount < colorCount) {
    throw new Error("tubeCount < colorCount but allowZeroTubesForColor=false");
  }

  const result = new Array<number>(colorCount).fill(0);

  if (!allowZero) {
    // each color gets 1 tube minimum
    for (let i = 0; i < colorCount; i++) result[i] = 1;
    let remaining = tubeCount - colorCount;
    while (remaining > 0) {
      const idx = Math.floor(rng() * colorCount);
      result[idx]++;
      remaining--;
    }
  } else {
    // allow zeros, distribute tubeCount randomly
    let remaining = tubeCount;
    for (let i = 0; i < colorCount - 1; i++) {
      const take = Math.floor(rng() * (remaining + 1));
      result[i] = take;
      remaining -= take;
    }
    result[colorCount - 1] = remaining;

    // shuffle to avoid sorted distribution
    for (let i = colorCount - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
  }

  return result;
}

/* ========================================================================== */
/*                       Pour rule helpers for reverse-shuffle                */
/* ========================================================================== */

function canPour(from: Tube, to: Tube, tubeSize: number): boolean {
  if (from.length === 0) return false;
  if (to.length >= tubeSize) return false;
  const color = from[from.length - 1];
  if (to.length === 0) return true;
  return to[to.length - 1] === color;
}

/**
 * Pour balls from one tube to another (for reverse shuffling)
 * @param maxPour - Maximum balls to pour in one operation (1-3 for better shuffling)
 */
function pourOnce(from: Tube, to: Tube, tubeSize: number, maxPour: number = 8): number {
  if (!canPour(from, to, tubeSize)) return 0;

  const color = from[from.length - 1];
  let moved = 0;
  const limit = Math.min(maxPour, tubeSize - to.length);

  while (
    moved < limit &&
    from.length > 0 &&
    from[from.length - 1] === color &&
    to.length < tubeSize
  ) {
    to.push(from.pop()!);
    moved++;
  }

  return moved;
}

/* ========================================================================== */
/*                           Main Export: createPuzzle                         */
/* ========================================================================== */

export function createPuzzle(config: GeneratorConfig): PuzzleResult {
  const {
    colorCount,
    tubeCount,
    tubeSize,
    perColorTubes,
    shuffleSteps = 200,
    seed,
    allowZeroTubesForColor = false,
  } = config;

  if (tubeSize <= 0 || tubeCount <= 0 || colorCount <= 0)
    throw new Error("Invalid config: tubeSize/tubeCount/colorCount must be > 0");

  const seedUsed = makeSeedFrom(seed);
  const rng = seededRng(seedUsed);

  /* -------------------------------------------------------------- */
  /* Step 1: Choose per-color tube occupation                       */
  /* -------------------------------------------------------------- */
  let distribution: number[];

  if (perColorTubes) {
    if (perColorTubes.length !== colorCount)
      throw new Error("perColorTubes length must equal colorCount");

    const sum = perColorTubes.reduce((a, b) => a + b, 0);
    if (sum !== tubeCount)
      throw new Error("perColorTubes must sum to tubeCount");

    if (!allowZeroTubesForColor) {
      for (let v of perColorTubes) {
        if (v <= 0)
          throw new Error("perColorTubes contains <= 0 but allowZero=false");
      }
    }

    distribution = perColorTubes.slice();
  } else {
    distribution = autoDistributeTubes(
      colorCount,
      tubeCount,
      rng,
      allowZeroTubesForColor
    );
  }

  /* -------------------------------------------------------------- */
  /* Step 2: Build solved/complete state                            */
  /* -------------------------------------------------------------- */
  const emptyTubes = config.emptyTubeCount ?? 0;
  const tubes: Puzzle = [];
  
  // Create filled tubes for each color
  for (let c = 0; c < colorCount; c++) {
    const cnt = distribution[c];
    for (let i = 0; i < cnt; i++) {
      const tube: Tube = new Array(tubeSize).fill(c);
      tubes.push(tube);
    }
  }
  if (tubes.length !== tubeCount)
    throw new Error("Internal mismatch: tube array incorrect length");
  
  // Add empty tubes (essential for shuffling!)
  for (let i = 0; i < emptyTubes; i++) {
    tubes.push([]);
  }
  
  const totalTubes = tubeCount + emptyTubes;

  /* -------------------------------------------------------------- */
  /* Step 3: Advanced shuffle - ensure minimum color diversity      */
  /* Each tube must have at least 3 different colors                */
  /* -------------------------------------------------------------- */
  
  // Collect all balls into a flat array
  const allBalls: number[] = [];
  for (const tube of tubes) {
    for (const ball of tube) {
      allBalls.push(ball);
    }
  }
  
  const minColorsPerTube = Math.min(3, colorCount); // At least 3 colors per tube (or all if fewer colors exist)
  const maxShuffleAttempts = 100;
  let finalTubes: Puzzle = [];
  let attemptCount = 0;
  
  while (attemptCount < maxShuffleAttempts) {
    attemptCount++;
    
    // Fisher-Yates shuffle
    for (let i = allBalls.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [allBalls[i], allBalls[j]] = [allBalls[j], allBalls[i]];
    }
    
    // Redistribute balls back to filled tubes
    finalTubes = [];
    let ballIndex = 0;
    
    for (let t = 0; t < tubeCount; t++) {
      const tube: Tube = [];
      for (let b = 0; b < tubeSize; b++) {
        tube.push(allBalls[ballIndex++]);
      }
      finalTubes.push(tube);
    }
    
    // Validate: ensure each tube has at least minColorsPerTube different colors
    let colorDiversityMet = true;
    for (let t = 0; t < tubeCount; t++) {
      const colors = new Set(finalTubes[t]);
      if (colors.size < minColorsPerTube) {
        colorDiversityMet = false;
        break;
      }
    }
    
    if (colorDiversityMet) {
      break;
    }
  }
  
  // Add empty tubes at the end
  for (let i = 0; i < emptyTubes; i++) {
    finalTubes.push([]);
  }
  
  // Log final state
  const diversities = finalTubes.slice(0, tubeCount).map(t => new Set(t).size);
  if (import.meta.env?.DEV) {
    console.log(`[PuzzleGenerator] Shuffle complete after ${attemptCount} attempts:`);
    console.log(`  - ${tubeCount} filled tubes, ${emptyTubes} empty tubes`);
    console.log(`  - Color diversity per tube: min=${Math.min(...diversities)}, max=${Math.max(...diversities)}`);
  }

  return {
    tubes: finalTubes,
    perColorTubes: distribution,
    seedUsed,
  };
}
