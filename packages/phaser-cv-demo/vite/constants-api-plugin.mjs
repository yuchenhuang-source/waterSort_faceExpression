/**
 * Vite 插件：将 constants API 集成到 dev server
 * 从 package.json 的 constantsApi 读取 configPath、apiPath
 *
 * package.json 示例:
 *   "constantsApi": {
 *     "configPath": "src/game/constants/game-constants-config.json",
 *     "apiPath": "/api/constants",
 *     "buildPath": "dist/index.html"  // 可选，有则启用 /api/build
 *   }
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function constantsApiPlugin() {
  const projectRoot = path.join(__dirname, '..');
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  } catch {
    pkg = {};
  }
  const opts = pkg.constantsApi || {};
  const configPath = path.join(projectRoot, opts.configPath || 'src/game/constants/game-constants-config.json');
  const apiPath = opts.apiPath || '/api/constants';
  const buildPath = opts.buildPath ? path.join(projectRoot, opts.buildPath) : null;

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
    name: 'constants-api',
    configureServer(server) {
      server.middlewares.use(apiPath, (req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.statusCode = 204;
          res.end();
          return;
        }
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

      if (buildPath) {
        server.middlewares.use('/api/build', async (req, res, next) => {
          if (req.method !== 'POST') {
            next();
            return;
          }
          try {
            await runBuild();
            if (fs.existsSync(buildPath)) {
              res.setHeader('Content-Disposition', 'attachment; filename="index.html"');
              res.setHeader('Content-Type', 'text/html');
              res.end(fs.readFileSync(buildPath));
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
      }
    },
  };
}
