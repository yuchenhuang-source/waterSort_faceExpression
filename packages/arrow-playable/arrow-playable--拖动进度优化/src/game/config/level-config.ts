/**
 * 关卡配置（箭头排布） - 从 output-config.json 的 level 节点读取
 * 使用 outputConfigLoader 加载
 */

import { getOutputConfigAsync, getOutputConfigValue } from '../../utils/outputConfigLoader';
import type { LevelData, LevelMeta, LevelConfig, ArrowData } from '../types/Board';

/** 默认关卡数据（当 output-config 未提供 level 时使用） */
export const DEFAULT_LEVEL_DATA: LevelData = {
  meta: {
    version: '1.0',
    created: new Date().toISOString(),
    levelName: '测试关卡',
    author: 'Test',
    description: '5x5测试棋盘'
  },
  config: {
    width: 5,
    height: 5,
    rule: { exitMode: 'A' }
  },
  arrows: [
    { id: 'arrow1', indices: [10, 11, 16, 17, 18, 23], style: { color: '#000000' } },
    { id: 'arrow2', indices: [0, 1, 2], style: { color: '#000000' } },
    { id: 'arrow3', indices: [4, 9, 14], style: { color: '#000000' } }
  ]
};

function isMeta(v: unknown): v is LevelMeta {
  return !!v && typeof v === 'object' && typeof (v as LevelMeta).version === 'string';
}

function isConfig(v: unknown): v is LevelConfig {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return typeof c.width === 'number' && typeof c.height === 'number';
}

function isArrowData(v: unknown): v is ArrowData {
  if (!v || typeof v !== 'object') return false;
  const a = v as Record<string, unknown>;
  return Array.isArray(a.indices) && a.indices.every((i: unknown) => typeof i === 'number');
}

function normalizeLevelData(raw: unknown): LevelData {
  if (!raw || typeof raw !== 'object') return DEFAULT_LEVEL_DATA;
  const o = raw as Record<string, unknown>;

  const meta: LevelMeta = isMeta(o.meta)
    ? o.meta
    : DEFAULT_LEVEL_DATA.meta;

  const config: LevelConfig = isConfig(o.config)
    ? o.config as LevelConfig
    : DEFAULT_LEVEL_DATA.config;

  const arrows: ArrowData[] = Array.isArray(o.arrows)
    ? o.arrows.filter(isArrowData).map((a) => ({
        id: a.id,
        indices: a.indices,
        style: a.style ? { color: a.style.color } : undefined
      }))
    : DEFAULT_LEVEL_DATA.arrows;

  return { meta, config, arrows };
}

/**
 * 同步获取关卡数据（生产环境从嵌入配置读，开发环境无 level 时返回默认关卡）
 */
export function getLevelDataSync(): LevelData {
  const raw = getOutputConfigValue<unknown>('level');
  return normalizeLevelData(raw);
}

/**
 * 异步获取关卡数据（推荐：开发环境从 output-config.json 拉取，生产环境从嵌入配置读）
 */
export async function getLevelDataAsync(): Promise<LevelData> {
  const config = await getOutputConfigAsync();
  const raw = config?.level;
  return normalizeLevelData(raw);
}
