"""
CV processor - ArUco detection (Phase 3).
Detects ArUco markers using OpenCV and returns ID + position for tubes and balls.
ID scheme: 0-13 tubes, 100-199 balls (100 + tubeId*10 + slot), 200 hand, 210-213 corners.
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

# ArUco ID ranges
TUBE_IDS = set(range(14))  # 0-13
BALL_ID_RANGE = range(100, 200)  # 100 + tubeId*10 + slot
HAND_ID = 200
CORNER_IDS = set(range(210, 214))  # 210-213


def _id_to_tube_ball(id_val: int) -> tuple[int | None, int | None]:
    """Map ball ID (100-199) to (tubeId, index). Returns (None, None) if not a ball ID."""
    if id_val not in BALL_ID_RANGE:
        return (None, None)
    offset = id_val - 100
    return (offset // 10, offset % 10)


def process_frame(frame_base64: str) -> dict[str, Any]:
    """
    Process a frame from the game. Decode base64, run ArUco detection, return detections.
    Returns: { status, tubes: [{id,x,y}], balls: [{id,tubeId,index,x,y}], processingMs }
    """
    t0 = time.perf_counter()
    detections: dict[str, Any] = {"tubes": [], "balls": []}

    try:
        # Decode base64 to image
        b64 = frame_base64.split(",")[-1] if "," in frame_base64 else frame_base64
        img_data = base64.b64decode(b64)
        nparr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
        if img is None:
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            detections["status"] = "error"
            detections["error"] = "Failed to decode image"
            elapsed_ms = (time.perf_counter() - t0) * 1000
            detections["processingMs"] = round(elapsed_ms, 2)
            return detections

        detections["frameSize"] = {"width": img.shape[1], "height": img.shape[0]}

        # 若 PNG 含 alpha，透明区域转为白色，避免黑底导致 ArUco 不可见
        if len(img.shape) == 3 and img.shape[2] == 4:
            alpha = img[:, :, 3]
            rgb = img[:, :, :3]
            white = np.ones_like(rgb) * 255
            alpha_3 = np.stack([alpha, alpha, alpha], axis=-1) / 255.0
            img = (rgb * alpha_3 + white * (1 - alpha_3)).astype(np.uint8)

        if not HAS_OPENCV:
            detections["status"] = "ok"
            elapsed_ms = (time.perf_counter() - t0) * 1000
            detections["processingMs"] = round(elapsed_ms, 2)
            return detections

        # ArUco detection (support both OpenCV 4.7+ ArucoDetector and older detectMarkers)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        aruco_dict = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_ARUCO_ORIGINAL)
        try:
            params = cv2.aruco.DetectorParameters()
            # Relax for smaller markers (game canvas 1080x2160, markers ~40-80px)
            params.minMarkerPerimeterRate = 0.005  # default 0.03, allow very small markers
            params.adaptiveThreshWinSizeMin = 3
            params.adaptiveThreshWinSizeMax = 23
            params.cornerRefinementMethod = cv2.aruco.CORNER_REFINE_SUBPIX
            detector = cv2.aruco.ArucoDetector(aruco_dict, params)
            corners, ids, rejected = detector.detectMarkers(gray)
        except (AttributeError, TypeError):
            # Fallback for older OpenCV (pre-4.7)
            corners, ids, rejected = cv2.aruco.detectMarkers(gray, aruco_dict)

        if ids is not None and len(ids) > 0:
            ids_flat = ids.flatten()
            for i, marker_id in enumerate(ids_flat):
                marker_id = int(marker_id)
                pts = corners[i][0]
                # Center: average of corners or (corners[0] + corners[2]) / 2
                cx = float((pts[0][0] + pts[2][0]) / 2)
                cy = float((pts[0][1] + pts[2][1]) / 2)

                if marker_id in TUBE_IDS:
                    detections["tubes"].append({"id": marker_id, "x": round(cx, 2), "y": round(cy, 2)})
                elif marker_id in BALL_ID_RANGE:
                    tube_id, slot_index = _id_to_tube_ball(marker_id)
                    detections["balls"].append({
                        "id": marker_id,
                        "tubeId": tube_id,
                        "index": slot_index,
                        "x": round(cx, 2),
                        "y": round(cy, 2),
                    })
                # hand (200) and corners (210-213) can be included if needed; plan focuses on tubes/balls

        detections["status"] = "ok"

    except base64.binascii.Error as e:
        detections["status"] = "error"
        detections["error"] = f"Invalid base64: {e}"
    except Exception as e:
        detections["status"] = "error"
        detections["error"] = str(e)

    elapsed_ms = (time.perf_counter() - t0) * 1000
    detections["processingMs"] = round(elapsed_ms, 2)
    return detections
