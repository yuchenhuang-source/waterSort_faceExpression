import fs from 'fs';
import path from 'path';

/**
 * Vite 插件：将配置文件嵌入到 HTML 中
 * 支持将 JSON 配置文件转换为 base64 编码并嵌入到构建后的 HTML
 */
export function configEmbedPlugin(options = {}) {
  const {
    configFiles = ['src/game/config/output-config.json'], // 默认配置文件列表
    embedKey = 'EMBEDDED_CONFIG', // 嵌入到 HTML 中的变量名
    verbose = false
  } = options;

  return {
    name: 'config-embed-plugin',
    
    writeBundle(options, bundle) {
      if (verbose) {
        console.log('🔧 Config Embed Plugin: Processing configuration files in writeBundle...');
      }

      // 读取并处理所有配置文件
      const embeddedConfigs = {};
      
      for (const configFile of configFiles) {
        try {
          const configPath = path.resolve(configFile);
          
          if (fs.existsSync(configPath)) {
            const configContent = fs.readFileSync(configPath, 'utf-8');
            const fileName = path.basename(configFile);
            
            // 将 JSON 内容转换为 base64
            const base64Content = Buffer.from(configContent, 'utf-8').toString('base64');
            
            // 使用正确的格式：application/octet-stream---[jsonbase64]
            embeddedConfigs[fileName] = `application/octet-stream---${base64Content}`;
            
            if (verbose) {
              console.log(`✅ Processed: ${fileName} (${configContent.length} chars -> ${base64Content.length} base64 chars)`);
            }
          } else {
            if (verbose) {
              console.warn(`⚠️  Config file not found: ${configFile}`);
            }
          }
        } catch (error) {
          console.error(`❌ Error processing config file ${configFile}:`, error.message);
        }
      }

      // 查找输出目录中的 HTML 文件并嵌入配置
      const outputDir = options.dir || 'dist';
      const htmlFiles = fs.readdirSync(outputDir).filter(file => file.endsWith('.html'));
      
      htmlFiles.forEach(fileName => {
        const filePath = path.join(outputDir, fileName);
        
        try {
          let htmlContent = fs.readFileSync(filePath, 'utf-8');
          
          // 创建嵌入脚本
          const embedScript = `
<script>
  // 嵌入的配置数据
  window.${embedKey} = ${JSON.stringify(embeddedConfigs)};
</script>`;

          // 在 </head> 标签前插入脚本
          if (htmlContent.includes('</head>')) {
            htmlContent = htmlContent.replace('</head>', `${embedScript}\n</head>`);
          } else {
            // 如果没有 head 标签，在 body 开始处插入
            htmlContent = htmlContent.replace('<body>', `<body>${embedScript}`);
          }
          
          fs.writeFileSync(filePath, htmlContent);
          
          if (verbose) {
            console.log(`🎯 Embedded ${Object.keys(embeddedConfigs).length} config(s) into ${fileName}`);
          }
        } catch (error) {
          console.error(`❌ Error processing HTML file ${fileName}:`, error.message);
        }
      });
    }
  };
}