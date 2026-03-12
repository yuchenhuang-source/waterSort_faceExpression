import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from "url";
import { enhancedAutoAssetsPlugin } from "./enhanced-auto-assets-plugin.js";
import { constantsEditorPlugin } from "./constants-editor-plugin.mjs";
import { screenshotCapturePlugin } from "./screenshot-capture-plugin.mjs";


// https://vitejs.dev/config/
// root 必须指向 package 根目录（config 在 vite/ 子目录，默认 root 会错误）
const root = fileURLToPath(new URL('..', import.meta.url));
export default defineConfig({
    root,
    base: './',
    logLevel: 'warn',
    plugins: [
        react(),
        constantsEditorPlugin(),
        screenshotCapturePlugin(),
        enhancedAutoAssetsPlugin({
            assetsDir: 'src/assets',
            verbose: false,
            includeGroups: ['audio']  // 仅音频由插件提供，图片等由 Preloader 手动加载，避免重复
        }),
    ],
    resolve: {
        alias: [
            {find: '@', replacement: fileURLToPath(new URL('../src', import.meta.url))}
        ]
    },
    server: {
        port: 8080,
        host: true,  // listen on 0.0.0.0 to allow access from phone on same network
        // /api 由 constantsEditorPlugin 中间件处理，无需 proxy
        watch: {
            ignored: ['**/game-constants-config.json'],
        },
    },
})
