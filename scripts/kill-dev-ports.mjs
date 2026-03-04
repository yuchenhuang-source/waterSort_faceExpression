#!/usr/bin/env node
/**
 * 终止占用 dev 端口的进程，避免 ballsort/arrow 端口冲突
 * 端口: ballsort 8080,3001 | arrow 8081,3002
 */
import { execSync } from 'child_process';

const PORTS = [8080, 3001, 8081, 3002];

for (const port of PORTS) {
  try {
    const out = execSync(`lsof -ti :${port} 2>/dev/null`, { encoding: 'utf8' }).trim();
    const pids = out.split(/\s+/).filter(Boolean).join(' ');
    if (pids) {
      execSync(`kill -9 ${pids} 2>/dev/null`, { stdio: 'ignore' });
      console.log(`[kill-dev-ports] 已终止端口 ${port} 上的进程`);
    }
  } catch {
    // 端口无进程占用，忽略
  }
}
