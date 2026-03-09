#!/usr/bin/env python3
"""Connect to CV WebSocket, wait for one frame_processed, print detections.
Run while game is open at ?cv=1 - press S in game to trigger capture."""
import asyncio
import json
import sys

sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent.parent.parent / 'phaser-cv' / 'cv-bridge'))
try:
    import websockets
except ImportError:
    print("Install: pip install websockets")
    sys.exit(1)

async def main():
    print("[capture-cv] Connecting...")
    async with websockets.connect("ws://localhost:8765") as ws:
        print("[capture-cv] Connected. Waiting for frame... (press S in game)")
        async for raw in ws:
            msg = json.loads(raw)
            if msg.get("type") == "frame_processed":
                print("\n=== CV DETECTIONS (full) ===\n")
                print(json.dumps(msg.get("detections", {}), indent=2))
                print("\n=== END ===\n")
                return

asyncio.run(asyncio.wait_for(main(), timeout=15))
