"""
CV processor - placeholder for Phase 1.
Returns minimal detections; ArUco detection will be added in Phase 3.
"""
import base64
import time
from typing import Any

import numpy as np

try:
    import cv2
    HAS_OPENCV = True
except ImportError:
    HAS_OPENCV = False


def process_frame(frame_base64: str) -> dict[str, Any]:
    """
    Process a frame from the game. Decode base64, run CV pipeline, return detections.
    Phase 1: minimal placeholder - just decode and return status.
    """
    t0 = time.perf_counter()
    detections: dict[str, Any] = {"tubes": [], "balls": []}

    try:
        # Decode base64 to image
        # Handle data URL format: "data:image/jpeg;base64,<data>"
        b64 = frame_base64.split(",")[-1] if "," in frame_base64 else frame_base64
        img_data = base64.b64decode(b64)
        nparr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR) if HAS_OPENCV else None

        if HAS_OPENCV and img is not None:
            # Phase 1: no real detection yet
            detections["status"] = "ok"
            detections["frameSize"] = {"width": img.shape[1], "height": img.shape[0]}
        else:
            detections["status"] = "ok"
            detections["frameSize"] = None

    except Exception as e:
        detections["status"] = "error"
        detections["error"] = str(e)

    elapsed_ms = (time.perf_counter() - t0) * 1000
    detections["processingMs"] = round(elapsed_ms, 2)

    return detections
