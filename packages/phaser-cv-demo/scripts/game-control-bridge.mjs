#!/usr/bin/env node
/**
 * Game Control Bridge: WebSocket 9876 接收游戏连接，HTTP POST /command 转发触摸指令。
 * 游戏端需 ?control=1 连接。
 */
import { WebSocketServer } from 'ws';
import http from 'http';

const PORT = 9876;
let gameWs = null;
const LOG_URL = 'http://127.0.0.1:7727/ingest/2104fe52-dda1-4f44-a485-b3dec9559cf9';
const log = (msg, data, hid) => {
  fetch(LOG_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '1a1f87' }, body: JSON.stringify({ sessionId: '1a1f87', location: 'game-control-bridge.mjs', message: msg, data: data || {}, timestamp: Date.now(), hypothesisId: hid }) }).catch(() => {});
};

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/command') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (!gameWs || gameWs.readyState !== 1) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'No game connected' }));
        return;
      }
      try {
        const data = JSON.parse(body);
        log('POST /command forwarded', { stepCount: data.steps?.length }, 'H4');
        gameWs.send(JSON.stringify(data));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  gameWs = ws;
  log('Game connected', {}, 'H3');
  console.log('[Control] Game connected');
  ws.on('close', () => {
    if (gameWs === ws) gameWs = null;
    console.log('[Control] Game disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`[Control] Bridge: ws://localhost:${PORT} (game) + POST http://localhost:${PORT}/command`);
});
