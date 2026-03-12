/**
 * Vite 插件：选择 playable 项目时自动启动其 dev 服务器
 * POST /api/start-project { project: 'arrow-playable' } -> spawn npm run dev in packages/arrow-playable
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 已启动的子进程，避免重复启动 */
const startedProcesses = new Set();

const PROJECT_CONFIG = {
  'arrow-playable': {
    dir: 'arrow-playable',
    port: 8081,
  },
};

export function startProjectPlugin() {
  const projectRoot = path.join(__dirname, '..');
  const monorepoRoot = path.join(projectRoot, '..');

  return {
    name: 'start-project',
    configureServer(server) {
      server.middlewares.use('/api/start-project', (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json');
          try {
            const { project } = JSON.parse(body || '{}');
            const config = PROJECT_CONFIG[project];
            if (!config) {
              res.end(JSON.stringify({ ok: false, error: 'Unknown project' }));
              return;
            }
            if (startedProcesses.has(project)) {
              res.end(JSON.stringify({ ok: true, message: 'Already started' }));
              return;
            }
            const targetPath = path.join(monorepoRoot, config.dir);
            if (!fs.existsSync(targetPath)) {
              res.end(JSON.stringify({ ok: false, error: `Directory not found: ${targetPath}` }));
              return;
            }
            const pkgPath = path.join(targetPath, 'package.json');
            const hasPackageJson = fs.existsSync(pkgPath);
            const cmd = hasPackageJson ? 'npm' : 'npx';
            const args = hasPackageJson ? ['run', 'dev', '--', '--port', String(config.port)] : ['vite', '--port', String(config.port)];
            const child = spawn(cmd, args, {
              cwd: targetPath,
              detached: true,
              stdio: 'ignore',
              shell: true,
            });
            child.unref();
            startedProcesses.add(project);
            res.end(JSON.stringify({ ok: true, message: 'Starting...' }));
          } catch (err) {
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
      });
    },
  };
}
