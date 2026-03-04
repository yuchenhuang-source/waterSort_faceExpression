import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from "url";
import { autoAssetsPlugin } from "./auto-assets-plugin.js";


// https://vitejs.dev/config/
const root = fileURLToPath(new URL('..', import.meta.url));
export default defineConfig({
    root,
    base: './',
    plugins: [
        react(),
        autoAssetsPlugin({
            assetsDir: 'src/assets',
            verbose: true
        }),
    ],
    resolve: {
        alias: [
            {find: '@', replacement: fileURLToPath(new URL('../src', import.meta.url))}
        ]
    },
    server: {
        port: 8081,
        host: true,
        proxy: {
            '/api': {
                target: 'http://localhost:3002',
                changeOrigin: true,
            },
        },
        watch: {
            ignored: ['**/output-config.json'],
        },
    }
})
