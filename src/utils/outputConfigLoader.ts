/**
 * Output Config 加载器
 * 从打包进来的 output-config.json 获取配置值
 */

import { BallColor, BALL_COLORS, DEFAULT_LIQUID_COLORS } from '../game/constants/GameConstants';
import outputConfigJson from '../game/config/output-config.json';

// 类型定义
type OutputConfig = Record<string, any>;

/** 液体颜色缓存（由 output-config 的 liquidColors 与默认值合并得到） */
let cachedLiquidColors: { [key in BallColor]: number } | null = null;

/** 配置对象缓存（避免重复解析） */
let cachedConfig: OutputConfig | null = null;

/** 将配置中的色值（16进制字符串如 "0x8B5A2B" / "#8B5A2B" 或数字）转为 number */
function parseColorValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (/^0x[0-9a-fA-F]+$/.test(s)) return parseInt(s, 16);
  if (/^#[0-9a-fA-F]+$/.test(s)) return parseInt(s.slice(1), 16);
  return null;
}

function buildLiquidColorsFromConfig(config: OutputConfig): { [key in BallColor]: number } {
  const raw = config?.liquidColors && typeof config.liquidColors === 'object' ? config.liquidColors : {};
  const result = { ...DEFAULT_LIQUID_COLORS };
  for (const color of BALL_COLORS) {
    const parsed = parseColorValue(raw[color]);
    if (parsed !== null) result[color] = parsed;
  }
  return result;
}

/**
 * 获取 output-config 数据
 * @returns 解析后的配置对象
 */
export function getOutputConfig(): OutputConfig {
  if (cachedConfig !== null) return cachedConfig;
  const config = (outputConfigJson as OutputConfig) || {};
  cachedConfig = config;
  cachedLiquidColors = buildLiquidColorsFromConfig(config);
  return config;
}

/**
 * 异步获取 output-config 数据
 * @returns Promise<OutputConfig> 解析后的配置对象
 */
export async function getOutputConfigAsync(): Promise<OutputConfig> {
  if (cachedConfig !== null) return cachedConfig;
  const config = (outputConfigJson as OutputConfig) || {};
  cachedConfig = config;
  cachedLiquidColors = buildLiquidColorsFromConfig(config);
  return config;
}

/**
 * 获取液体颜色映射（来自 output-config.json 的 liquidColors，缺失项使用默认色值）
 */
export function getLiquidColors(): { [key in BallColor]: number } {
  return cachedLiquidColors ?? DEFAULT_LIQUID_COLORS;
}

/**
 * 从 output-config 中获取指定路径的值
 * @param path 配置路径，支持点号分隔的嵌套路径
 * @param defaultValue 默认值，当路径不存在时返回
 * @returns 配置值或默认值
 */
export function getOutputConfigValue<T = any>(path: string, defaultValue?: T): T {
  const config = getOutputConfig();
  return getNestedValue(config, path, defaultValue);
}

/**
 * 异步从 output-config 中获取指定路径的值
 * @param path 配置路径，支持点号分隔的嵌套路径
 * @param defaultValue 默认值，当路径不存在时返回
 * @returns Promise<T> 配置值或默认值
 */
export async function getOutputConfigValueAsync<T = any>(path: string, defaultValue?: T): Promise<T> {
  const config = await getOutputConfigAsync();
  return getNestedValue(config, path, defaultValue);
}

/**
 * 从嵌套对象中获取指定路径的值
 */
function getNestedValue<T = any>(obj: any, path: string, defaultValue?: T): T {
  if (!obj || typeof obj !== 'object') {
    return defaultValue as T;
  }

  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return defaultValue as T;
    }
    current = current[key];
  }

  return current !== undefined ? current : defaultValue as T;
}

/**
 * 检查 output-config 是否已加载
 */
export function isOutputConfigLoaded(): boolean {
  return cachedConfig !== null;
}

/**
 * 获取所有可用的配置键
 */
export async function getOutputConfigKeys(): Promise<string[]> {
  const config = await getOutputConfigAsync();
  return Object.keys(config);
}

/**
 * 调试用：打印当前的配置状态
 */
export function debugOutputConfig(): void {
  console.group('🔧 Output Config Debug Info');
  console.log('Config loaded:', isOutputConfigLoaded());
  getOutputConfigAsync().then(config => {
    console.log('Current config:', config);
    console.log('Config keys:', Object.keys(config));
  }).catch(error => {
    console.error('Error loading config:', error);
  }).finally(() => {
    console.groupEnd();
  });
}
