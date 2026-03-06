import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ConstantsEditor } from './ConstantsEditor';
import CVRecordControls from './CVRecordControls';
import type { ColorMap } from '../game/render/ObjectIdPipeline';
import './DeviceSimulator.css';

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

function readSimConfigFromUrl(): { w: number; h: number; scale: number; lang: string } {
  if (typeof window === 'undefined') return { w: 390, h: 844, scale: 0.5, lang: '' };
  const p = new URLSearchParams(window.location.search);
  const w = Math.min(2400, Math.max(200, parseInt(p.get('simW') || '390', 10) || 390));
  const h = Math.min(2400, Math.max(200, parseInt(p.get('simH') || '844', 10) || 844));
  const scale = Math.min(1, Math.max(0.2, parseFloat(p.get('simScale') || '0.5') || 0.5));
  const lang = p.get('simLang') || '';
  return { w, h, scale, lang };
}

export function DeviceSimulator({ children }: { children: React.ReactNode }) {
  const initial = typeof window !== 'undefined' ? readSimConfigFromUrl() : { w: 390, h: 844, scale: 0.5, lang: '' };
  const [width, setWidth] = useState(initial.w);
  const [height, setHeight] = useState(initial.h);
  const [scale, setScale] = useState(initial.scale);
  const [lang, setLang] = useState(initial.lang);
  const [showConstantsEditor, setShowConstantsEditor] = useState(true);
  const [iconDebug, setIconDebug] = useState<{ visibleRect: { x: number; y: number; width: number; height: number }; iconRect: { x: number; y: number; w: number; h: number }; inBounds: boolean } | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const search = typeof window !== 'undefined' ? window.location.search : '';
  const urlParams = new URLSearchParams(search);
  const isSimulatorView = urlParams.get('simulator') === '1';
  const showSimulator = import.meta.env.DEV && (urlParams.get('enableSimulator') === '1' || (isDesktop() && !isSimulatorView));
  const isCVMode = urlParams.get('cv') === '1';

  useEffect(() => {
    if (!showSimulator || typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    p.set('simW', String(width));
    p.set('simH', String(height));
    p.set('simScale', String(scale));
    if (lang) p.set('simLang', lang);
    else p.delete('simLang');
    const qs = p.toString();
    window.history.replaceState({}, '', `${window.location.pathname || '/'}${qs ? '?' + qs : ''}`);
  }, [showSimulator, width, height, scale, lang]);

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
      if (e.data?.type === 'cv-record-export-complete' && typeof e.data.summary === 'string') {
        console.log('[CV-RECORD] export completed (from iframe)', e.data.summary);
      }
      if (e.data?.type === 'cv-record-debug') {
        console.log('[CV-RECORD] debug (from iframe)', e.data.msg, e.data.connected);
      }
      if (e.data?.type === 'cv-frame-data' && e.data.pixels && e.data.width && e.data.height) {
        downloadCVFrameAsPng(e.data as { pixels: string; width: number; height: number; colorMap: ColorMap });
      }
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
          return `${window.location.origin}${window.location.pathname || '/'}?${p.toString()}`;
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
        {isCVMode && <CVRecordControls iframeRef={iframeRef} />}
        {isCVMode && (
          <button
            type="button"
            className="sim-cv-download-btn"
            title="Download the exact pixel frame the game sends to CV"
            onClick={() => iframeRef.current?.contentWindow?.postMessage({ type: 'cv-capture-frame' }, '*')}
          >
            ⬇ Download CV Frame
          </button>
        )}
      </div>
      <div className={`device-simulator-body ${showConstantsEditor ? 'has-editor' : ''}`}>
        <div className="device-simulator-frame">
          <div
            className="device-simulator-iframe-wrapper"
            style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
          >
            <iframe
              ref={iframeRef}
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
