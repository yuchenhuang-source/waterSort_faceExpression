const WS_URL = 'ws://localhost:8765';
const frameEl = document.getElementById('frame');
const overlayEl = document.getElementById('overlay');
const statusEl = document.getElementById('status');
const statsEl = document.getElementById('stats');
const detectionsEl = document.getElementById('detections');

let ws = null;
let frameCount = 0;

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
        const tubeIds = tubes.map(t => t.id).join(',');
        const ballIds = balls.map(b => b.id).join(',');
        console.log('[CV-UI] frame_processed frameLen=' + (frame?.length || 0) + ' hasFrame=' + !!frame + ' frameSize=' + JSON.stringify(detections.frameSize) + ' detected tubes=' + tubeIds + ' balls=' + ballIds + ' count=' + tubes.length + ',' + balls.length);
        if (frame) {
          const src = frame.startsWith('data:') ? frame : 'data:image/jpeg;base64,' + frame;
          frameEl.onerror = () => console.error('[CV-UI] img onerror - frame failed to load');
          frameEl.src = src;
          frameEl.onload = () => {
            console.log('[CV-UI] img onload ok', frameEl.naturalWidth, 'x', frameEl.naturalHeight);
            overlayEl.onload = () => {
              // Now matching visual size with CSS scaling
              overlayEl.style.width = frameEl.clientWidth + 'px';
              overlayEl.style.height = frameEl.clientHeight + 'px';
            };
            // Initial assignment
            overlayEl.width = frameEl.naturalWidth;
            overlayEl.height = frameEl.naturalHeight;
            const ctx = overlayEl.getContext('2d');
            ctx.clearRect(0, 0, overlayEl.width, overlayEl.height);
            // Phase 3: draw detection boxes
            tubes.forEach(t => {
              ctx.strokeStyle = '#0f0';
              ctx.lineWidth = 2;
              ctx.strokeRect(t.x - 8, t.y - 8, 16, 16);
              ctx.fillStyle = '#0f0';
              ctx.font = '12px monospace';
              ctx.fillText(`T${t.id}`, t.x - 6, t.y + 4);
            });
            balls.forEach(b => {
              ctx.strokeStyle = '#f80';
              ctx.lineWidth = 2;
              ctx.strokeRect(b.x - 8, b.y - 8, 16, 16);
              ctx.fillStyle = '#f80';
              ctx.font = '12px monospace';
              ctx.fillText(`B${b.id}`, b.x - 6, b.y + 4);
            });
          };
        }
        statsEl.textContent = `Frames: ${frameCount}\nProcessing: ${detections.processingMs ?? '-'} ms`;
        const summaryEl = document.getElementById('detection-summary');
        if (summaryEl) {
          summaryEl.textContent = `检测到: ${tubes.length} 个试管 [${tubeIds || '-'}], ${balls.length} 个球 [${ballIds || '-'}]`;
        }
        const listEl = document.getElementById('detection-list');
        if (listEl) {
          listEl.innerHTML = '';
          if (tubes.length > 0) {
            const group = document.createElement('div');
            group.className = 'detection-group';
            const h3 = document.createElement('h3');
            h3.textContent = `Tubes (${tubes.length})`;
            group.appendChild(h3);
            tubes.forEach(t => {
              const item = document.createElement('span');
              item.className = 'detection-capsule tube';
              item.textContent = `T${t.id} (${t.x?.toFixed(1) ?? '-'}, ${t.y?.toFixed(1) ?? '-'})`;
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
              item.textContent = `B${b.id} [${b.tubeId ?? '-'}:${b.index ?? '-'}] (${b.x?.toFixed(1) ?? '-'}, ${b.y?.toFixed(1) ?? '-'})`;
              group.appendChild(item);
            });
            listEl.appendChild(group);
          }
          if (tubes.length === 0 && balls.length === 0) {
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
