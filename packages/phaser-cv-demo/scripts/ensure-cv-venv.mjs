/**
 * 首次运行 dev:cv 时自动创建 Python venv，无需手动执行 cv-bridge 配置
 */
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const phaserCvRoot = join(__dirname, '..', '..', 'phaser-cv');
const venvDir = join(phaserCvRoot, 'cv-bridge', 'venv');

if (existsSync(venvDir)) process.exit(0);

console.log('[cv] 首次运行，正在创建 Python venv...');
const r1 = spawnSync('python3', ['-m', 'venv', 'cv-bridge/venv'], {
  cwd: phaserCvRoot,
  stdio: 'inherit',
  shell: true,
});
if (r1.status !== 0) {
  console.error('[cv] 需要 Python 3，请先安装: https://www.python.org/');
  process.exit(1);
}
const r2 = spawnSync('cv-bridge/venv/bin/pip', ['install', '-r', 'cv-bridge/requirements.txt'], {
  cwd: phaserCvRoot,
  stdio: 'inherit',
  shell: true,
});
process.exit(r2.status || 0);
