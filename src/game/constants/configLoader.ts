/**
 * 运行时配置加载器
 * 优先从 /api/constants 获取配置（dev 模式），失败时回退到打包的 JSON（生产构建）
 */
import configJson from './game-constants-config.json';

export type GameConstantsConfig = Record<string, unknown>;

/** 从 /api/constants 或打包 JSON 获取配置 */
export async function fetchGameConstants(): Promise<GameConstantsConfig> {
  try {
    const r = await fetch('/api/constants');
    if (r.ok) {
      return (await r.json()) as GameConstantsConfig;
    }
  } catch {
    // 网络错误或 API 不可用（如生产构建）
  }
  return configJson as GameConstantsConfig;
}
