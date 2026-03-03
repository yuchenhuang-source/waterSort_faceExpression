/**
 * 构建前生成 puzzles-config.json
 * 读取 output-config 的 emptyTubeCount，为难度 1/5/9 各生成一关
 */
import { writeFileSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { generatePuzzleWithAdapter } from '../src/utils/puzzle-adapter';

const outputConfigPath = resolve(__dirname, '../src/game/config/output-config.json');
const outputPath = resolve(__dirname, '../src/game/config/puzzles-config.json');

const outputConfig = JSON.parse(readFileSync(outputConfigPath, 'utf-8'));
const emptyTubeCount = Math.max(1, Math.min(6, outputConfig.emptyTubeCount ?? 2));

const puzzles: Record<string, ReturnType<typeof generatePuzzleWithAdapter> & { difficulty: number; emptyTubeCount: number }> = {};

for (const d of [1, 5, 9]) {
  const result = generatePuzzleWithAdapter({ difficulty: d, emptyTubeCount });
  puzzles[String(d)] = {
    ...result,
    difficulty: d,
    emptyTubeCount,
  };
}

const config = {
  version: 1,
  emptyTubeCount,
  puzzles,
};

writeFileSync(outputPath, JSON.stringify(config, null, 2), 'utf-8');
console.log(`✅ Generated puzzles-config.json (emptyTubeCount=${emptyTubeCount})`);
