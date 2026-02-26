import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from "url";
import { enhancedAutoAssetsPlugin } from "./enhanced-auto-assets-plugin.js";


// https://vitejs.dev/config/
export default defineConfig({
    base: './',
    plugins: [
        react(),
        enhancedAutoAssetsPlugin({
            assetsDir: 'src/assets',
            verbose: true,
            includeGroups: ['audio']  // 仅音频由插件提供，图片等由 Preloader 手动加载，避免重复
        }),
    ],
    resolve: {
        alias: [
            {find: '@', replacement: fileURLToPath(new URL('../src', import.meta.url))}
        ]
    },
    server: {
        port: 8080
    }
})
