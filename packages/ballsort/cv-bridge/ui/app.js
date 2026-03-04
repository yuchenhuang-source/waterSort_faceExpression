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
        if (frame) {
          frameEl.src = frame.startsWith('data:') ? frame : 'data:image/jpeg;base64,' + frame;
          frameEl.onload = () => {
            overlayEl.width = frameEl.naturalWidth;
            overlayEl.height = frameEl.naturalHeight;
            const ctx = overlayEl.getContext('2d');
            ctx.clearRect(0, 0, overlayEl.width, overlayEl.height);
            // Phase 1: no overlay drawing yet
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
