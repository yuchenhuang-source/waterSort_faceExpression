#!/usr/bin/env node
/**
 * Connect to CV WebSocket, wait for one frame_processed broadcast, print detections.
 * Run while game is open at ?cv=1 - press S in game to trigger capture.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8765');
ws.on('open', () => console.log('[capture-cv] Connected, waiting for frame... (press S in game)'));
ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'frame_processed') {
      console.log('\n=== CV DETECTIONS (full) ===\n');
      console.log(JSON.stringify(msg.detections, null, 2));
      console.log('\n=== END ===\n');
      ws.close();
      process.exit(0);
    }
  } catch (e) {
    console.error(e);
  }
});
ws.on('error', (e) => {
  console.error('[capture-cv] Error:', e.message);
  process.exit(1);
});
setTimeout(() => {
  console.error('[capture-cv] Timeout 15s - no frame received. Is game open at ?cv=1? Press S?');
  process.exit(1);
}, 15000);
