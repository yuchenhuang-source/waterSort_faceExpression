/**
 * Vite 插件：将 constants-editor 的 API 集成到 dev server，无需单独运行 dev-tools
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function constantsEditorPlugin() {
  const projectRoot = path.join(__dirname, '..');
  const configPath = path.join(projectRoot, 'src', 'game', 'constants', 'game-constants-config.json');
  const distPath = path.join(projectRoot, 'dist', 'index.html');

  function runBuild() {
    return new Promise((resolve, reject) => {
      const child = spawn('npm', ['run', 'build'], {
        cwd: projectRoot,
        stdio: 'inherit',
        shell: true
      });
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Build exited with code ${code}`));
      });
      child.on('error', reject);
    });
  }

  return {
    name: 'constants-editor',
    configureServer(server) {
      server.middlewares.use('/api/constants', (req, res, next) => {
        if (req.method === 'GET') {
          try {
            const data = fs.readFileSync(configPath, 'utf8');
            res.setHeader('Content-Type', 'application/json');
            res.end(data);
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const config = JSON.parse(body);
              fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }
        next();
      });

      server.middlewares.use('/api/build', async (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }
        try {
          await runBuild();
          if (fs.existsSync(distPath)) {
            res.setHeader('Content-Disposition', 'attachment; filename="index.html"');
            res.setHeader('Content-Type', 'text/html');
            res.end(fs.readFileSync(distPath));
          } else {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Build failed: dist/index.html not found' }));
          }
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}
