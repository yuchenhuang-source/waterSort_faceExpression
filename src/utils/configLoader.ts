/**
 * 配置加载器 - 处理开发环境和生产环境的JSON配置加载
 * 在开发环境中直接使用导入的JSON
 * 在生产环境中处理base64编码的JSON
 */

// 类型定义
type ConfigObject = Record<string, any>;

/**
 * 解析编码的配置数据
 * @param encodedData 编码的数据对象 {"filename.json": "application/octet-stream---base64content"}
 * @param filename 要解析的文件名
 * @returns 解析后的配置对象，如果解析失败则返回null
 */
export function parseEncodedConfig(encodedData: any, filename: string): any | null {
  if (!encodedData || typeof encodedData !== 'object' || !encodedData[filename]) {
    return null;
  }

  const data = encodedData[filename];
  
  // 检查格式是否正确
  if (typeof data !== 'string' || !data.includes('---')) {
    return null;
  }
  
  const [prefix, base64Content] = data.split('---');
  
  if (prefix !== 'application/octet-stream' || !base64Content) {
    return null;
  }
  
  try {
    // 在浏览器环境中解码base64
    const decoded = atob(base64Content);
    return JSON.parse(decoded);
  } catch (e) {
    console.error('Failed to decode or parse config:', e);
    return null;
  }
}

/**
 * 加载配置 - 统一处理开发环境和生产环境的配置加载
 * @param importedConfig 导入的配置对象
 * @param filename 配置文件名
 * @param defaultConfig 默认配置（当解析失败时使用）
 * @returns 解析后的配置对象
 */
export function loadConfig<T extends ConfigObject>(
  importedConfig: any, 
  filename: string, 
  defaultConfig: T
): T {
  // 检查导入的配置是否为编码数据
  if (importedConfig && typeof importedConfig === 'object' && importedConfig.encodedData) {
    // 生产环境 - 解析编码数据
    const parsedConfig = parseEncodedConfig(importedConfig.encodedData, filename);
    return parsedConfig || defaultConfig;
  }
  
  // 开发环境 - 直接使用导入的JSON
  return importedConfig || defaultConfig;
}