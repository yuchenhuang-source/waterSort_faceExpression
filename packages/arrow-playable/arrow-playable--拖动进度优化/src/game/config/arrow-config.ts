/**
 * 箭头配置 - 从 output-config.json 的 arrow 节点读取
 * 使用 outputConfigLoader 加载
 */

import { getOutputConfigAsync, getOutputConfigValue } from '../../utils/outputConfigLoader';

/** 箭头配置项（与 output-config.json 中 arrow 结构一致） */
export interface ArrowConfig {
  /** 默认颜色（hex，如 "#ff0000"）用于 L 形/新建箭头 */
  defaultColor: string;
  /** 直线箭头默认颜色（hex） */
  straightArrowDefaultColor: string;
  /** 直线箭头默认长度 */
  straightArrowDefaultLength: number;
  /** 箭头最小长度 */
  minLength: number;
  /** 箭头最大长度 */
  maxLength: number;
}

/** 默认箭头配置（当 output-config 未提供或开发环境未加载时使用） */
export const DEFAULT_ARROW_CONFIG: ArrowConfig = {
  defaultColor: '#ff0000',
  straightArrowDefaultColor: '#0000ff',
  straightArrowDefaultLength: 3,
  minLength: 2,
  maxLength: 8
};

/**
 * 将 hex 颜色字符串转为 Phaser 颜色值（0xRRGGBB）
 */
export function hexToPhaserColor(hex: string): number {
  if (!hex || typeof hex !== 'string') return 0xff0000;
  const s = hex.startsWith('#') ? hex.slice(1) : hex;
  const n = parseInt(s, 16);
  return isNaN(n) ? 0xff0000 : n;
}

function mergeArrowConfig(raw: unknown): ArrowConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_ARROW_CONFIG };
  const o = raw as Record<string, unknown>;
  return {
    defaultColor: typeof o.defaultColor === 'string' ? o.defaultColor : DEFAULT_ARROW_CONFIG.defaultColor,
    straightArrowDefaultColor: typeof o.straightArrowDefaultColor === 'string' ? o.straightArrowDefaultColor : DEFAULT_ARROW_CONFIG.straightArrowDefaultColor,
    straightArrowDefaultLength: typeof o.straightArrowDefaultLength === 'number' ? o.straightArrowDefaultLength : DEFAULT_ARROW_CONFIG.straightArrowDefaultLength,
    minLength: typeof o.minLength === 'number' ? o.minLength : DEFAULT_ARROW_CONFIG.minLength,
    maxLength: typeof o.maxLength === 'number' ? o.maxLength : DEFAULT_ARROW_CONFIG.maxLength
  };
}

/**
 * 同步获取箭头配置（生产环境从嵌入配置读，开发环境返回默认配置）
 */
export function getArrowConfigSync(): ArrowConfig {
  const raw = getOutputConfigValue<unknown>('arrow');
  return mergeArrowConfig(raw);
}

/**
 * 异步获取箭头配置（推荐：开发环境从 output-config.json 拉取，生产环境从嵌入配置读）
 */
export async function getArrowConfigAsync(): Promise<ArrowConfig> {
  const config = await getOutputConfigAsync();
  const raw = config?.arrow;
  return mergeArrowConfig(raw);
}
