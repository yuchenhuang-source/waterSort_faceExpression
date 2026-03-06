const WS_URL = 'ws://localhost:8765';
const frameEl = document.getElementById('frame');
const overlayEl = document.getElementById('overlay');
const statusEl = document.getElementById('status');
const statsEl = document.getElementById('stats');
const detectionsEl = document.getElementById('detections');

let ws = null;
let frameCount = 0;
let overlayVisible = true;

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
        const tubes = detections.tubes || [];
        const balls = detections.balls || [];
        const hand = detections.hand || null;
        const buttons = detections.buttons || [];
        const tubeIds = tubes.map(t => t.id).join(',');
        const ballIds = balls.map(b => b.id).join(',');
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
              const cx = obj.x * s, cy = obj.y * s;
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
            tubes.forEach(t => drawObj(t, '#0f0', '#0f0', `T${t.id}`, 8));
            balls.forEach(b => drawObj(b, '#f80', '#f80', `B${b.id}`, 8));
            if (hand) {
              const b = hand.bbox;
              const cx = hand.x * s, cy = hand.y * s;
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
              ctx.fillText('HAND', cx - 14, cy - 14);
            }
            buttons.forEach(btn => {
              const b = btn.bbox;
              const cx = btn.x * s, cy = btn.y * s;
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
              ctx.fillText(btn.label.toUpperCase(), cx - 10, cy - 12);
            });
          };
        }
        statsEl.textContent = `Frames: ${frameCount}\nProcessing: ${detections.processingMs ?? '-'} ms`;
        const summaryEl = document.getElementById('detection-summary');
        if (summaryEl) {
          const handStr = hand ? ` | 手 (${hand.x},${hand.y})` : '';
          const btnStr = buttons.length > 0 ? ` | 按钮 [${buttons.map(b=>b.label).join(',')}]` : '';
          summaryEl.textContent = `检测到: ${tubes.length} 个试管 [${tubeIds || '-'}], ${balls.length} 个球 [${ballIds || '-'}]${handStr}${btnStr}`;
        }
        const listEl = document.getElementById('detection-list');
        if (listEl) {
          listEl.innerHTML = '';
          const frameDiffs = detections.frameDiffs || [];
          if (frameDiffs.length > 0) {
            const group = document.createElement('div');
            group.className = 'detection-group';
            const h3 = document.createElement('h3');
            h3.textContent = `Frame Diffs (非零) (${frameDiffs.length})`;
            group.appendChild(h3);
            frameDiffs.forEach(d => {
              const item = document.createElement('span');
              item.className = 'detection-capsule';
              item.style.background = '#6a0';
              item.style.color = '#fff';
              const parts = [];
              if (d.dx !== 0 || d.dy !== 0) parts.push(`Δpos(${d.dx},${d.dy})`);
              if (d.dArea !== 0) parts.push(`Δarea=${d.dArea}`);
              item.textContent = `${d.label ?? 'id' + d.id}: ${parts.join(' ')}`;
              group.appendChild(item);
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
              item.textContent = `T${t.id} (${t.x?.toFixed(1) ?? '-'}, ${t.y?.toFixed(1) ?? '-'})${bboxStr}`;
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
              item.textContent = `B${b.id} [${b.tubeId ?? '-'}:${b.index ?? '-'}] (${b.x?.toFixed(1) ?? '-'}, ${b.y?.toFixed(1) ?? '-'})${bboxStr}`;
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
            item.textContent = `HAND (${hand.x?.toFixed(1) ?? '-'}, ${hand.y?.toFixed(1) ?? '-'})${handBboxStr} px=${hand.pixels}`;
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
              item.textContent = `${btn.label.toUpperCase()} id=${btn.id} (${btn.x?.toFixed(1) ?? '-'}, ${btn.y?.toFixed(1) ?? '-'})${bboxStr}`;
              group.appendChild(item);
            });
            listEl.appendChild(group);
          }
          if (tubes.length === 0 && balls.length === 0 && !hand && buttons.length === 0 && frameDiffs.length === 0) {
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
