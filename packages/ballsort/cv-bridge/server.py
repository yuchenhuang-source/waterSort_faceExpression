#!/usr/bin/env python3
"""
CV Bridge Server - WebSocket (8765) for game + HTTP (5000) for CV UI.
Game sends frames, gets response. UI clients receive broadcasts.
"""
import asyncio
import json
import os
import sys
from pathlib import Path

# Add cv-bridge dir so we can import cv_processor
sys.path.insert(0, str(Path(__file__).resolve().parent))
from cv_processor import process_frame

try:
    import websockets
except ImportError:
    print("Install websockets: pip install websockets")
    sys.exit(1)

WS_PORT = 8765
HTTP_PORT = 5000
UI_DIR = Path(__file__).resolve().parent / "ui"

# All connected WebSocket clients (game + UI)
# Game client sends frames; UI clients only receive broadcasts
clients: set = set()


async def handle_game_message(websocket, message: dict) -> dict:
    """Process frame from game, return response."""
    frame = message.get("frame")
    if not frame:
        return {"status": "error", "error": "missing frame"}

    result = process_frame(frame)
    return {"status": "ok", "detections": result}


async def broadcast(data: dict):
    """Send data to all connected clients (UI observers)."""
    if not clients:
        return
    msg = json.dumps(data)
    await asyncio.gather(*[ws.send(msg) for ws in clients if ws.open])


async def ws_handler(websocket):
    """Handle WebSocket connection. Game sends frames; UI clients receive broadcasts."""
    clients.add(websocket)
    try:
        async for raw in websocket:
            try:
                msg = json.loads(raw)
                # If it has "frame", it's from the game
                if "frame" in msg:
                    response = await handle_game_message(websocket, msg)
                    await websocket.send(json.dumps(response))
                    # Broadcast to all other clients (UI)
                    await broadcast({
                        "type": "frame_processed",
                        "frame": msg["frame"],
                        "detections": response.get("detections", {}),
                        "response": response,
                    })
            except json.JSONDecodeError as e:
                await websocket.send(json.dumps({"status": "error", "error": str(e)}))
    finally:
        clients.discard(websocket)


async def serve_http(reader, writer):
    """Simple HTTP server for CV UI static files."""
    data = await reader.read(4096)
    lines = data.decode().split("\r\n")
    if not lines:
        writer.close()
        return

    req_line = lines[0]
    parts = req_line.split()
    if len(parts) < 2:
        writer.close()
        return

    method, path = parts[0], parts[1]
    if path == "/":
        path = "/index.html"

    safe_path = path.lstrip("/").replace("..", "")
    filepath = (UI_DIR / safe_path).resolve()
    ui_dir = UI_DIR.resolve()
    if not str(filepath).startswith(str(ui_dir)):
        filepath = UI_DIR / "index.html"

    if filepath.exists() and filepath.is_file():
        content = filepath.read_bytes()
        ext = filepath.suffix.lower()
        mime = {
            ".html": "text/html",
            ".js": "application/javascript",
            ".css": "text/css",
        }.get(ext, "application/octet-stream")
        writer.write(f"HTTP/1.1 200 OK\r\nContent-Type: {mime}\r\nContent-Length: {len(content)}\r\n\r\n".encode())
        writer.write(content)
    else:
        writer.write(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n")

    await writer.drain()
    writer.close()


async def main():
    # WebSocket server
    ws_server = await websockets.serve(ws_handler, "localhost", WS_PORT, ping_interval=20, ping_timeout=10)
    print(f"[CV] WebSocket server on ws://localhost:{WS_PORT}")

    # HTTP server for UI
    http_server = await asyncio.start_server(serve_http, "localhost", HTTP_PORT)
    print(f"[CV] HTTP server (CV UI) on http://localhost:{HTTP_PORT}")

    await asyncio.Future()  # run forever


if __name__ == "__main__":
    asyncio.run(main())
