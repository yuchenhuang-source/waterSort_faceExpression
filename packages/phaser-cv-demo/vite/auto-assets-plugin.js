import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';

/**
 * 自动资源处理插件
 * 
 * 该插件会自动扫描指定目录中的资源文件（图片、音频等），
 * 转换为base64格式，并提供一个简单的API在游戏中使用这些资源。
 * 
 * 与viteSingleFile插件协同工作，确保所有内容都被打包到单一的HTML文件中。
 */
export function autoAssetsPlugin(options = {}) {
  // 默认配置
  const defaultOptions = {
    // 要扫描的资源目录（相对于项目根目录）
    assetsDir: 'src/assets',
    // 要处理的文件类型
    fileTypes: '**/*.{png,jpg,jpeg,gif,webp,mp3,ogg,wav}',
    // 是否在构建开始时输出找到的资源信息
    verbose: true,
    // 虚拟模块ID，用于在应用中导入资源
    virtualModuleId: 'virtual:game-assets',
  };

  // 合并选项
  const resolvedOptions = { ...defaultOptions, ...options };
  const resolvedVirtualModuleId = '\0' + resolvedOptions.virtualModuleId;

  return {
    name: 'vite-plugin-auto-assets',

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
          const files = globSync(resolvedOptions.fileTypes, {
            cwd: resolvedOptions.assetsDir,
            absolute: false,
          });

          if (resolvedOptions.verbose) {
            console.log(`[auto-assets] Found ${files.length} assets`);
          }

          // 生成资源映射代码
          let assetsMap = {};
          
          for (const file of files) {
            const filePath = path.join(resolvedOptions.assetsDir, file);
            
            // 生成包含路径的键名，避免重名
            // 例如: 'images/logo.png' => 'images_logo'
            const relativePath = file.replace(/\\/g, '/'); // 标准化路径分隔符
            const keyWithoutExt = relativePath.substring(0, relativePath.lastIndexOf('.'));
            const key = keyWithoutExt.replace(/\//g, '_');
            
            const ext = path.extname(file).substring(1).toLowerCase();
            
            // 读取文件内容
            const fileContent = fs.readFileSync(filePath);
            // 转换为base64
            const base64 = fileContent.toString('base64');
            
            // 确定MIME类型
            let mimeType;
            if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
              mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
            } else if (['mp3', 'ogg', 'wav'].includes(ext)) {
              mimeType = `audio/${ext}`;
            } else {
              mimeType = 'application/octet-stream';
            }
            
            // 构建完整的data URI
            const dataUrl = `data:${mimeType};base64,${base64}`;
            
            // 添加到资源映射
            assetsMap[key] = {
              url: dataUrl,
              type: ext === 'jpg' || ext === 'jpeg' ? 'image' : ext,
            };
          }

          // 生成导出代码
          return `
            // 自动生成的资源映射
            const assets = ${JSON.stringify(assetsMap, null, 2)};
            
            // 辅助函数，用于加载图像资源到Phaser
            export function loadAllAssets(scene) {
              if (!scene || !scene.load) {
                console.error('[auto-assets] 无效的Phaser场景对象');
                return;
              }
              
              Object.entries(assets).forEach(([key, asset]) => {
                if (asset.type === 'image' || asset.type === 'png' || asset.type === 'webp' || asset.type === 'gif') {
                  scene.load.image(key, asset.url);
                } else if (asset.type === 'mp3' || asset.type === 'ogg' || asset.type === 'wav') {
                  scene.load.audio(key, asset.url);
                }
              });
              
              console.log(\`[auto-assets] 加载了 \${Object.keys(assets).length} 个资源\`);
            }
            
            // 导出资源映射和单个资源获取函数
            export function getAsset(key) {
              if (!assets[key]) {
                console.warn(\`[auto-assets] 资源未找到: \${key}\`);
                return null;
              }
              return assets[key].url;
            }
            
            export default assets;
          `;
        } catch (error) {
          console.error('[auto-assets] Error generating assets module:', error);
          return `
            console.error('[auto-assets] Failed to load assets:', ${JSON.stringify(error.message)});
            export default {};
            export function loadAllAssets() { console.error('[auto-assets] Assets unavailable'); }
            export function getAsset() { return null; }
          `;
        }
      }
    },

    // 在构建开始时输出信息
    buildStart() {
      if (resolvedOptions.verbose) {
        console.log(`[auto-assets] 扫描资源目录: ${resolvedOptions.assetsDir}`);
        console.log(`[auto-assets] 文件类型: ${resolvedOptions.fileTypes}`);
      }
    }
  };
}