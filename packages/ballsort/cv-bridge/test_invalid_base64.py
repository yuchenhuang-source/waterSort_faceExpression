#!/usr/bin/env python3
"""L4: 无效 base64 边界测试"""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
try:
    import websockets
except ImportError:
    print("pip install websockets")
    sys.exit(1)


async def main():
    uri = "ws://localhost:8765"
    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({"frame": "not-valid-base64!!!"}))
        resp = json.loads(await ws.recv())
        assert resp.get("status") == "error"
        assert "error" in resp.get("detections", resp)
        print("L4 invalid base64: PASS - status=error, has error field")


if __name__ == "__main__":
    asyncio.run(main())
