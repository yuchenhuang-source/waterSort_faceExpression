/**
 * 性能计时器：URL ?perf=1 时每 60 帧打印关键耗时
 * 输出格式便于从浏览器控制台复制
 */
const LOG_INTERVAL = 60;

export interface PerfData {
  frameCount: number;
  boardUpdateMs: number[];
  drawLiquidTotalMs: number;
  drawLiquidCalls: number;
}

export interface SceneStats {
  totalDisplayObjects: number;
  animatingSprites: number;
  animsByKey: Record<string, number>;
}

declare global {
  interface Window {
    __perf?: PerfData;
  }
}

export function isPerfEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('perf') === '1';
}

export function initPerf(): void {
  if (!isPerfEnabled()) return;
  window.__perf = {
    frameCount: 0,
    boardUpdateMs: [],
    drawLiquidTotalMs: 0,
    drawLiquidCalls: 0,
  };
}

export function recordBoardUpdate(ms: number): void {
  if (!window.__perf) return;
  window.__perf.boardUpdateMs.push(ms);
}

export function recordDrawLiquid(ms: number): void {
  if (!window.__perf) return;
  window.__perf.drawLiquidTotalMs += ms;
  window.__perf.drawLiquidCalls++;
}

/** 递归统计场景中显示对象数量及正在播动画的 Sprite */
function countSceneStats(scene: Phaser.Scene): SceneStats {
  let total = 0;
  let animating = 0;
  const animsByKey: Record<string, number> = {};

  function walk(obj: Phaser.GameObjects.GameObject) {
    total++;
    const go = obj as Phaser.GameObjects.GameObject & { anims?: Phaser.Animations.AnimationState };
    if (go.anims?.currentAnim?.isPlaying) {
      animating++;
      const key = go.anims.currentAnim.key;
      animsByKey[key] = (animsByKey[key] || 0) + 1;
    }
    const cont = obj as Phaser.GameObjects.Container;
    if (cont.list) {
      for (let i = 0; i < cont.list.length; i++) {
        walk(cont.list[i]);
      }
    }
  }
  scene.children.each((child) => walk(child));
  return { totalDisplayObjects: total, animatingSprites: animating, animsByKey };
}

export function tickPerf(scene?: Phaser.Scene): void {
  if (!window.__perf || !isPerfEnabled()) return;
  window.__perf.frameCount++;
  if (window.__perf.frameCount % LOG_INTERVAL !== 0) return;

  const p = window.__perf;
  const samples = p.boardUpdateMs;
  const avg = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
  const max = samples.length ? Math.max(...samples) : 0;

  const totalMs = avg * samples.length + p.drawLiquidTotalMs;
  const perFrameEst = LOG_INTERVAL > 0 ? totalMs / LOG_INTERVAL : 0;

  let statsLine = '';
  if (scene) {
    const t0 = performance.now();
    const stats = countSceneStats(scene);
    const countMs = performance.now() - t0;
    const animsStr = Object.entries(stats.animsByKey)
      .map(([k, n]) => `${k}:${n}`)
      .join(' ');
    statsLine =
      '\n  显示对象总数: ' +
      stats.totalDisplayObjects +
      ' | 正在播动画: ' +
      stats.animatingSprites +
      (animsStr ? ' (' + animsStr + ')' : '') +
      ' | 统计耗时: ' +
      countMs.toFixed(2) +
      'ms';
  }

  console.log(
    '[PERF] === 每 ' +
      LOG_INTERVAL +
      ' 帧汇总 (URL需带 ?perf=1) ===\n' +
      '  Board.update: avg=' +
      avg.toFixed(3) +
      'ms max=' +
      max.toFixed(3) +
      'ms (n=' +
      samples.length +
      ')\n' +
      '  Tube.drawLiquid: total=' +
      p.drawLiquidTotalMs.toFixed(2) +
      'ms calls=' +
      p.drawLiquidCalls +
      ' avg/call=' +
      (p.drawLiquidCalls ? (p.drawLiquidTotalMs / p.drawLiquidCalls).toFixed(3) : '0') +
      'ms\n' +
      '  上述合计每帧约: ' +
      perFrameEst.toFixed(2) +
      'ms (剩余耗时在 Phaser 显示树+渲染)' +
      statsLine
  );

  p.boardUpdateMs = [];
  p.drawLiquidTotalMs = 0;
  p.drawLiquidCalls = 0;
}
