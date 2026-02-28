import React, { useEffect, useState } from 'react';
import { BallColor } from '../game/constants/GameConstants';
import { generatePuzzleWithAdapter } from '../utils/puzzle-adapter';
import { getCachedPuzzle, waitForPregenerate } from '../utils/puzzleCache';
import { getLiquidColors, getOutputConfigValueAsync } from '../utils/outputConfigLoader';
import tubeBodyImg from '../assets/试管-管身.png';
import tubeMouthImg from '../assets/试管-管口.png';
import tubeMaskImg from '../assets/tube_mask.png';
import liquidSurfaceImg from '../assets/liquid/surface.png';
import './LevelPreview.css';

function hexToCss(hex: number): string {
  return '#' + hex.toString(16).padStart(6, '0');
}

/** Lighten color for surface highlight (matches game's lightenColor) */
function lightenHex(hex: number, ratio: number): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const nr = Math.min(255, Math.round(r + (255 - r) * ratio));
  const ng = Math.min(255, Math.round(g + (255 - g) * ratio));
  const nb = Math.min(255, Math.round(b + (255 - b) * ratio));
  return '#' + ((nr << 16) | (ng << 8) | nb).toString(16).padStart(6, '0');
}

/** Merge consecutive same-color balls into liquid blocks (matches game's drawLiquidBlocksTo) */
function tubeToLiquidBlocks(tube: BallColor[]): { color: BallColor; count: number }[] {
  if (tube.length === 0) return [];
  const blocks: { color: BallColor; count: number }[] = [];
  let currentColor = tube[0];
  let count = 1;
  for (let i = 1; i < tube.length; i++) {
    if (tube[i] === currentColor) count++;
    else {
      blocks.push({ color: currentColor, count });
      currentColor = tube[i];
      count = 1;
    }
  }
  blocks.push({ color: currentColor, count });
  return blocks;
}

interface LevelPreviewProps {
  difficulty: number;
  /** Max tubes to show in preview (default 5) */
  maxTubes?: number;
}

/** Renders tubes with liquid blocks - identical look to in-game levels */
interface LevelPreviewConfig {
  scale?: number;
  translateX?: number;
  translateY?: number;
}

const LevelPreview: React.FC<LevelPreviewProps> = ({ difficulty, maxTubes = 5 }) => {
  const [previewData, setPreviewData] = useState<{
    tubes: { color: BallColor; count: number }[][];
    liquidColors: { [key in BallColor]: number };
    previewConfig: LevelPreviewConfig;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    waitForPregenerate()
      .then(async () => {
        if (cancelled) return;
        const emptyTubeCount = Math.max(1, Math.min(6, await getOutputConfigValueAsync<number>('emptyTubeCount', 2)));
        const cached = getCachedPuzzle(difficulty, emptyTubeCount);
        const liquidColors = getLiquidColors();
        const previewConfig: LevelPreviewConfig = (await getOutputConfigValueAsync<LevelPreviewConfig>('levelPreview')) ?? { scale: 1, translateX: 0, translateY: 0 };
        let tubes: { color: BallColor; count: number }[][];
        if (cached?.puzzle?.tubes) {
          tubes = cached.puzzle.tubes.slice(0, maxTubes).map(tubeToLiquidBlocks);
        } else {
          const result = generatePuzzleWithAdapter({ difficulty, emptyTubeCount });
          tubes = result.tubes.slice(0, maxTubes).map(tubeToLiquidBlocks);
        }
        if (!cancelled) setPreviewData({ tubes, liquidColors, previewConfig });
      })
      .catch(() => {
        if (!cancelled) setPreviewData(null);
      });
    return () => { cancelled = true; };
  }, [difficulty, maxTubes]);

  if (!previewData || previewData.tubes.length === 0) return null;

  const { tubes, liquidColors, previewConfig } = previewData;
  const scale = previewConfig.scale ?? 1;
  const tx = previewConfig.translateX ?? 0;
  const ty = previewConfig.translateY ?? 0;

  return (
    <div className="level-preview level-image">
      <div
        className="level-preview-inner"
        style={{
          transform: `translate(${tx}%, ${ty}%) scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
      {tubes.map((blocks, ti) => (
        <div key={ti} className="level-preview-tube">
          {/* Tube mouth (back layer) */}
          <img src={tubeMouthImg} alt="" className="level-preview-tube-mouth" />
          {/* Liquid layer - masked by tube shape */}
          <div className="level-preview-liquid" style={{ maskImage: `url(${tubeMaskImg})`, WebkitMaskImage: `url(${tubeMaskImg})` }}>
            <div className="level-preview-liquid-blocks">
              {blocks.map((block, bi) => {
                const colorHex = liquidColors[block.color] ?? 0x888888;
                const surfaceColor = lightenHex(colorHex, 0.5);
                return (
                  <div
                    key={bi}
                    className="level-preview-liquid-block"
                    style={{
                      backgroundColor: hexToCss(colorHex),
                      flex: block.count,
                    }}
                  >
                    {/* Curved top (meniscus) - only for topmost block; others are covered by the block above */}
                    {bi === blocks.length - 1 && (
                      <div
                        className="level-preview-liquid-surface level-preview-liquid-surface-top"
                        style={{
                          backgroundColor: surfaceColor,
                          maskImage: `url(${liquidSurfaceImg})`,
                          WebkitMaskImage: `url(${liquidSurfaceImg})`,
                        }}
                      />
                    )}
                    {/* Curved bottom - extends down to cover the top of the block below */}
                    <div
                      className="level-preview-liquid-surface level-preview-liquid-surface-bottom"
                      style={{
                        backgroundColor: hexToCss(colorHex),
                        maskImage: `url(${liquidSurfaceImg})`,
                        WebkitMaskImage: `url(${liquidSurfaceImg})`,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          {/* Tube body (front layer) */}
          <img src={tubeBodyImg} alt="" className="level-preview-tube-body" />
        </div>
      ))}
      </div>
    </div>
  );
};

export default LevelPreview;
