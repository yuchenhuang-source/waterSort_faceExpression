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
        const hand = detections.hand || null;
        const buttons = detections.buttons || [];
        const tubeIds = tubes.map(t => t.id).join(',');
        const ballIds = balls.map(b => b.id).join(',');
        console.log('[CV-UI] frame_processed frameLen=' + (frame?.length || 0) + ' hasFrame=' + !!frame + ' frameSize=' + JSON.stringify(detections.frameSize) + ' detected tubes=' + tubeIds + ' balls=' + ballIds + ' hand=' + !!hand + ' buttons=' + buttons.map(b=>b.label).join(','));
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
            // #region agent log
            fetch('http://127.0.0.1:7727/ingest/2104fe52-dda1-4f44-a485-b3dec9559cf9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'97ae77'},body:JSON.stringify({sessionId:'97ae77',location:'app.js:overlay',message:'overlay positioning',data:{coordScale,canvasLogical:overlayEl.width+'x'+overlayEl.height,imgClientWH:frameEl.clientWidth+'x'+frameEl.clientHeight,imgOffsetLT:frameEl.offsetLeft+','+frameEl.offsetTop,sampleTube:tubes[0]??null},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            const s = 1 / coordScale; // factor to convert game coords -> canvas coords
            const ctx = overlayEl.getContext('2d');
            ctx.clearRect(0, 0, overlayEl.width, overlayEl.height);
            // Phase 3: draw detection boxes (scale coords from game space to canvas space)
            tubes.forEach(t => {
              const dx = t.x * s, dy = t.y * s;
              ctx.strokeStyle = '#0f0';
              ctx.lineWidth = 2;
              ctx.strokeRect(dx - 8, dy - 8, 16, 16);
              ctx.fillStyle = '#0f0';
              ctx.font = '12px monospace';
              ctx.fillText(`T${t.id}`, dx - 6, dy + 4);
            });
            balls.forEach(b => {
              const dx = b.x * s, dy = b.y * s;
              ctx.strokeStyle = '#f80';
              ctx.lineWidth = 2;
              ctx.strokeRect(dx - 8, dy - 8, 16, 16);
              ctx.fillStyle = '#f80';
              ctx.font = '12px monospace';
              ctx.fillText(`B${b.id}`, dx - 6, dy + 4);
            });
            if (hand) {
              const dx = hand.x * s, dy = hand.y * s;
              ctx.strokeStyle = '#0ff';
              ctx.lineWidth = 3;
              ctx.strokeRect(dx - 12, dy - 12, 24, 24);
              ctx.fillStyle = '#0ff';
              ctx.font = '13px monospace';
              ctx.fillText('HAND', dx - 14, dy - 14);
            }
            buttons.forEach(btn => {
              const dx = btn.x * s, dy = btn.y * s;
              ctx.strokeStyle = '#f0f';
              ctx.lineWidth = 2;
              ctx.strokeRect(dx - 10, dy - 10, 20, 20);
              ctx.fillStyle = '#f0f';
              ctx.font = '12px monospace';
              ctx.fillText(btn.label.toUpperCase(), dx - 10, dy - 12);
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
          if (hand) {
            const group = document.createElement('div');
            group.className = 'detection-group';
            const h3 = document.createElement('h3');
            h3.textContent = 'Hand';
            group.appendChild(h3);
            const item = document.createElement('span');
            item.className = 'detection-capsule';
            item.style.background = '#0cc';
            item.textContent = `HAND (${hand.x?.toFixed(1) ?? '-'}, ${hand.y?.toFixed(1) ?? '-'}) px=${hand.pixels}`;
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
              item.textContent = `${btn.label.toUpperCase()} id=${btn.id} (${btn.x?.toFixed(1) ?? '-'}, ${btn.y?.toFixed(1) ?? '-'})`;
              group.appendChild(item);
            });
            listEl.appendChild(group);
          }
          if (tubes.length === 0 && balls.length === 0 && !hand && buttons.length === 0) {
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
