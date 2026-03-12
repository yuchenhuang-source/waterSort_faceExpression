import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ConstantsEditor } from './ConstantsEditor';
// CV 录制功能已暂时注释。恢复时取消下方注释。
// import CVRecordControls from './CVRecordControls';
import type { ColorMap } from '@ballsort-multi/phaser-cv';
import { generatePuzzleWithAdapter } from '../utils/puzzle-adapter';
import { getOutputConfigValueAsync } from '../utils/outputConfigLoader';
import { hasFixedPuzzle } from '../game/constants/configLoader';
import './DeviceSimulator.css';

/** 通过 Puppeteer API 截取 3 关，返回难度 -> data URL 映射 */
async function captureLevelScreenshots(
  onProgress?: (step: 'screenshot' | 'done', elapsed?: number) => void
): Promise<Record<number, string>> {
  try {
    onProgress?.('screenshot', 0);
    const res = await fetch('/api/capture-screenshots', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('[Simulator] Screenshot API failed:', err.error || res.statusText);
      return {};
    }
    const map = (await res.json()) as Record<string, string>;
    const normalized: Record<number, string> = {};
    for (const [k, v] of Object.entries(map)) {
      if (typeof v === 'string' && v.startsWith('data:')) {
        normalized[Number(k)] = v;
      }
    }
    onProgress?.('done');
    return normalized;
  } catch (e) {
    onProgress?.('done');
    console.warn('[Simulator] Screenshot capture failed:', e);
    return {};
  }
}

/** Decode a cv-frame-data payload and trigger a PNG download. */
function downloadCVFrameAsPng(data: { pixels: string; width: number; height: number; colorMap: ColorMap }) {
  const { pixels, width, height } = data;
  const binaryStr = atob(pixels);
  const buf = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) buf[i] = binaryStr.charCodeAt(i);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(width, height);

  const pixelCount = Math.floor(buf.length / 7);
  for (let i = 0; i < pixelCount; i++) {
    const o = i * 7;
    const x = buf[o] | (buf[o + 1] << 8);
    const y = buf[o + 2] | (buf[o + 3] << 8);
    const idx = (y * width + x) * 4;
    imageData.data[idx]     = buf[o + 4];
    imageData.data[idx + 1] = buf[o + 5];
    imageData.data[idx + 2] = buf[o + 6];
    imageData.data[idx + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `cv-frame-${Date.now()}.png`;
  a.click();
}

const PRESETS = [
  { name: 'iPhone 14', w: 390, h: 844 },
  { name: 'iPhone SE', w: 375, h: 667 },
  { name: 'Pixel 7', w: 412, h: 915 },
  { name: 'iPad Mini', w: 768, h: 1024 },
  { name: 'Portrait', w: 1080, h: 2160 },
  { name: 'Landscape', w: 2160, h: 1080 },
];

function isDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= 768;
}

/** 模块级：防止 ensureProjectRunning 并发（跨 remount 保持） */
let _ensuringProject: string | null = null;

/** 可切换的 playable 项目（同 simulator 打开） */
const SIMULATOR_PROJECTS = [
  { id: 'phaser-cv-demo', label: 'phaser-cv-demo', port: 8080 },
  { id: 'arrow-playable', label: 'arrow playable', port: 8081 },
];

const LANG_OPTIONS = [
  { value: '', label: 'Browser' },
  { value: 'en', label: 'EN' },
  { value: 'zh-CN', label: '简体' },
  { value: 'zh-TW', label: '繁體' },
  { value: 'ja', label: '日' },
  { value: 'ko', label: '한' },
  { value: 'es', label: 'ES' },
  { value: 'pt', label: 'PT' },
  { value: 'de', label: 'DE' },
  { value: 'fr', label: 'FR' },
  { value: 'ru', label: 'RU' },
  { value: 'ar', label: 'AR' },
];

function readSimConfigFromUrl(): { w: number; h: number; scale: number; lang: string; project: string; customPort: string } {
  if (typeof window === 'undefined') return { w: 390, h: 844, scale: 0.5, lang: '', project: 'phaser-cv-demo', customPort: '' };
  const p = new URLSearchParams(window.location.search);
  const w = Math.min(2400, Math.max(200, parseInt(p.get('simW') || '390', 10) || 390));
  const h = Math.min(2400, Math.max(200, parseInt(p.get('simH') || '844', 10) || 844));
  const scale = Math.min(1, Math.max(0.2, parseFloat(p.get('simScale') || '0.5') || 0.5));
  const lang = p.get('simLang') || '';
  const rawProject = p.get('simProject') || 'phaser-cv-demo';
  const project = SIMULATOR_PROJECTS.some((x) => x.id === rawProject)
    ? rawProject
    : rawProject === 'arrow-playable'
      ? 'arrow-playable'
      : 'phaser-cv-demo';
  const customPort = p.get('simPort') || '';
  return { w, h, scale, lang, project, customPort };
}

export function DeviceSimulator({ children }: { children: React.ReactNode }) {
  const initial = typeof window !== 'undefined' ? readSimConfigFromUrl() : { w: 390, h: 844, scale: 0.5, lang: '', project: 'phaser-cv-demo', customPort: '' };
  const [width, setWidth] = useState(initial.w);
  const [height, setHeight] = useState(initial.h);
  const [scale, setScale] = useState(initial.scale);
  const [lang, setLang] = useState(initial.lang);
  const [project, setProject] = useState(initial.project);
  const [customPort, setCustomPort] = useState(initial.customPort);
  const [projectStarting, setProjectStarting] = useState(false);
  const [arrowReady, setArrowReady] = useState(false);
  const [customPortReady, setCustomPortReady] = useState(false);
  const [showConstantsEditor, setShowConstantsEditor] = useState(true);
  const [iconDebug, setIconDebug] = useState<{ visibleRect: { x: number; y: number; width: number; height: number }; iconRect: { x: number; y: number; w: number; h: number }; inBounds: boolean } | null>(null);
  const [fixedPuzzleActive, setFixedPuzzleActive] = useState(() => typeof window !== 'undefined' && hasFixedPuzzle());
  const [fixingPuzzle, setFixingPuzzle] = useState(false);
  const [fixProgress, setFixProgress] = useState<{ step: 'generate' | 'screenshot' | 'done'; elapsed: number } | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const ensureRunIdRef = useRef(0);

  useEffect(() => {
    if (!fixingPuzzle || fixProgress?.step !== 'screenshot') return;
    const id = setInterval(() => {
      setFixProgress((p) => (p?.step === 'screenshot' ? { ...p, elapsed: p.elapsed + 1 } : p));
    }, 1000);
    return () => clearInterval(id);
  }, [fixingPuzzle, fixProgress?.step]);

  const search = typeof window !== 'undefined' ? window.location.search : '';
  const urlParams = new URLSearchParams(search);
  const isSimulatorView = urlParams.get('simulator') === '1';
  const showSimulator = import.meta.env.DEV && (urlParams.get('enableSimulator') === '1' || (isDesktop() && !isSimulatorView));
  //const isCVMode = urlParams.get('cv') === '1';

  useEffect(() => {
    if (!showSimulator || typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    p.set('simW', String(width));
    p.set('simH', String(height));
    p.set('simScale', String(scale));
    if (lang) p.set('simLang', lang);
    else p.delete('simLang');
    if (project && project !== 'phaser-cv-demo') p.set('simProject', project);
    else p.delete('simProject');
    if (customPort) p.set('simPort', customPort);
    else p.delete('simPort');
    const qs = p.toString();
    window.history.replaceState({}, '', `${window.location.pathname || '/'}${qs ? '?' + qs : ''}`);
  }, [showSimulator, width, height, scale, lang, project, customPort]);

  const reloadIframe = useCallback(() => {
    const iframe = iframeRef.current;
    if (iframe?.src) {
      try {
        iframe.contentWindow?.location.reload();
      } catch {
        iframe.src = iframe.src;
      }
    }
  }, []);

  // 热更新时只重载模拟器 iframe，不刷新整个页面
  useEffect(() => {
    if (!showSimulator || typeof import.meta.hot === 'undefined') return;
    import.meta.hot.on('vite:afterUpdate', reloadIframe);
    return () => {
      import.meta.hot?.off('vite:afterUpdate', reloadIframe);
    };
  }, [showSimulator, reloadIframe]);

  // 数值编辑保存后只重载 iframe，不刷新整个页面
  useEffect(() => {
    if (!showSimulator || typeof window === 'undefined') return;
    const handler = () => reloadIframe();
    window.addEventListener('constants-saved', handler);
    return () => window.removeEventListener('constants-saved', handler);
  }, [showSimulator, reloadIframe]);

  // 监听 iframe 内游戏的 icon-debug 上报（postMessage + 轮询 __iconDebug 兜底）
  useEffect(() => {
    if (!showSimulator || typeof window === 'undefined') return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'icon-debug' && e.data.visibleRect && e.data.iconRect && typeof e.data.inBounds === 'boolean') {
        setIconDebug({ visibleRect: e.data.visibleRect, iconRect: e.data.iconRect, inBounds: e.data.inBounds });
      }
      // CV 录制功能已暂时注释
      // if (e.data?.type === 'cv-record-export-complete' && typeof e.data.summary === 'string') {
      //   console.log('[CV-RECORD] export completed (from iframe)', e.data.summary);
      // }
      // if (e.data?.type === 'cv-record-debug') {
      //   console.log('[CV-RECORD] debug (from iframe)', e.data.msg, e.data.connected);
      // }
      // if (e.data?.type === 'cv-frame-data' && e.data.pixels && e.data.width && e.data.height) {
      //   downloadCVFrameAsPng(e.data as { pixels: string; width: number; height: number; colorMap: ColorMap });
      // }
    };
    window.addEventListener('message', handler);
    const poll = () => {
      try {
        const win = iframeRef.current?.contentWindow as Window & { __iconDebug?: { visibleRect: unknown; iconRect: unknown; inBounds: boolean } } | null;
        const d = win?.__iconDebug;
        if (d && d.visibleRect && d.iconRect && typeof d.inBounds === 'boolean') {
          setIconDebug({ visibleRect: d.visibleRect as { x: number; y: number; width: number; height: number }, iconRect: d.iconRect as { x: number; y: number; w: number; h: number }, inBounds: d.inBounds });
        }
      } catch {
        // cross-origin or not ready
      }
    };
    const id = window.setInterval(poll, 500);
    return () => {
      window.removeEventListener('message', handler);
      window.clearInterval(id);
    };
  }, [showSimulator]);

  const rotate = useCallback(() => {
    setWidth(() => height);
    setHeight(() => width);
  }, [width, height]);

  const applyPreset = useCallback((w: number, h: number) => {
    setWidth(w);
    setHeight(h);
  }, []);

  const ensureProjectRunning = useCallback(async (projectId: string) => {
    const proj = SIMULATOR_PROJECTS.find((p) => p.id === projectId);
    if (!proj || proj.port === 8080) return;
    if (_ensuringProject === projectId) return;
    _ensuringProject = projectId;
    const runId = ++ensureRunIdRef.current;
    setArrowReady(false);
    setProjectStarting(true);
    const commitReady = () => {
      if (ensureRunIdRef.current === runId) setArrowReady(true);
    };
    try {
      const res = await fetch('/api/start-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: projectId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!j.ok) console.warn('[Simulator] Start project failed:', j.error);
      for (let i = 0; i < 30; i++) {
        try {
          await fetch(`http://127.0.0.1:${proj.port}/`, { cache: 'no-store' });
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      commitReady();
    } catch (e) {
      console.warn('[Simulator] Start project failed:', e);
      commitReady();
    } finally {
      if (ensureRunIdRef.current === runId) setProjectStarting(false);
      if (_ensuringProject === projectId) _ensuringProject = null;
    }
  }, []);

  useEffect(() => {
    const proj = SIMULATOR_PROJECTS.find((x) => x.id === project);
    if (proj && proj.port !== 8080) {
      if (_ensuringProject && _ensuringProject !== project) _ensuringProject = null;
      ensureProjectRunning(project);
    } else {
      _ensuringProject = null;
      setArrowReady(true);
    }
  }, [project, ensureProjectRunning]);

  // 自定义端口：轮询直到可访问
  const customPortNum = customPort ? parseInt(customPort, 10) : 0;
  const isValidCustomPort = customPortNum >= 1 && customPortNum <= 65535;
  useEffect(() => {
    if (!isValidCustomPort) {
      setCustomPortReady(false);
      return;
    }
    let cancelled = false;
    setCustomPortReady(false);
    (async () => {
      for (let i = 0; i < 30 && !cancelled; i++) {
        try {
          await fetch(`http://127.0.0.1:${customPortNum}/`, { cache: 'no-store' });
          if (!cancelled) setCustomPortReady(true);
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customPortNum, isValidCustomPort]);

  const simUrl =
    typeof window !== 'undefined'
      ? (() => {
          const p = new URLSearchParams(window.location.search);
          p.set('simulator', '1');
          p.delete('enableSimulator');
          p.delete('simW');
          p.delete('simH');
          p.delete('simScale');
          if (lang) p.set('lang', lang);
          else p.delete('lang');
          const qs = p.toString();
          if (isValidCustomPort) {
            return customPortReady
              ? `http://127.0.0.1:${customPortNum}/?${qs}`
              : 'about:blank';
          }
          const proj = SIMULATOR_PROJECTS.find((x) => x.id === project);
          const useAlt = proj && proj.port !== 8080;
          const url = useAlt
            ? arrowReady
              ? `http://127.0.0.1:${proj!.port}/?${qs}`
              : 'about:blank'
            : `${window.location.origin}${window.location.pathname || '/'}?${qs}`;
          return url;
        })()
      : '#';

  if (!showSimulator) {
    return (
      <>
        {children}
        {import.meta.env.DEV && !isSimulatorView && (
          <a
            href={
              typeof window !== 'undefined'
                ? (() => {
                    const p = new URLSearchParams(window.location.search);
                    p.set('enableSimulator', '1');
                    return window.location.pathname + '?' + p.toString();
                  })()
                : '#'
            }
            className="simulator-entry-btn"
            title="Open device simulator"
          >
            📱 Simulator
          </a>
        )}
      </>
    );
  }

  return (
    <div className="device-simulator">
      <div className="device-simulator-toolbar">
        <label>
          W <input type="number" value={width} onChange={(e) => setWidth(Number(e.target.value) || 390)} min={200} max={2400} />
        </label>
        <label>
          H <input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value) || 844)} min={200} max={2400} />
        </label>
        <button type="button" onClick={rotate} className="sim-rotate-btn" title="Rotate">
          ↻ Rotate
        </button>
        <label className="sim-scale">
          Scale <input type="range" min={0.2} max={1} step={0.05} value={scale} onChange={(e) => setScale(Number(e.target.value))} />
          <span>{Math.round(scale * 100)}%</span>
        </label>
        <label className="sim-lang">
          Lang <select value={lang} onChange={(e) => setLang(e.target.value)} title="Simulate browser language">
            {LANG_OPTIONS.map((o) => (
              <option key={o.value || 'browser'} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="sim-project">
          Project{' '}
          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            title="切换 playable 项目，选 arrow playable--拖动进度优化 时自动启动"
          >
            {SIMULATOR_PROJECTS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          {projectStarting && <span className="sim-project-starting">启动中…</span>}
        </label>
        <label className="sim-port" title="输入端口号加载 http://127.0.0.1:PORT，留空则使用 Project">
          Port{' '}
          <input
            type="number"
            value={customPort}
            onChange={(e) => setCustomPort(e.target.value)}
            placeholder="8080"
            min={1}
            max={65535}
            title="输入端口号，加载 http://127.0.0.1:PORT"
          />
          {isValidCustomPort && !customPortReady && <span className="sim-project-starting">检测中…</span>}
        </label>
        <div className="sim-presets">
          {PRESETS.map((p) => (
            <button key={p.name} type="button" onClick={() => applyPreset(p.w, p.h)} className="sim-preset-btn">
              {p.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            const w = window.open(simUrl, 'simulator', `width=${width + 40},height=${height + 80},resizable=yes`);
            w?.focus();
          }}
          className="sim-popup-btn"
        >
          Open in new window
        </button>
        <a
          href={
            (() => {
              const p = new URLSearchParams(window.location.search);
              p.delete('simulator');
              p.delete('enableSimulator');
              p.delete('simW');
              p.delete('simH');
              p.delete('simScale');
              p.delete('simLang');
              const qs = p.toString();
              return (typeof window !== 'undefined' ? window.location.origin + (window.location.pathname || '/') : '') + (qs ? '?' + qs : '');
            })()
          }
          className="sim-fullscreen-link"
          target="_blank"
          rel="noreferrer"
        >
          Open full screen ↗
        </a>
        <button
          type="button"
          onClick={() => setShowConstantsEditor((v) => !v)}
          className={`sim-constants-btn ${showConstantsEditor ? 'is-active' : ''}`}
          title="数值编辑"
        >
          {showConstantsEditor ? '✕ 关闭' : '⚙ 数值编辑'}
        </button>
        <button
          type="button"
          className={`sim-fix-puzzle-btn ${fixedPuzzleActive ? 'is-active' : ''} ${fixingPuzzle ? 'is-loading' : ''}`}
          title="随机更新 3 个关卡（难度 1/5/9），游戏永远使用固定关卡"
          disabled={fixingPuzzle}
          onClick={async () => {
            setFixingPuzzle(true);
            setFixProgress({ step: 'generate', elapsed: 0 });
            try {
              const emptyTubeCount = Math.max(1, Math.min(6, await getOutputConfigValueAsync<number>('emptyTubeCount', 2)));
              const difficulties = [1, 5, 9];
              const items = difficulties.map((d) => {
                const puzzle = generatePuzzleWithAdapter({ difficulty: d, emptyTubeCount });
                return { puzzle, difficulty: d, emptyTubeCount };
              });
              const configRes = await fetch('/api/constants');
              const config = configRes.ok ? await configRes.json() : {};
              const fixedPuzzles: Record<string, unknown> = {};
              for (const item of items) {
                fixedPuzzles[String(item.difficulty)] = item;
              }
              config.FIXED_PUZZLES = fixedPuzzles;
              await fetch('/api/constants', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
              });
              setFixedPuzzleActive(true);
              reloadIframe();
              setFixProgress({ step: 'screenshot', elapsed: 0 });
              const screenshots = await captureLevelScreenshots((step, elapsed) => {
                setFixProgress((p) => (p ? { step, elapsed: elapsed ?? p.elapsed } : { step, elapsed: elapsed ?? 0 }));
              });
              if (Object.keys(screenshots).length > 0) {
                const configRes2 = await fetch('/api/constants');
                const config2 = configRes2.ok ? await configRes2.json() : {};
                const ssMap: Record<string, string> = {};
                for (const [k, v] of Object.entries(screenshots)) {
                  if (typeof v === 'string') ssMap[k] = v;
                }
                config2.LEVEL_PREVIEW_SCREENSHOTS = ssMap;
                await fetch('/api/constants', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(config2),
                });
                iframeRef.current?.contentWindow?.postMessage({ type: 'level-screenshots-updated' }, '*');
              }
            } finally {
              setFixingPuzzle(false);
              setFixProgress(null);
            }
          }}
        >
          {fixingPuzzle ? (
            <span className="sim-fix-puzzle-progress">
              <span className="sim-fix-puzzle-text">
                {fixProgress?.step === 'generate' && '生成关卡…'}
                {fixProgress?.step === 'screenshot' && `截图中… ${fixProgress.elapsed}s`}
                {fixProgress?.step === 'done' && '完成'}
              </span>
              {fixProgress?.step === 'screenshot' && (
                <span
                  className="sim-fix-puzzle-bar"
                  style={{ width: `${Math.min(95, (fixProgress.elapsed / 12) * 100)}%` }}
                />
              )}
            </span>
          ) : (
            '🎲 随机更新3关'
          )}
        </button>
        <button
          type="button"
          className="sim-cv-download-btn"
          title="下载当前游戏画面截图"
          onClick={() => {
            try {
              const doc = iframeRef.current?.contentDocument;
              const canvas = doc?.querySelector('#game-container canvas') as HTMLCanvasElement | null;
              if (!canvas) return;
              const dataUrl = canvas.toDataURL('image/png');
              const a = document.createElement('a');
              a.href = dataUrl;
              a.download = `screenshot-${Date.now()}.png`;
              a.style.display = 'none';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            } catch (e) {
              console.warn('[Simulator] Screenshot failed:', e);
            }
          }}
        >
          ⬇ 下载截图
        </button>
        <span
          className="sim-icon-debug"
          data-testid="icon-debug"
          role="status"
          data-in-bounds={iconDebug ? String(iconDebug.inBounds) : 'pending'}
          aria-label={iconDebug ? `Icon debug inBounds ${iconDebug.inBounds}` : 'Icon debug waiting for game'}
        >
          {iconDebug
            ? `Icon: (${Math.round(iconDebug.iconRect.x)},${Math.round(iconDebug.iconRect.y)}) ${Math.round(iconDebug.iconRect.w)}×${Math.round(iconDebug.iconRect.h)} | Visible: (${Math.round(iconDebug.visibleRect.x)},${Math.round(iconDebug.visibleRect.y)}) ${Math.round(iconDebug.visibleRect.width)}×${Math.round(iconDebug.visibleRect.height)} | inBounds: ${String(iconDebug.inBounds)}`
            : 'icon-debug: waiting'}
        </span>
        {/* CV 录制功能已暂时注释：Play/Pause/End 和 Download CV Frame 按钮 */}
        {/* {isCVMode && <CVRecordControls iframeRef={iframeRef} />} */}
        {/* {isCVMode && (
          <button
            type="button"
            className="sim-cv-download-btn"
            title="Download the exact pixel frame the game sends to CV"
            onClick={() => iframeRef.current?.contentWindow?.postMessage({ type: 'cv-capture-frame' }, '*')}
          >
            ⬇ Download CV Frame
          </button>
        )} */}
      </div>
      <div className={`device-simulator-body ${showConstantsEditor ? 'has-editor' : ''}`}>
        <div className="device-simulator-frame">
          <div
            className="device-simulator-iframe-wrapper"
            style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
          >
            <iframe
              ref={iframeRef}
              key={simUrl}
              src={simUrl}
              title="Device simulator"
              style={{ width: width, height: height }}
              className="device-simulator-iframe"
              allow="autoplay"
            />
          </div>
        </div>
        {showConstantsEditor && (
          <div className="device-simulator-editor">
            <ConstantsEditor />
          </div>
        )}
      </div>
    </div>
  );
}
