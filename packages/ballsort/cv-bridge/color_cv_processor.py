"""
Color-coded CV processor - detects game objects by their random-assigned ID colors.

Each capture frame is accompanied by a colorMap: { "rrggbb": objectId }.
Detection finds all unique pixel-color clusters and matches each to the nearest
entry in colorMap (Euclidean distance in RGB space, threshold 25).

ID ranges (from game):
  Tubes:    0 ~ N-1
  Balls:    100 + tubeId*10 + slotIndex
  Hand:     500
  Icon:     501
  Download: 502
"""
import base64
import io
import math
import time
from typing import Any

import numpy as np

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

MATCH_DIST_THRESH_SQ = 25 ** 2   # max squared Euclidean distance to accept a color match
MIN_PIXELS = 8                    # ignore clusters smaller than this (anti-aliasing noise)

# Per-object state from previous frame: id -> {x, y, area} for frame-diff computation
_prev_objects: dict[int, dict[str, float]] = {}


def _obj_label(obj_id: int) -> str:
    """Return display label for object id (generic)."""
    return f"id{obj_id}"


def _add_frame_diffs(result: dict[str, Any]) -> None:
    """
    Compare current frame objects with previous frame. Add frameDiffs with all non-zero
    position/area changes. Update _prev_objects for next frame.
    """
    current: dict[int, dict[str, float]] = {}
    for obj in result.get("objects", []):
        b = obj.get("bbox") or {}
        area = (b.get("w", 0) or 0) * (b.get("h", 0) or 0)
        current[obj["id"]] = {"x": float(obj.get("x", 0)), "y": float(obj.get("y", 0)), "area": float(area)}

    diffs: list[dict[str, Any]] = []
    for oid, curr in current.items():
        prev = _prev_objects.get(oid)
        dx = curr["x"] - prev["x"] if prev else 0.0
        dy = curr["y"] - prev["y"] if prev else 0.0
        d_area = curr["area"] - prev["area"] if prev else 0.0
        dist = math.sqrt(dx * dx + dy * dy) if prev else 0.0
        if prev is not None and (dx != 0 or dy != 0 or d_area != 0):
            prev_area = prev["area"]
            diffs.append({
                "id": oid,
                "label": _obj_label(oid),
                "dx": round(dx, 2),
                "dy": round(dy, 2),
                "dist": round(dist, 2),
                "dArea": round(d_area, 2),
                "prevArea": int(prev_area),
            })
        _prev_objects[oid] = curr.copy()

    result["frameDiffs"] = diffs


def _parse_color_map(color_map: dict) -> list[tuple[int, int, int, int]]:
    """
    Parse { "rrggbb": id } into list of (r, g, b, id) tuples.
    """
    result = []
    for hex_color, obj_id in color_map.items():
        try:
            r = int(hex_color[0:2], 16)
            g = int(hex_color[2:4], 16)
            b = int(hex_color[4:6], 16)
            result.append((r, g, b, int(obj_id)))
        except (ValueError, IndexError):
            pass
    return result


def make_debug_frame(pixel_frame: dict) -> str | None:
    """
    Reconstruct a white-background PNG from compact binary pixel data for UI display.
    Returns a data-URI string or None on failure.
    """
    if not HAS_PIL:
        return None
    try:
        encoded = pixel_frame.get("pixels", "")
        w = pixel_frame.get("width", 1)
        h = pixel_frame.get("height", 1)
        raw = base64.b64decode(encoded)
        n = len(raw) // 7
        if n == 0:
            return None
        arr = np.frombuffer(raw, dtype=np.uint8).reshape(n, 7)
        xs = (arr[:, 0].astype(np.uint32) | (arr[:, 1].astype(np.uint32) << 8)).astype(np.int32)
        ys = (arr[:, 2].astype(np.uint32) | (arr[:, 3].astype(np.uint32) << 8)).astype(np.int32)
        img_arr = np.full((h, w, 3), 255, dtype=np.uint8)
        valid = (xs >= 0) & (xs < w) & (ys >= 0) & (ys < h)
        img_arr[ys[valid], xs[valid]] = arr[valid, 4:7]
        img = Image.fromarray(img_arr, 'RGB')
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return None


def process_pixel_data(pixel_frame: dict, color_map: dict | None = None, active_ids: list | None = None) -> dict[str, Any]:
    """
    Process compact binary pixel data sent directly from the JS canvas.
    pixel_frame: { "pixels": "<base64>", "width": int, "height": int }
    pixels is base64-encoded binary; each pixel is 7 bytes: x_lo, x_hi, y_lo, y_hi, r, g, b.
    """
    t0 = time.perf_counter()
    result: dict[str, Any] = {"objects": []}

    if not color_map:
        result["status"] = "error"
        result["error"] = "colorMap missing from message"
        return result

    target_colors = _parse_color_map(color_map)
    if not target_colors:
        result["status"] = "error"
        result["error"] = "colorMap is empty or unparseable"
        return result

    try:
        encoded = pixel_frame.get("pixels", "")
        w = pixel_frame.get("width", 1)
        h = pixel_frame.get("height", 1)
        coord_scale = round(1080 / w) if w < 800 else 1
        result["frameSize"] = {"width": w, "height": h, "coordScale": coord_scale}

        raw = base64.b64decode(encoded)
        n = len(raw) // 7
        if n == 0:
            result["status"] = "ok"
            result["processingMs"] = round((time.perf_counter() - t0) * 1000, 2)
            return result

        arr = np.frombuffer(raw, dtype=np.uint8).reshape(n, 7)
        xs_all = (arr[:, 0].astype(np.uint32) | (arr[:, 1].astype(np.uint32) << 8)).astype(np.float32)
        ys_all = (arr[:, 2].astype(np.uint32) | (arr[:, 3].astype(np.uint32) << 8)).astype(np.float32)
        flat_rgb = arr[:, 4:7].astype(np.int32)  # (N, 3)

        tc_rgb = np.array([[r, g, b] for r, g, b, _ in target_colors], dtype=np.int32)
        tc_ids = [obj_id for _, _, _, obj_id in target_colors]

        N, K = len(flat_rgb), len(tc_rgb)
        a = flat_rgb.astype(np.float32)
        b = tc_rgb.astype(np.float32)
        a_sq = (a * a).sum(axis=1, keepdims=True)
        b_sq = (b * b).sum(axis=1, keepdims=True)
        ab = a @ b.T
        dist_sq = a_sq + b_sq.T - 2.0 * ab
        nearest_idx = dist_sq.argmin(axis=1)
        nearest_dist = dist_sq[np.arange(N), nearest_idx]

        accepted = nearest_dist < MATCH_DIST_THRESH_SQ
        tc_ids_arr = np.array(tc_ids, dtype=np.int32)
        acc_ids = tc_ids_arr[nearest_idx[accepted]]
        acc_xs = xs_all[accepted]
        acc_ys = ys_all[accepted]
        unique_ids, inverse, counts = np.unique(acc_ids, return_inverse=True, return_counts=True)

        obj_centroids: dict[int, tuple[int, int, int, dict]] = {}
        for i, uid in enumerate(unique_ids):
            if counts[i] >= MIN_PIXELS:
                mask = inverse == i
                min_x = int(acc_xs[mask].min() * coord_scale)
                max_x = int(acc_xs[mask].max() * coord_scale)
                min_y = int(acc_ys[mask].min() * coord_scale)
                max_y = int(acc_ys[mask].max() * coord_scale)
                bbox = {"x": min_x, "y": min_y, "w": max_x - min_x, "h": max_y - min_y}
                cx_bbox = (min_x + max_x) // 2
                cy_bbox = (min_y + max_y) // 2
                obj_centroids[int(uid)] = (cx_bbox, cy_bbox, int(counts[i]), bbox)

        detected_ids = []
        for obj_id, (cx, cy, pixel_count, bbox) in obj_centroids.items():
            detected_ids.append(obj_id)
            obj = {"id": obj_id, "x": cx, "y": cy, "pixels": pixel_count, "bbox": bbox}
            result["objects"].append(obj)

        if active_ids is not None:
            active_set = set(active_ids)
            result["objects"] = [o for o in result["objects"] if o["id"] in active_set]

        result["detectedIds"] = sorted(detected_ids)
        result["status"] = "ok"
        _add_frame_diffs(result)

        print(
            f"[CV-PIXELS] objects={len(result['objects'])} "
            f"ids={sorted(o['id'] for o in result['objects'])}"
        )

    except Exception as e:
        result["status"] = "error"
        result["error"] = str(e)
        import traceback
        traceback.print_exc()

    result["processingMs"] = round((time.perf_counter() - t0) * 1000, 2)
    return result


def process_color_coded_frame(frame_base64: str, color_map: dict | None = None, active_ids: list | None = None) -> dict[str, Any]:
    """
    Process a color-coded frame from the game.
    color_map: { "rrggbb": objectId } — sent by the game alongside each frame.
    Returns: { status, tubes, balls, hand, processingMs, detectedIds }
    """
    t0 = time.perf_counter()
    result: dict[str, Any] = {"objects": []}

    if not HAS_PIL:
        result["status"] = "error"
        result["error"] = "Pillow not installed"
        return result

    if not color_map:
        result["status"] = "error"
        result["error"] = "colorMap missing from message"
        return result

    target_colors = _parse_color_map(color_map)
    if not target_colors:
        result["status"] = "error"
        result["error"] = "colorMap is empty or unparseable"
        return result

    try:
        b64 = frame_base64.split(",")[-1] if "," in frame_base64 else frame_base64
        img_bytes = base64.b64decode(b64)
        img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
        pixels = np.array(img)
        h, w, _ = pixels.shape
        # Compute scale factor: JS downsamples by CV_DOWNSAMPLE=4; scale coords back up
        # Original game resolution is 1080×1920 (portrait) or 1920×1080 (landscape)
        coord_scale = round(1080 / w) if w < 800 else 1
        result["frameSize"] = {"width": w, "height": h, "coordScale": coord_scale}

        rgb = pixels[:, :, :3].astype(np.int32)
        alpha = pixels[:, :, 3]

        # Exclude transparent + white background
        opaque = alpha > 128
        non_white = np.any(rgb < 250, axis=2)
        valid_mask = opaque & non_white

        if not np.any(valid_mask):
            result["status"] = "ok"
            _add_frame_diffs(result)
            result["processingMs"] = round((time.perf_counter() - t0) * 1000, 2)
            return result

        # Build target color arrays for vectorised nearest-neighbour search
        tc_rgb = np.array([[r, g, b] for r, g, b, _ in target_colors], dtype=np.int32)  # (K, 3)
        tc_ids = [obj_id for _, _, _, obj_id in target_colors]

        # Flatten valid pixels
        ys_all, xs_all = np.where(valid_mask)
        flat_rgb = rgb[ys_all, xs_all]  # (N, 3)
        N, K = len(flat_rgb), len(tc_rgb)

        # ||a-b||^2 = ||a||^2 + ||b||^2 - 2*(a·b) — uses Apple Accelerate BLAS via @
        a = flat_rgb.astype(np.float32)
        b = tc_rgb.astype(np.float32)
        a_sq = (a * a).sum(axis=1, keepdims=True)   # (N, 1)
        b_sq = (b * b).sum(axis=1, keepdims=True)   # (K, 1)
        ab = a @ b.T                                  # (N, K) — BLAS sgemm
        dist_sq = a_sq + b_sq.T - 2.0 * ab           # (N, K)
        nearest_idx = dist_sq.argmin(axis=1)          # (N,)
        nearest_dist = dist_sq[np.arange(N), nearest_idx]

        accepted = nearest_dist < MATCH_DIST_THRESH_SQ

        # Fully vectorized bbox + center computation
        tc_ids_arr = np.array(tc_ids, dtype=np.int32)
        acc_ids = tc_ids_arr[nearest_idx[accepted]]   # (M,) object ID per accepted pixel
        acc_xs = xs_all[accepted].astype(np.float32)  # (M,)
        acc_ys = ys_all[accepted].astype(np.float32)  # (M,)
        unique_ids, inverse, counts = np.unique(acc_ids, return_inverse=True, return_counts=True)
        obj_centroids: dict[int, tuple[int, int, int, dict]] = {}  # id -> (cx, cy, count, bbox)
        for i, uid in enumerate(unique_ids):
            if counts[i] >= MIN_PIXELS:
                mask = inverse == i
                min_x = int(acc_xs[mask].min() * coord_scale)
                max_x = int(acc_xs[mask].max() * coord_scale)
                min_y = int(acc_ys[mask].min() * coord_scale)
                max_y = int(acc_ys[mask].max() * coord_scale)
                bbox = {"x": min_x, "y": min_y, "w": max_x - min_x, "h": max_y - min_y}
                cx_bbox = (min_x + max_x) // 2
                cy_bbox = (min_y + max_y) // 2
                obj_centroids[int(uid)] = (cx_bbox, cy_bbox, int(counts[i]), bbox)

        detected_ids = []
        for obj_id, (cx, cy, pixel_count, bbox) in obj_centroids.items():
            detected_ids.append(obj_id)
            obj = {"id": obj_id, "x": cx, "y": cy, "pixels": pixel_count, "bbox": bbox}
            result["objects"].append(obj)

        if active_ids is not None:
            active_set = set(active_ids)
            result["objects"] = [o for o in result["objects"] if o["id"] in active_set]

        result["detectedIds"] = sorted(detected_ids)
        result["status"] = "ok"
        _add_frame_diffs(result)

        print(
            f"[CV] objects={len(result['objects'])} "
            f"ids={sorted(o['id'] for o in result['objects'])}"
        )

    except base64.binascii.Error as e:
        result["status"] = "error"
        result["error"] = f"Invalid base64: {e}"
    except Exception as e:
        result["status"] = "error"
        result["error"] = str(e)
        import traceback
        traceback.print_exc()

    result["processingMs"] = round((time.perf_counter() - t0) * 1000, 2)
    return result
