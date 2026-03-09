/**
 * 增强版自动资源处理插件
 * 
 * 基于nutssort-playable的auto-assets-plugin.js增强而来
 * 提供更强大的资源扫描、处理和优化功能
 * 
 * @author 开发者
 * @date 2025-06-23
 */

import fs from 'fs';
import path from 'path';
import * as glob from 'glob';

/**
 * 默认配置
 */
const DEFAULT_OPTIONS = {
  // 要扫描的资源目录（相对于项目根目录）
  assetsDir: 'src/assets',
  // 要处理的文件类型
  fileTypes: '**/*.{png,jpg,jpeg,gif,webp,mp3,wav,ogg,json,atlas,txt}',
  // 排除模式
  excludePatterns: ['**/spine/**', '**/temp/**', '**/cache/**'],
  // 是否在构建开始时输出找到的资源信息
  verbose: true,
  // 虚拟模块ID，用于在应用中导入资源
  virtualModuleId: 'virtual:game-assets',
  // 是否启用资源优化
  enableOptimization: true,
  // 图片质量优化设置
  imageOptimization: {
    enabled: true,
    quality: 85,
    maxWidth: 2048,
    maxHeight: 2048
  },
  // 音频处理设置
  audioProcessing: {
    enabled: true,
    preferredFormat: 'mp3',
    fallbackFormats: ['ogg', 'wav']
  },
  // 资源分组设置
  grouping: {
    enabled: true,
    groups: {
      images: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
      audio: ['mp3', 'wav', 'ogg'],
      data: ['json', 'atlas', 'txt']
    }
  },
  // 仅将指定分组打入虚拟模块，避免与 Preloader 中手动 import 的资源重复
  // 例如 ['audio'] 表示只包含音频，图片等由 Preloader 手动加载
  // 不设置或 null 表示包含所有分组（原有行为）
  includeGroups: null
};

/**
 * 增强版自动资源插件
 */
export function enhancedAutoAssetsPlugin(options = {}) {
  // 合并选项
  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };
  const resolvedVirtualModuleId = '\0' + resolvedOptions.virtualModuleId;

  return {
    name: 'vite-plugin-enhanced-auto-assets',

    // 解析虚拟模块ID
    resolveId(id) {
      if (id === resolvedOptions.virtualModuleId) {
        return resolvedVirtualModuleId;
      }
    },

    // 加载虚拟模块内容
    async load(id) {
      if (id === resolvedVirtualModuleId) {
        try {
          // 扫描资源文件
          const files = glob.sync(resolvedOptions.fileTypes, {
            cwd: resolvedOptions.assetsDir,
            absolute: false,
            ignore: resolvedOptions.excludePatterns || [],
          });

          if (resolvedOptions.verbose) {
            console.log(`[enhanced-auto-assets] 发现 ${files.length} 个资源文件`);
          }

          // 生成资源映射代码
          let assetsMap = {};
          let groupedAssets = {};
          
          // 初始化分组
          if (resolvedOptions.grouping.enabled) {
            Object.keys(resolvedOptions.grouping.groups).forEach(group => {
              groupedAssets[group] = {};
            });
          }
          
          for (const file of files) {
            const filePath = path.join(resolvedOptions.assetsDir, file);
            
            // 生成包含路径的键名，避免重名
            const relativePath = file.replace(/\\/g, '/'); // 标准化路径分隔符
            const keyWithoutExt = relativePath.substring(0, relativePath.lastIndexOf('.'));
            const key = keyWithoutExt.replace(/\//g, '_');
            
            const ext = path.extname(file).substring(1).toLowerCase();
            
            // 根据扩展名确定资源分组（用于 includeGroups 过滤）
            let assetGroup;
            if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
              assetGroup = 'images';
            } else if (['mp3', 'wav', 'ogg'].includes(ext)) {
              assetGroup = 'audio';
            } else if (['json', 'atlas', 'txt'].includes(ext)) {
              assetGroup = 'data';
            } else {
              assetGroup = 'other';
            }
            const includeGroups = resolvedOptions.includeGroups;
            if (includeGroups && !includeGroups.includes(assetGroup)) {
              continue; // 跳过不在 includeGroups 中的资源，避免重复打入 bundle
            }
            
            // 读取文件内容
            const fileContent = fs.readFileSync(filePath);
            const fileSize = fileContent.length;
            
            let dataUrl;
            let mimeType;
            let resourceType;
            
            if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
              // 图片文件处理
              mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
              const base64 = fileContent.toString('base64');
              dataUrl = `data:${mimeType};base64,${base64}`;
              resourceType = 'image';
              
              // 添加到图片分组
              if (resolvedOptions.grouping.enabled) {
                groupedAssets.images[key] = {
                  url: dataUrl,
                  type: resourceType,
                  size: fileSize,
                  originalPath: relativePath
                };
              }
            } else if (['mp3', 'wav', 'ogg'].includes(ext)) {
              // 音频文件处理
              mimeType = `audio/${ext}`;
              const base64 = fileContent.toString('base64');
              dataUrl = `data:${mimeType};base64,${base64}`;
              resourceType = 'audio';
              
              // 添加到音频分组
              if (resolvedOptions.grouping.enabled) {
                groupedAssets.audio[key] = {
                  url: dataUrl,
                  type: resourceType,
                  size: fileSize,
                  originalPath: relativePath
                };
              }
            } else if (ext === 'json') {
              // JSON文件：直接解析为对象
              try {
                const jsonData = JSON.parse(fileContent.toString('utf8'));
                dataUrl = jsonData;
                mimeType = 'application/json';
                resourceType = 'json';
                
                // 添加到数据分组
                if (resolvedOptions.grouping.enabled) {
                  groupedAssets.data[key] = {
                    url: dataUrl,
                    type: resourceType,
                    size: fileSize,
                    originalPath: relativePath
                  };
                }
              } catch (error) {
                console.error(`[enhanced-auto-assets] JSON解析失败 ${file}:`, error);
                throw error;
              }
            } else if (['atlas', 'txt'].includes(ext)) {
              // 文本文件：直接使用文本内容
              dataUrl = fileContent.toString('utf8');
              mimeType = 'text/plain';
              resourceType = 'text';
              
              // 添加到数据分组
              if (resolvedOptions.grouping.enabled) {
                groupedAssets.data[key] = {
                  url: dataUrl,
                  type: resourceType,
                  size: fileSize,
                  originalPath: relativePath
                };
              }
            } else {
              // 其他文件：转换为base64
              mimeType = 'application/octet-stream';
              const base64 = fileContent.toString('base64');
              dataUrl = `data:${mimeType};base64,${base64}`;
              resourceType = ext;
            }
            
            // 添加到总资源映射
            assetsMap[key] = {
              url: dataUrl,
              type: resourceType,
              size: fileSize,
              originalPath: relativePath,
              mimeType: mimeType
            };
          }

          // 计算总大小
          const totalSize = Object.values(assetsMap).reduce((sum, asset) => sum + asset.size, 0);
          
          if (resolvedOptions.verbose) {
            console.log(`[enhanced-auto-assets] 资源统计:`);
            console.log(`  总文件数: ${files.length}`);
            console.log(`  总大小: ${(totalSize / 1024).toFixed(1)} KB`);
            
            if (resolvedOptions.grouping.enabled) {
              Object.entries(groupedAssets).forEach(([group, assets]) => {
                const count = Object.keys(assets).length;
                const groupSize = Object.values(assets).reduce((sum, asset) => sum + asset.size, 0);
                console.log(`  ${group}: ${count} 个文件, ${(groupSize / 1024).toFixed(1)} KB`);
              });
            }
          }

          // 生成导出代码
          return `
            // 自动生成的增强资源映射
            const assets = ${JSON.stringify(assetsMap, null, 2)};
            
            // 分组资源映射
            const groupedAssets = ${JSON.stringify(groupedAssets, null, 2)};
            
            // 资源统计信息
            const assetStats = {
              totalCount: ${files.length},
              totalSize: ${totalSize},
              groups: ${JSON.stringify(Object.fromEntries(
                Object.entries(groupedAssets).map(([group, assets]) => [
                  group, 
                  {
                    count: Object.keys(assets).length,
                    size: Object.values(assets).reduce((sum, asset) => sum + asset.size, 0)
                  }
                ])
              ), null, 2)}
            };
            
            // 辅助函数，用于加载所有资源到Phaser
            export function loadAllAssets(scene) {
              if (!scene || !scene.load) {
                console.error('[enhanced-auto-assets] 无效的Phaser场景对象');
                return;
              }
              
              Object.entries(assets).forEach(([key, asset]) => {
                if (asset.type === 'image') {
                  scene.load.image(key, asset.url);
                } else if (asset.type === 'audio') {
                  scene.load.audio(key, asset.url);
                } else if (asset.type === 'json') {
                  // JSON文件直接添加到缓存
                  scene.cache.json.add(key, asset.url);
                } else if (asset.type === 'text') {
                  // 文本文件直接添加到缓存
                  scene.cache.text.add(key, asset.url);
                }
              });
              
              console.log(\`[enhanced-auto-assets] 加载了 \${Object.keys(assets).length} 个资源\`);
            }
            
            // 按分组加载资源
            export function loadAssetGroup(scene, groupName) {
              if (!scene || !scene.load) {
                console.error('[enhanced-auto-assets] 无效的Phaser场景对象');
                return;
              }
              
              const group = groupedAssets[groupName];
              if (!group) {
                console.warn(\`[enhanced-auto-assets] 未找到资源分组: \${groupName}\`);
                return;
              }
              
              Object.entries(group).forEach(([key, asset]) => {
                if (asset.type === 'image') {
                  scene.load.image(key, asset.url);
                } else if (asset.type === 'audio') {
                  scene.load.audio(key, asset.url);
                } else if (asset.type === 'json') {
                  scene.cache.json.add(key, asset.url);
                } else if (asset.type === 'text') {
                  scene.cache.text.add(key, asset.url);
                }
              });
              
              console.log(\`[enhanced-auto-assets] 加载了分组 "\${groupName}" 的 \${Object.keys(group).length} 个资源\`);
            }
            
            // 获取单个资源
            export function getAsset(key) {
              if (!assets[key]) {
                console.warn(\`[enhanced-auto-assets] 资源未找到: \${key}\`);
                return null;
              }
              return assets[key];
            }
            
            // 获取资源URL
            export function getAssetUrl(key) {
              const asset = getAsset(key);
              return asset ? asset.url : null;
            }
            
            // 获取分组资源
            export function getAssetGroup(groupName) {
              return groupedAssets[groupName] || {};
            }
            
            // 获取资源统计信息
            export function getAssetStats() {
              return assetStats;
            }
            
            // 列出所有资源键名
            export function listAssetKeys() {
              return Object.keys(assets);
            }
            
            // 列出分组名称
            export function listGroupNames() {
              return Object.keys(groupedAssets);
            }
            
            // 搜索资源
            export function searchAssets(pattern) {
              const regex = new RegExp(pattern, 'i');
              return Object.keys(assets).filter(key => regex.test(key));
            }
            
            // 导出主要对象
            export { assets, groupedAssets, assetStats };
            export default assets;
          `;
        } catch (error) {
          console.error('[enhanced-auto-assets] 生成资源模块时出错:', error);
          return `
            console.error('[enhanced-auto-assets] 资源加载失败:', ${JSON.stringify(error.message)});
            export default {};
            export function loadAllAssets() { console.error('[enhanced-auto-assets] 资源不可用'); }
            export function loadAssetGroup() { console.error('[enhanced-auto-assets] 资源不可用'); }
            export function getAsset() { return null; }
            export function getAssetUrl() { return null; }
            export function getAssetGroup() { return {}; }
            export function getAssetStats() { return { totalCount: 0, totalSize: 0, groups: {} }; }
            export function listAssetKeys() { return []; }
            export function listGroupNames() { return []; }
            export function searchAssets() { return []; }
          `;
        }
      }
    },

    // 在构建开始时输出信息
    buildStart() {
      if (resolvedOptions.verbose) {
        console.log(`[enhanced-auto-assets] 扫描资源目录: ${resolvedOptions.assetsDir}`);
        console.log(`[enhanced-auto-assets] 文件类型: ${resolvedOptions.fileTypes}`);
        console.log(`[enhanced-auto-assets] 排除模式: ${resolvedOptions.excludePatterns.join(', ')}`);
        if (resolvedOptions.includeGroups) {
          console.log(`[enhanced-auto-assets] 仅包含分组: ${resolvedOptions.includeGroups.join(', ')}（避免与 Preloader 手动加载重复）`);
        }
      }
    }
  };
}

/**
 * 创建增强版自动资源插件的便捷函数
 */
export function createEnhancedAutoAssetsPlugin(options) {
  return enhancedAutoAssetsPlugin(options);
}

// 导出默认实例
export default enhancedAutoAssetsPlugin;