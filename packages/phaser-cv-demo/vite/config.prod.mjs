import { defineConfig } from 'vite';
import { viteSingleFile } from "vite-plugin-singlefile";
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from "url";
import { enhancedAutoAssetsPlugin } from "./enhanced-auto-assets-plugin.js";

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

const root = fileURLToPath(new URL('..', import.meta.url));
export default defineConfig({
    root,
    base: './',
    plugins: [
        react(),
        phasermsg(),
        viteSingleFile(),
        enhancedAutoAssetsPlugin({
            assetsDir: 'src/assets',
            verbose: true,
            includeGroups: ['audio']  // 仅音频由插件提供，图片等由 Preloader 手动加载，避免重复
        })
    ],
    resolve: {
        alias: [
            {find: '@', replacement: fileURLToPath(new URL('../src', import.meta.url))}
        ]
    },
    logLevel: 'warning',
    build: {
        outDir: 'dist',
        minify: 'terser',
        terserOptions: {
            compress: {
                passes: 2
            },
            mangle: true,
            format: {
                comments: false
            }
        }
    },
    assetsInclude: ['**/*.gltf', '**/*.glb', "**/*.mpeg"]
});
