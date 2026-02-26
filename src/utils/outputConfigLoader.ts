/**
 * Output Config 加载器 - 专门处理嵌入式配置的加载和访问
 * 提供便捷的方法来从嵌入的 output-config.json 中获取配置值
 */

import { parseEncodedConfig } from './configLoader';
import { BallColor, BALL_COLORS, DEFAULT_LIQUID_COLORS } from '../game/constants/GameConstants';

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

// 全局变量声明
declare global {
  interface Window {
    EMBEDDED_CONFIG?: Record<string, string>;
  }
}

/**
 * 获取嵌入的 output-config 数据
 * @returns 解析后的配置对象，如果获取失败则返回空对象
 */
export function getOutputConfig(): OutputConfig {
  // 开发环境：返回空对象，建议使用异步方法
  if (import.meta.env.DEV) {
    console.warn('开发环境下请使用 getOutputConfigAsync() 方法');
    return {};
  }

  // 生产环境：从嵌入的数据中解析
  if (typeof window !== 'undefined' && window.EMBEDDED_CONFIG) {
    if (import.meta.env.DEV) {
      console.log('🔍 [生产环境-同步] 检测到嵌入配置:', Object.keys(window.EMBEDDED_CONFIG));
    }
    
    const parsedConfig = parseEncodedConfig(window.EMBEDDED_CONFIG, 'output-config.json');
    
    if (parsedConfig) {
      if (import.meta.env.DEV) {
        console.log('✅ [生产环境-同步] 成功解析配置');
      }
      cachedLiquidColors = buildLiquidColorsFromConfig(parsedConfig);
      return parsedConfig;
    } else {
      if (import.meta.env.DEV) {
        console.error('❌ [生产环境-同步] 配置解析失败');
      }
    }
  } else {
    if (import.meta.env.DEV) {
      console.warn('⚠️ [生产环境-同步] 未检测到嵌入配置');
    }
  }

  return {};
}

/**
 * 异步获取嵌入的 output-config 数据
 * @returns Promise<OutputConfig> 解析后的配置对象
 */
export async function getOutputConfigAsync(): Promise<OutputConfig> {
  // 如果已有缓存，直接返回（避免重复解析）
  if (cachedConfig !== null) {
    return cachedConfig;
  }

  // 开发环境：使用 fetch 读取配置文件
  if (import.meta.env.DEV) {
    try {
      const response = await fetch('/src/game/config/output-config.json');
      if (response.ok) {
        const config = await response.json() || {};
        cachedConfig = config;
        cachedLiquidColors = buildLiquidColorsFromConfig(config);
        return config;
      } else {
        console.warn('开发环境下无法加载 output-config.json: HTTP', response.status);
        cachedConfig = {};
        return {};
      }
    } catch (error) {
      console.warn('开发环境下无法加载 output-config.json:', error);
      cachedConfig = {};
      return {};
    }
  }

  // 生产环境：从嵌入的数据中解析
  if (typeof window !== 'undefined' && window.EMBEDDED_CONFIG) {
    if (import.meta.env.DEV) {
      console.log('🔍 [生产环境] 检测到嵌入配置:', Object.keys(window.EMBEDDED_CONFIG));
      console.log('🔍 [生产环境] 查找配置文件: output-config.json');
    }
    
    const parsedConfig = parseEncodedConfig(window.EMBEDDED_CONFIG, 'output-config.json');
    
    if (parsedConfig) {
      if (import.meta.env.DEV) {
        console.log('✅ [生产环境] 成功解析配置:', Object.keys(parsedConfig));
      }
      cachedConfig = parsedConfig;
      cachedLiquidColors = buildLiquidColorsFromConfig(parsedConfig);
      return parsedConfig;
    } else {
      if (import.meta.env.DEV) {
        console.error('❌ [生产环境] 配置解析失败');
        console.log('🔍 [生产环境] 嵌入配置内容:', window.EMBEDDED_CONFIG);
      }
      cachedConfig = {};
    }
  } else {
    if (import.meta.env.DEV) {
      console.warn('⚠️ [生产环境] 未检测到嵌入配置 window.EMBEDDED_CONFIG');
    }
    cachedConfig = {};
  }

  return cachedConfig;
}

/**
 * 获取液体颜色映射（来自 output-config.json 的 liquidColors，缺失项使用默认色值）
 * 需在 Preloader 中先调用 getOutputConfigAsync() 以在开发环境填充缓存
 */
export function getLiquidColors(): { [key in BallColor]: number } {
  return cachedLiquidColors ?? DEFAULT_LIQUID_COLORS;
}

/**
 * 从 output-config 中获取指定路径的值
 * @param path 配置路径，支持点号分隔的嵌套路径，如 'game.difficulty' 或 'ui.theme.colors.primary'
 * @param defaultValue 默认值，当路径不存在时返回
 * @returns 配置值或默认值
 */
export function getOutputConfigValue<T = any>(path: string, defaultValue?: T): T {
  const config = getOutputConfig();
  
  // 如果是 Promise（开发环境），需要异步处理
  if (config instanceof Promise) {
    console.warn('getOutputConfigValue 在开发环境中返回了 Promise，请使用 getOutputConfigValueAsync');
    return defaultValue as T;
  }
  
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
 * @param obj 目标对象
 * @param path 路径字符串，如 'a.b.c'
 * @param defaultValue 默认值
 * @returns 找到的值或默认值
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
 * @returns boolean 是否已加载配置
 */
export function isOutputConfigLoaded(): boolean {
  if (import.meta.env.DEV) {
    // 开发环境中总是返回 true，因为我们可以动态加载
    return true;
  }

  // 生产环境中检查是否有嵌入的配置
  return typeof window !== 'undefined' && !!window.EMBEDDED_CONFIG;
}

/**
 * 获取所有可用的配置键
 * @returns Promise<string[]> 配置键数组
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
  console.log('Environment:', import.meta.env.DEV ? 'Development' : 'Production');
  console.log('Config loaded:', isOutputConfigLoaded());
  
  if (typeof window !== 'undefined' && window.EMBEDDED_CONFIG) {
    console.log('Embedded configs available:', Object.keys(window.EMBEDDED_CONFIG));
  }
  
  getOutputConfigAsync().then(config => {
    console.log('Current config:', config);
    console.log('Config keys:', Object.keys(config));
  }).catch(error => {
    console.error('Error loading config:', error);
  }).finally(() => {
    console.groupEnd();
  });
}