import { defineConfig } from 'vite';
import path from 'path';
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

const root = fileURLToPath(new URL('..', import.meta.url));
export default defineConfig({
    root,
    base: './',
    plugins: [
        react(),
        phasermsg(),
        viteSingleFile(),
        {
            ...enhancedAutoAssetsPlugin({
                assetsDir: path.join(root, 'src/assets'),
                verbose: true,
                includeGroups: null
            }),
            enforce: 'pre'
        },
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
