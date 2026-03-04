#!/usr/bin/env python3
"""Send a test frame to CV Bridge WebSocket to verify Phase 3 e2e."""
import asyncio
import base64
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from cv_processor import process_frame
import cv2
import numpy as np

try:
    import websockets
except ImportError:
    print("pip install websockets")
    sys.exit(1)


async def main():
    # Create test image with ArUco marker
    aruco_dict = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_ARUCO_ORIGINAL)
    m = cv2.aruco.generateImageMarker(aruco_dict, 0, 128)
    m = cv2.copyMakeBorder(m, 30, 30, 30, 30, cv2.BORDER_CONSTANT, value=255)
    img = cv2.cvtColor(m, cv2.COLOR_GRAY2BGR)
    _, buf = cv2.imencode(".png", img)
    frame_b64 = base64.b64encode(buf.tobytes()).decode()

    uri = "ws://localhost:8765"
    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({"frame": frame_b64}))
        resp = json.loads(await ws.recv())
        print("Response:", json.dumps(resp, indent=2))
        det = resp.get("detections", {})
        assert resp.get("status") == "ok"
        assert "tubes" in det
        assert "balls" in det
        assert "processingMs" in det
        print("E2E OK: CV Bridge received frame and returned detections")


if __name__ == "__main__":
    asyncio.run(main())
