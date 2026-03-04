import { defineConfig } from 'vite';
import { viteSingleFile } from "vite-plugin-singlefile"
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from "url";
import { autoAssetsPlugin } from "./auto-assets-plugin.js";
import { configEmbedPlugin } from "./config-embed-plugin.js";

const root = fileURLToPath(new URL('..', import.meta.url));
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
    root,
    base: './',
    plugins: [
        react(),
        phasermsg(),
        viteSingleFile(),
        autoAssetsPlugin({
            assetsDir: 'src/assets',
            verbose: true
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
