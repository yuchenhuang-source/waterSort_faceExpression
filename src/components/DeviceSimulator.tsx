import React, { useState, useCallback, useEffect } from 'react';
import './DeviceSimulator.css';

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

function readSimConfigFromUrl(): { w: number; h: number; scale: number } {
  if (typeof window === 'undefined') return { w: 390, h: 844, scale: 0.5 };
  const p = new URLSearchParams(window.location.search);
  const w = Math.min(2400, Math.max(200, parseInt(p.get('simW') || '390', 10) || 390));
  const h = Math.min(2400, Math.max(200, parseInt(p.get('simH') || '844', 10) || 844));
  const scale = Math.min(1, Math.max(0.2, parseFloat(p.get('simScale') || '0.5') || 0.5));
  return { w, h, scale };
}

export function DeviceSimulator({ children }: { children: React.ReactNode }) {
  const initial = typeof window !== 'undefined' ? readSimConfigFromUrl() : { w: 390, h: 844, scale: 0.5 };
  const [width, setWidth] = useState(initial.w);
  const [height, setHeight] = useState(initial.h);
  const [scale, setScale] = useState(initial.scale);

  const search = typeof window !== 'undefined' ? window.location.search : '';
  const urlParams = new URLSearchParams(search);
  const isSimulatorView = urlParams.get('simulator') === '1';
  const showSimulator = import.meta.env.DEV && (urlParams.get('enableSimulator') === '1' || (isDesktop() && !isSimulatorView));

  useEffect(() => {
    if (!showSimulator || typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    p.set('simW', String(width));
    p.set('simH', String(height));
    p.set('simScale', String(scale));
    const qs = p.toString();
    window.history.replaceState({}, '', `${window.location.pathname || '/'}${qs ? '?' + qs : ''}`);
  }, [showSimulator, width, height, scale]);

  const rotate = useCallback(() => {
    setWidth((w) => height);
    setHeight((h) => width);
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
      </div>
      <div className="device-simulator-frame">
        <div
          className="device-simulator-iframe-wrapper"
          style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
        >
          <iframe
            src={simUrl}
            title="Device simulator"
            style={{ width: width, height: height }}
            className="device-simulator-iframe"
            allow="autoplay"
          />
        </div>
      </div>
    </div>
  );
}
