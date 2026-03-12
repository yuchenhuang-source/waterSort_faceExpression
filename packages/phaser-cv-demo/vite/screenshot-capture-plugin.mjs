/**
 * Vite 插件：提供 /api/capture-screenshots 接口，调用 Puppeteer 截取 3 关预览图
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function screenshotCapturePlugin() {
  const projectRoot = path.join(__dirname, '..');
  const scriptPath = path.join(projectRoot, 'scripts', 'screenshot-level.mjs');

  return {
    name: 'screenshot-capture',
    configureServer(server) {
      server.middlewares.use('/api/capture-screenshots', (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }
        const port = server.config.server?.port ?? 8080;
        const baseUrl = `http://127.0.0.1:${port}`;
        const child = spawn(
          'node',
          [scriptPath, '--mode', '3', '--url', baseUrl, '--wait', '2500'],
          { cwd: projectRoot }
        );
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => { stdout += chunk; });
        child.stderr.on('data', (chunk) => { stderr += chunk; });
        child.on('close', (code) => {
          res.setHeader('Content-Type', 'application/json');
          if (code !== 0) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: stderr || `Script exited with code ${code}` }));
            return;
          }
          try {
            const data = JSON.parse(stdout);
            res.end(JSON.stringify(data));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Invalid JSON from screenshot script' }));
          }
        });
        child.on('error', (err) => {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        });
      });
    },
  };
}
