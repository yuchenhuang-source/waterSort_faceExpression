import { defineConfig } from 'vite';
import path from 'path';
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from "url";
import { enhancedAutoAssetsPlugin } from "./enhanced-auto-assets-plugin.js";

// https://vitejs.dev/config/
// root 必须指向 package 根目录（config 在 vite/ 子目录，默认 root 会错误）
const root = fileURLToPath(new URL('..', import.meta.url));
export default defineConfig({
    root,
    base: './',
    plugins: [
        react(),
        {
            ...enhancedAutoAssetsPlugin({
                assetsDir: path.join(root, 'src/assets'),
                verbose: true,
                includeGroups: null
            }),
            enforce: 'pre'
        },
    ],
    resolve: {
        alias: [
            {find: '@', replacement: fileURLToPath(new URL('../src', import.meta.url))}
        ]
    },
    server: {
        port: 8081,
        host: true
    }
})
