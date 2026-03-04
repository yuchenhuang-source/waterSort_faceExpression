import React, { useCallback, useEffect, useRef, useState } from 'react';
import './ConstantsEditor.css';

const CATEGORIES: Record<string, string[]> = {
  '通用': ['playIntroVideo'],
  '箭头': ['arrow.defaultColor', 'arrow.straightArrowDefaultColor', 'arrow.straightArrowDefaultLength', 'arrow.minLength', 'arrow.maxLength'],
  '下载': ['download.triggerByClearCount', 'download.clearCountThreshold', 'download.triggerByProgress', 'download.progressThreshold', 'download.triggerByAreaProgress', 'download.areaProgressThreshold', 'download.autoJumpDelay'],
};

const CURSOR_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab', 'Shift', 'Control', 'Alt', 'Meta', 'Escape'];

function getValueByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (let i = 0; i < parts.length; i++) {
    cur = (cur as Record<string, unknown>)?.[parts[i]];
    if (cur === undefined) return undefined;
  }
  return cur;
}

function getByPath(obj: Record<string, unknown>, path: string): [Record<string, unknown>, string] {
  const parts = path.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur = (cur[parts[i]] as Record<string, unknown>) ?? {};
  }
  return [cur, parts[parts.length - 1] ?? ''];
}

function setByPath(obj: Record<string, unknown>, path: string, val: string): void {
  const [parent, key] = getByPath(obj, path);
  if (val === 'true') {
    parent[key] = true;
    return;
  }
  if (val === 'false') {
    parent[key] = false;
    return;
  }
  const num = parseFloat(val);
  if (isNaN(num)) {
    parent[key] = val;
    return;
  }
  if (val === '' || val === '-' || val.endsWith('.') || String(num) !== val) {
    parent[key] = val;
    return;
  }
  parent[key] = num;
}

function normalizeForSave(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    if (obj === 'true') return true;
    if (obj === 'false') return false;
    const num = parseFloat(obj);
    return isNaN(num) ? obj : num;
  }
  if (Array.isArray(obj)) return obj.map(normalizeForSave);
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const k in obj as Record<string, unknown>) {
      out[k] = normalizeForSave((obj as Record<string, unknown>)[k]);
    }
    return out;
  }
  return obj;
}

interface FieldRowProps {
  label: string;
  path: string;
  value: unknown;
  onChange: (path: string, value: string) => void;
  onBlurOrEnter: () => void;
}

function FieldRow({ label, path, value, onChange, onBlurOrEnter }: FieldRowProps) {
  const type = typeof value;
  const val = type === 'number' ? String(value) : type === 'boolean' ? (value ? 'true' : 'false') : String(value ?? '');
  return (
    <div className="constants-editor-row">
      <label>{label}</label>
      <input
        type="text"
        inputMode={type === 'number' ? 'decimal' : undefined}
        value={val}
        onChange={(e) => onChange(path, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Tab') {
            onBlurOrEnter();
            return;
          }
          if (CURSOR_KEYS.includes(e.key)) return;
          onChange(path, (e.target as HTMLInputElement).value);
        }}
        onBlur={(e) => {
          const target = e.relatedTarget as HTMLElement | null;
          if (target && e.currentTarget.closest('.constants-editor')?.contains(target)) {
            return;
          }
          onBlurOrEnter();
        }}
      />
    </div>
  );
}

function renderNested(
  obj: Record<string, unknown>,
  path: string,
  onChange: (path: string, value: string) => void,
  onBlurOrEnter: () => void
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  for (const k in obj) {
    const v = obj[k];
    const p = path ? path + '.' + k : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out.push(
        <div key={p} className="constants-editor-section">
          <h2>{k}</h2>
          {renderNested(v as Record<string, unknown>, p, onChange, onBlurOrEnter)}
        </div>
      );
    } else {
      out.push(<FieldRow key={p} label={k} path={p} value={v} onChange={onChange} onBlurOrEnter={onBlurOrEnter} />);
    }
  }
  return out;
}

export function ConstantsEditor() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [buildLoading, setBuildLoading] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const dataRef = useRef<Record<string, unknown> | null>(null);
  dataRef.current = data;

  const load = useCallback(async () => {
    setLoading(true);
    setStatus(null);
    try {
      const r = await fetch('/api/constants');
      if (!r.ok) throw new Error(r.statusText);
      const json = await r.json();
      // 检测是否误连到 ballsort 的配置（GAME_CONFIG 为 ballsort 独有）
      if (json && 'GAME_CONFIG' in json) {
        setStatus({
          type: 'err',
          text: '配置格式错误：当前连接到了 Ballsort 的编辑服务。请关闭 Ballsort 的 dev server（npm run dev:ballsort），仅运行 npm run dev:arrow-playable。',
        });
        setData(null);
      } else {
        setData(json);
      }
    } catch (e) {
      setStatus({ type: 'err', text: `加载失败: ${(e as Error).message}。请先运行 npm run dev-tools 启动数值编辑服务。` });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async (dispatchReload = false) => {
    const toSave = dataRef.current;
    if (!toSave) return;
    try {
      const r = await fetch('/api/constants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizeForSave(toSave)),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setStatus({ type: 'ok', text: dispatchReload ? '已保存，游戏页热更新中…' : '已自动保存' });
      if (dispatchReload) {
        window.dispatchEvent(new CustomEvent('constants-saved'));
      }
    } catch (e) {
      setStatus({ type: 'err', text: `保存失败: ${(e as Error).message}` });
    }
  }, [data]);

  const saveAndReloadIframe = useCallback(async () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    await save(true);
  }, [save]);

  const handleChange = useCallback(
    (path: string, value: string) => {
      if (!data) return;
      const next = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
      setByPath(next, path, value);
      dataRef.current = next;
      setData(next);
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        save(false);
      }, 300);
    },
    [data, save]
  );

  const handleBuild = useCallback(async () => {
    setBuildLoading(true);
    setStatus({ type: 'ok', text: '正在 build...' });
    try {
      const r = await fetch('/api/build', { method: 'POST' });
      if (!r.ok) {
        const j = await r.json();
        throw new Error(j.error || r.statusText);
      }
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'index.html';
      a.click();
      URL.revokeObjectURL(a.href);
      setStatus({ type: 'ok', text: 'Build 完成，已开始下载 index.html' });
    } catch (e) {
      setStatus({ type: 'err', text: `Build 失败: ${(e as Error).message}` });
    }
    setBuildLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="constants-editor">
        <div className="constants-editor-loading">加载中…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="constants-editor">
        <div className="constants-editor-error">
          <p>{status?.text}</p>
          <button type="button" onClick={load} className="constants-editor-retry">
            重试
          </button>
        </div>
      </div>
    );
  }

  const used = new Set<string>();
  const sections: React.ReactNode[] = [];

  for (const cat in CATEGORIES) {
    const keys = CATEGORIES[cat].filter((k) => getValueByPath(data, k) !== undefined);
    if (keys.length === 0) continue;
    keys.forEach((k) => used.add(k));
    const rows = keys.map((k) => {
      const v = getValueByPath(data, k);
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        return renderNested(v as Record<string, unknown>, k, handleChange, saveAndReloadIframe);
      }
      return <FieldRow key={k} label={k} path={k} value={v} onChange={handleChange} onBlurOrEnter={saveAndReloadIframe} />;
    });
    sections.push(
      <div key={cat} className="constants-editor-section">
        <h2>{cat}</h2>
        {rows}
      </div>
    );
  }

  const otherKeys: string[] = [];
  for (const k in data) {
    if (used.has(k)) continue;
    const v = data[k];
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      sections.push(
        <div key={k} className="constants-editor-section">
          <h2>{k}</h2>
          {renderNested(v as Record<string, unknown>, k, handleChange, saveAndReloadIframe)}
        </div>
      );
      used.add(k);
    } else {
      otherKeys.push(k);
    }
  }
  if (otherKeys.length > 0) {
    sections.push(
      <div key="_other" className="constants-editor-section">
        <h2>其他</h2>
        {otherKeys.map((k) => (
          <FieldRow key={k} label={k} path={k} value={data[k]} onChange={handleChange} onBlurOrEnter={saveAndReloadIframe} />
        ))}
      </div>
    );
  }

  return (
    <div className="constants-editor">
      <div className="constants-editor-header">
        <h1>Arrow 配置编辑器</h1>
        <span className="constants-editor-hint">修改后自动保存；离开输入框或按 Enter 时热更新游戏</span>
      </div>
      <div className="constants-editor-actions">
        <button
          type="button"
          onClick={handleBuild}
          disabled={buildLoading}
          className="constants-editor-build-btn"
        >
          {buildLoading ? '构建中…' : 'npm run build 并下载'}
        </button>
      </div>
      <div className="constants-editor-form">{sections}</div>
      {status && (
        <div className={`constants-editor-status ${status.type}`}>{status.text}</div>
      )}
    </div>
  );
}
