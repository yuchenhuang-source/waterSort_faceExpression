const WS_URL = 'ws://localhost:8765';
const frameEl = document.getElementById('frame');

/** 从游戏 map 或 fallback 解析标签 */
function resolveLabel(id, idToLabelMap) {
  if (idToLabelMap && idToLabelMap[String(id)] != null) return idToLabelMap[String(id)];
  if (id < 100) return `tube${id + 1}`;
  if (id >= 100 && id < 500) return `ball_${id}`;
  if (id === 500) return 'hand';
  if (id === 501) return 'icon';
  if (id === 502) return 'download';
  if (id === 1000) return 'liquid';
  if (id === 1001) return 'expression';
  return `id${id}`;
}
/** 按标签前缀分类：tube/试管→tube, ball/球→ball */
function getTypeFromLabel(label) {
  if (!label) return 'other';
  const l = label.toLowerCase();
  if (l.startsWith('tube') || label.startsWith('试管')) return 'tube';
  if (l.startsWith('ball') || label.startsWith('球')) return 'ball';
  if (l === 'hand') return 'hand';
  if (['icon', 'download', 'liquid', 'expression'].includes(l)) return 'button';
  return 'other';
}
const overlayEl = document.getElementById('overlay');
const statusEl = document.getElementById('status');
const statsEl = document.getElementById('stats');
const detectionsEl = document.getElementById('detections');

let ws = null;
let frameCount = 0;
let overlayVisible = true;
// Sticky frame diffs: { id: { label, dx, dy, dist, dArea, framesAtZero } }
let trackedDiffs = {};

function formatMoveDesc(dx, dy) {
  if (dx === 0 && dy === 0) return '—';
  const dist = Math.sqrt(dx * dx + dy * dy).toFixed(1);
  const left = dx < 0;
  const right = dx > 0;
  const up = dy < 0;
  const down = dy > 0;
  let dir = '';
  if (up && left) dir = '左上移';
  else if (up && right) dir = '右上移';
  else if (down && left) dir = '左下移';
  else if (down && right) dir = '右下移';
  else if (left) dir = '左移';
  else if (right) dir = '右移';
  else if (up) dir = '上移';
  else if (down) dir = '下移';
  return `${dir} ${dist}（距离）`;
}

function formatAreaDesc(dArea, prevArea) {
  if (dArea === 0 || prevArea == null || prevArea <= 0) return '—';
  const pct = Math.abs((dArea / prevArea) * 100).toFixed(1);
  return dArea > 0 ? `变大 ${pct}%` : `变小 ${pct}%`;
}

function getPos(obj) {
  const b = obj.bbox;
  if (b && (b.w > 0 || b.h > 0)) {
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }
  return { x: obj.x ?? 0, y: obj.y ?? 0 };
}

const toggleBtn = document.getElementById('toggle-overlay');
if (toggleBtn) {
  toggleBtn.addEventListener('click', () => {
    overlayVisible = !overlayVisible;
    overlayEl.style.display = overlayVisible ? '' : 'none';
    toggleBtn.textContent = overlayVisible ? '隐藏检测框' : '显示检测框';
    toggleBtn.classList.toggle('inactive', !overlayVisible);
  });
}

function setStatus(connected) {
  statusEl.textContent = connected ? 'Connected' : 'Disconnected';
  statusEl.className = 'status ' + (connected ? 'connected' : 'disconnected');
}

function connect() {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => setStatus(true);
  ws.onclose = () => {
    setStatus(false);
    setTimeout(connect, 2000);
  };
  ws.onerror = () => {};
  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data.type === 'frame_processed') {
        frameCount++;
        const frame = data.frame;
        const detections = data.detections || {};
        const rawObjects = detections.objects || [];
        const idToLabelMap = detections.idToLabel || {};
        const withLabel = rawObjects.map(o => ({ ...o, label: resolveLabel(o.id, idToLabelMap) }));
        const tubes = withLabel.filter(o => getTypeFromLabel(o.label) === 'tube');
        const balls = withLabel.filter(o => getTypeFromLabel(o.label) === 'ball').map(o => ({
          ...o,
          tubeId: /ball_(\d+)/.exec(o.label)?.[1] ?? '-',
          index: '-'
        }));
        const hand = withLabel.find(o => getTypeFromLabel(o.label) === 'hand' || o.id === 500) || null;
        const buttons = withLabel.filter(o => getTypeFromLabel(o.label) === 'button');
        const tubeLabels = tubes.map(t => t.label).join(', ');
        const ballLabels = balls.map(b => b.label).join(', ');
        if (frame) {
          const src = frame.startsWith('data:') ? frame : 'data:image/jpeg;base64,' + frame;
          frameEl.src = src;
          frameEl.onload = () => {
            overlayEl.onload = () => {
              // Now matching visual size with CSS scaling
              overlayEl.style.width = frameEl.clientWidth + 'px';
              overlayEl.style.height = frameEl.clientHeight + 'px';
            };
            // Set canvas logical size to match frame's natural size
            overlayEl.width = frameEl.naturalWidth;
            overlayEl.height = frameEl.naturalHeight;
            // Position canvas CSS to exactly match the displayed img position and size
            // (img is centered via flexbox with object-fit:contain; canvas must overlay it exactly)
            overlayEl.style.left = frameEl.offsetLeft + 'px';
            overlayEl.style.top = frameEl.offsetTop + 'px';
            overlayEl.style.width = frameEl.clientWidth + 'px';
            overlayEl.style.height = frameEl.clientHeight + 'px';
            // coordScale: Python returns coords in original game space; canvas is in downsampled space
            const coordScale = detections.frameSize?.coordScale ?? 1;
            const s = 1 / coordScale; // factor to convert game coords -> canvas coords
            const ctx = overlayEl.getContext('2d');
            ctx.clearRect(0, 0, overlayEl.width, overlayEl.height);
            // Phase 3: draw detection boxes (scale coords from game space to canvas space)
            // Helper: draw bbox or fallback to fixed-size rect at center
            const drawObj = (obj, strokeColor, fillColor, label, fallbackSize) => {
              const p = getPos(obj);
              const cx = p.x * s, cy = p.y * s;
              const b = obj.bbox;
              if (b && b.w > 0 && b.h > 0) {
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = 2;
                ctx.strokeRect(b.x * s, b.y * s, b.w * s, b.h * s);
              } else {
                const half = (fallbackSize || 8);
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = 2;
                ctx.strokeRect(cx - half, cy - half, half * 2, half * 2);
              }
              ctx.fillStyle = fillColor;
              ctx.font = '12px monospace';
              ctx.fillText(label, cx - 6, cy + 4);
            };
            tubes.forEach(t => drawObj(t, '#0f0', '#0f0', t.label, 8));
            balls.forEach(b => drawObj(b, '#f80', '#f80', b.label, 8));
            if (hand) {
              const b = hand.bbox;
              const p = getPos(hand);
              const cx = p.x * s, cy = p.y * s;
              if (b && b.w > 0 && b.h > 0) {
                ctx.strokeStyle = '#0ff';
                ctx.lineWidth = 3;
                ctx.strokeRect(b.x * s, b.y * s, b.w * s, b.h * s);
              } else {
                ctx.strokeStyle = '#0ff';
                ctx.lineWidth = 3;
                ctx.strokeRect(cx - 12, cy - 12, 24, 24);
              }
              ctx.fillStyle = '#0ff';
              ctx.font = '13px monospace';
              ctx.fillText(hand.label, cx - 14, cy - 14);
            }
            buttons.forEach(btn => {
              const b = btn.bbox;
              const p = getPos(btn);
              const cx = p.x * s, cy = p.y * s;
              if (b && b.w > 0 && b.h > 0) {
                ctx.strokeStyle = '#f0f';
                ctx.lineWidth = 2;
                ctx.strokeRect(b.x * s, b.y * s, b.w * s, b.h * s);
              } else {
                ctx.strokeStyle = '#f0f';
                ctx.lineWidth = 2;
                ctx.strokeRect(cx - 10, cy - 10, 20, 20);
              }
              ctx.fillStyle = '#f0f';
              ctx.font = '12px monospace';
              ctx.fillText(btn.label || resolveLabel(btn.id, idToLabelMap), cx - 10, cy - 12);
            });
          };
        }
        statsEl.textContent = `Frames: ${frameCount}\nProcessing: ${detections.processingMs ?? '-'} ms`;
        const summaryEl = document.getElementById('detection-summary');
        if (summaryEl) {
          const handStr = hand ? ` | 手 (${getPos(hand).x.toFixed(0)},${getPos(hand).y.toFixed(0)})` : '';
          const btnStr = buttons.length > 0 ? ` | 按钮 [${buttons.map(b=>b.label || resolveLabel(b.id, idToLabelMap)).join(',')}]` : '';
          summaryEl.textContent = `检测到: ${tubes.length} 个试管 [${tubeLabels || '-'}], ${balls.length} 个球 [${ballLabels || '-'}]${handStr}${btnStr}`;
        }
        const listEl = document.getElementById('detection-list');
        if (listEl) {
          listEl.innerHTML = '';
          const rawDiffs = detections.frameDiffs || [];
          const idToArea = new Map();
          [...(tubes || []), ...(balls || []), ...(buttons || []), ...(hand ? [hand] : [])].forEach(o => {
            const b = o.bbox;
            if (b && (b.w || b.h)) idToArea.set(o.id, (b.w || 0) * (b.h || 0));
          });
          const a = Math.max(1, parseInt(document.getElementById('diff-retain-frames')?.value || '5', 10) || 5);
          const posInput = document.getElementById('threshold-pos');
          const areaInput = document.getElementById('threshold-area');
          const thresholdPos = (v => (Number.isNaN(v) || v < 0 ? 2 : v))(parseFloat(posInput?.value ?? '2'));
          const thresholdArea = (v => (Number.isNaN(v) || v < 0 ? 10 : v))(parseFloat(areaInput?.value ?? '10'));
          const significantDiffs = rawDiffs.filter(d => {
            const dist = d.dist ?? Math.sqrt((d.dx ?? 0) ** 2 + (d.dy ?? 0) ** 2);
            return dist >= thresholdPos || Math.abs(d.dArea ?? 0) >= thresholdArea;
          });
          const significantIds = new Set(significantDiffs.map(d => d.id));
          significantDiffs.forEach(d => {
            trackedDiffs[d.id] = { ...d, framesAtZero: 0 };
          });
          Object.keys(trackedDiffs).map(Number).forEach(id => {
            if (!significantIds.has(id)) {
              trackedDiffs[id].framesAtZero = (trackedDiffs[id].framesAtZero || 0) + 1;
              if (trackedDiffs[id].framesAtZero >= a) delete trackedDiffs[id];
            }
          });
          const entries = Object.entries(trackedDiffs);
          if (entries.length > 0) {
            const group = document.createElement('div');
            group.className = 'detection-group';
            const h3 = document.createElement('h3');
            h3.textContent = `Frame Diffs (a=${a} pos≥${thresholdPos} area≥${thresholdArea}) (${entries.length})`;
            group.appendChild(h3);
            entries.forEach(([, d]) => {
              const row = document.createElement('div');
              row.className = 'detection-capsule detection-capsule-diff';
              row.style.color = '#fff';
              const dxVal = d.framesAtZero === 0 ? (d.dx ?? 0) : 0;
              const dyVal = d.framesAtZero === 0 ? (d.dy ?? 0) : 0;
              const areaVal = d.framesAtZero === 0 ? (d.dArea ?? 0) : 0;
              let prevArea = d.prevArea;
              if (prevArea == null || prevArea <= 0) {
                const currArea = idToArea.get(d.id);
                if (currArea != null && currArea > 0 && areaVal !== 0) prevArea = currArea - areaVal;
              }
              prevArea = prevArea ?? 0;
              const dist = d.dist ?? Math.sqrt(dxVal * dxVal + dyVal * dyVal);
              const moveStr = formatMoveDesc(dxVal, dyVal);
              const areaStr = formatAreaDesc(areaVal, prevArea);
              const moveCls = (dxVal !== 0 || dyVal !== 0) && dist >= thresholdPos ? ' diff-val-changed' : '';
              const areaCls = areaVal !== 0 && Math.abs(areaVal) >= thresholdArea ? ' diff-val-changed' : '';
              row.innerHTML = `<span class="diff-label">${d.label ?? resolveLabel(d.id, idToLabelMap)}</span><span class="diff-cell${moveCls}">${moveStr}</span><span class="diff-cell${areaCls}">${areaStr}</span>`;
              group.appendChild(row);
            });
            listEl.appendChild(group);
          }
          if (tubes.length > 0) {
            const group = document.createElement('div');
            group.className = 'detection-group';
            const h3 = document.createElement('h3');
            h3.textContent = `Tubes (${tubes.length})`;
            group.appendChild(h3);
            tubes.forEach(t => {
              const item = document.createElement('span');
              item.className = 'detection-capsule tube';
              const bboxStr = t.bbox ? ` [${t.bbox.w}×${t.bbox.h}]` : '';
              const pt = getPos(t);
              item.textContent = `${t.label} (${pt.x?.toFixed(1) ?? '-'}, ${pt.y?.toFixed(1) ?? '-'})${bboxStr}`;
              group.appendChild(item);
            });
            listEl.appendChild(group);
          }
          if (balls.length > 0) {
            const group = document.createElement('div');
            group.className = 'detection-group';
            const h3 = document.createElement('h3');
            h3.textContent = `Balls (${balls.length})`;
            group.appendChild(h3);
            balls.forEach(b => {
              const item = document.createElement('span');
              item.className = 'detection-capsule ball';
              const bboxStr = b.bbox ? ` [${b.bbox.w}×${b.bbox.h}]` : '';
              const pb = getPos(b);
              item.textContent = `${b.label} [${b.tubeId ?? '-'}:${b.index ?? '-'}] (${pb.x?.toFixed(1) ?? '-'}, ${pb.y?.toFixed(1) ?? '-'})${bboxStr}`;
              group.appendChild(item);
            });
            listEl.appendChild(group);
          }
          if (hand) {
            const group = document.createElement('div');
            group.className = 'detection-group';
            const h3 = document.createElement('h3');
            h3.textContent = 'Hand';
            group.appendChild(h3);
            const item = document.createElement('span');
            item.className = 'detection-capsule';
            item.style.background = '#0cc';
            const handBboxStr = hand.bbox ? ` [${hand.bbox.w}×${hand.bbox.h}]` : '';
            const ph = getPos(hand);
            item.textContent = `${hand.label} (${ph.x?.toFixed(1) ?? '-'}, ${ph.y?.toFixed(1) ?? '-'})${handBboxStr} px=${hand.pixels}`;
            group.appendChild(item);
            listEl.appendChild(group);
          }
          if (buttons.length > 0) {
            const group = document.createElement('div');
            group.className = 'detection-group';
            const h3 = document.createElement('h3');
            h3.textContent = `Buttons (${buttons.length})`;
            group.appendChild(h3);
            buttons.forEach(btn => {
              const item = document.createElement('span');
              item.className = 'detection-capsule';
              item.style.background = '#c0c';
              item.style.color = '#fff';
              const bboxStr = btn.bbox ? ` [${btn.bbox.w}×${btn.bbox.h}]` : '';
              const pbtn = getPos(btn);
              item.textContent = `${(btn.label || resolveLabel(btn.id, idToLabelMap))} id=${btn.id} (${pbtn.x?.toFixed(1) ?? '-'}, ${pbtn.y?.toFixed(1) ?? '-'})${bboxStr}`;
              group.appendChild(item);
            });
            listEl.appendChild(group);
          }
          if (tubes.length === 0 && balls.length === 0 && !hand && buttons.length === 0 && entries.length === 0) {
            listEl.textContent = '-';
          }
        }
        detectionsEl.textContent = JSON.stringify(detections, null, 2);
      }
    } catch (e) {
      detectionsEl.textContent = 'Parse error: ' + e.message;
    }
  };
}

connect();
