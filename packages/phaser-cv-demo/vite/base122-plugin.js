/**
 * Base122编码优化插件
 *
 * 用于将base64编码的图像转换为base122格式以减小文件大小
 * 提供更高效的数据压缩，特别适用于单文件HTML构建
 *
 * @author 开发者
 * @date 2025-06-23
 */

import { base64ToGzippedBase122 } from "./base122.ts";

/**
 * 默认配置
 */
const DEFAULT_OPTIONS = {
  enabled: true,
  verbose: false,
  fileExtensions: ['.html'],
  minFileSize: 1024 // 1KB
};

/**
 * Base122插件
 */
export function base122Plugin(options = {}) {
  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };

  return {
    name: 'vite-plugin-base122-images',
    enforce: 'post',
    
    generateBundle(outputOptions, bundle) {
      if (!resolvedOptions.enabled) {
        if (resolvedOptions.verbose) {
          console.log('[base122-plugin] 插件已禁用');
        }
        return;
      }

      let processedFiles = 0;
      let totalSavings = 0;

      for (const fileName in bundle) {
        const file = bundle[fileName];
        
        // 只处理指定类型的文件
        const shouldProcess = resolvedOptions.fileExtensions.some(ext => 
          fileName.endsWith(ext)
        );
        
        if (!shouldProcess || file.type !== 'asset') {
          continue;
        }

        const originalSize = file.source.length;
        
        // 检查文件大小阈值
        if (originalSize < resolvedOptions.minFileSize) {
          if (resolvedOptions.verbose) {
            console.log(`[base122-plugin] 跳过小文件: ${fileName} (${originalSize} bytes)`);
          }
          continue;
        }

        try {
          let html = file.source.toString();
          let resources = [];
          let imageCount = 0;

          // 查找并替换base64图像
          html = html.replace(
            /this\.load\.image\("[^"]+",\s*"data:image\/[^;]+;base64,([^"]+)"\)/g,
            (match, base64Data) => {
              try {
                if (resolvedOptions.verbose) {
                  console.log(`[base122-plugin] 处理图像: ${match.substring(0, 50)}...`);
                }
                
                const imageName = match.match(/this\.load\.image\("([^"]+)"/)?.[1];
                if (!imageName) {
                  console.warn('[base122-plugin] 无法提取图像名称:', match.substring(0, 100));
                  return match;
                }

                const originalBase64Size = base64Data.length;
                const compressedData = base64ToGzippedBase122(base64Data);
                const compressedSize = compressedData.length;
                
                resources.push(compressedData);
                imageCount++;
                
                const savings = originalBase64Size - compressedSize;
                totalSavings += savings;
                
                if (resolvedOptions.verbose) {
                  console.log(`[base122-plugin] 图像 "${imageName}" 压缩: ${originalBase64Size} -> ${compressedSize} bytes (节省 ${savings} bytes, ${((savings / originalBase64Size) * 100).toFixed(1)}%)`);
                }
                
                return `this.load.image("${imageName}", decodeBase122(${resources.length - 1}))`;
              } catch (error) {
                console.error('[base122-plugin] 处理图像时出错:', error);
                return match; // 保持原始内容
              }
            }
          );

          // 替换数据内容占位符
          if (resources.length > 0) {
            html = html.replace(
              /<script data-content=""><\/script>/,
              () => {
                return resources.map((resource, index) => {
                  return `<script id="data-content-${index}" data-content="${resource}"></script>`;
                }).join('\n');
              }
            );

            file.source = html;
            processedFiles++;

            if (resolvedOptions.verbose) {
              console.log(`[base122-plugin] 文件 "${fileName}" 处理完成: ${imageCount} 个图像`);
            }
          }
        } catch (error) {
          console.error(`[base122-plugin] 处理文件 "${fileName}" 时出错:`, error);
        }
      }

      // 输出处理结果
      if (processedFiles > 0) {
        console.log(`[base122-plugin] 处理完成: ${processedFiles} 个文件, 总计节省 ${totalSavings} bytes (${(totalSavings / 1024).toFixed(1)} KB)`);
      } else if (resolvedOptions.verbose) {
        console.log('[base122-plugin] 没有找到需要处理的文件');
      }
    },

    buildStart() {
      if (resolvedOptions.verbose) {
        console.log('[base122-plugin] 插件启动，配置:', resolvedOptions);
      }
    }
  };
}

/**
 * 创建Base122插件的便捷函数
 */
export function createBase122Plugin(options) {
  return base122Plugin(options);
}

/**
 * 默认Base122插件实例（向后兼容）
 */
export const base122PluginDefault = base122Plugin();

// 导出默认实例（保持向后兼容）
export default base122PluginDefault;