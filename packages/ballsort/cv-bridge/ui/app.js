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
        console.log('[CV-UI] frame_processed frameLen=' + (frame?.length || 0) + ' hasFrame=' + !!frame + ' frameSize=' + JSON.stringify(detections.frameSize));
        if (frame) {
          const src = frame.startsWith('data:') ? frame : 'data:image/jpeg;base64,' + frame;
          frameEl.onerror = () => console.error('[CV-UI] img onerror - frame failed to load');
          frameEl.src = src;
          frameEl.onload = () => {
            console.log('[CV-UI] img onload ok', frameEl.naturalWidth, 'x', frameEl.naturalHeight);
            overlayEl.width = frameEl.naturalWidth;
            overlayEl.height = frameEl.naturalHeight;
            const ctx = overlayEl.getContext('2d');
            ctx.clearRect(0, 0, overlayEl.width, overlayEl.height);
            // Phase 3: draw detection boxes
            const tubes = detections.tubes || [];
            const balls = detections.balls || [];
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
        detectionsEl.textContent = JSON.stringify(detections, null, 2);
      }
    } catch (e) {
      detectionsEl.textContent = 'Parse error: ' + e.message;
    }
  };
}

connect();
