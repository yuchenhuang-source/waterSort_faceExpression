import { defineConfig } from 'vite';
import { viteSingleFile } from "vite-plugin-singlefile"
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from "url";
import { enhancedAutoAssetsPlugin } from "./enhanced-auto-assets-plugin.js";
import { configEmbedPlugin } from "./config-embed-plugin.js";

const phasermsg = () => {
    return {
        name: 'phasermsg',
        buildStart() {
            process.stdout.write(`Building for production...\n`);
        },
        buildEnd() {
            const line = "---------------------------------------------------------";
            const msg = `❤️❤️❤️ Tell us about your game! - games@phaser.io ❤️❤️❤️`;
            process.stdout.write(`${line}\n${msg}\n${line}\n`);

            process.stdout.write(`✨ Done ✨\n`);
        }
    }
}

export default defineConfig({
    base: './',
    plugins: [
        react(),
        phasermsg(),
        viteSingleFile(),
        enhancedAutoAssetsPlugin({
            assetsDir: 'src/assets',
            verbose: true,
            includeGroups: ['audio']  // 仅音频由插件提供，图片等由 Preloader 手动加载，避免重复
        }),
        configEmbedPlugin({
            configFiles: ['src/game/config/output-config.json'],
            embedKey: 'EMBEDDED_CONFIG',
            verbose: true
        })
    ],
    resolve: {
        alias: [
            {find: '@', replacement: fileURLToPath(new URL('../src', import.meta.url))}
        ]
    },
    logLevel: 'warning',
    build: {
        minify: 'terser',
        terserOptions: {
            compress: {
                passes: 2,
                drop_console: true  // 生产构建时移除所有 console.* 调用
            },
            mangle: true,
            format: {
                comments: false
            }
        }
    },
    assetsInclude: ['**/*.gltf', '**/*.glb', "**/*.mpeg"]
});
