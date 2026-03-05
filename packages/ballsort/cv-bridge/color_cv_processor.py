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


def process_color_coded_frame(frame_base64: str, color_map: dict | None = None, active_ids: list | None = None) -> dict[str, Any]:
    """
    Process a color-coded frame from the game.
    color_map: { "rrggbb": objectId } — sent by the game alongside each frame.
    Returns: { status, tubes, balls, hand, processingMs, detectedIds }
    """
    t0 = time.perf_counter()
    result: dict[str, Any] = {"tubes": [], "balls": [], "buttons": []}

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

    import json as _json
    _log_path = "/Users/yuchenhuang/Downloads/playables/ballsort/ballsort-multi--液体球效果/.cursor/debug-97ae77.log"
    def _log(msg, data): 
        try:
            with open(_log_path, "a") as _f:
                _f.write(_json.dumps({"sessionId":"97ae77","location":"color_cv_processor.py","message":msg,"data":data,"timestamp":int(time.time()*1000)}) + "\n")
        except Exception: pass

    try:
        # [agent log] stage: decode + PIL
        t_decode = time.perf_counter()
        b64 = frame_base64.split(",")[-1] if "," in frame_base64 else frame_base64
        img_bytes = base64.b64decode(b64)
        img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
        pixels = np.array(img)
        h, w, _ = pixels.shape
        # Compute scale factor: JS downsamples by CV_DOWNSAMPLE=4; scale coords back up
        # Original game resolution is 1080×1920 (portrait) or 1920×1080 (landscape)
        coord_scale = round(1080 / w) if w < 800 else 1
        result["frameSize"] = {"width": w, "height": h, "coordScale": coord_scale}
        t_decode_ms = round((time.perf_counter() - t_decode) * 1000, 2)
        _log("H-D: decode+PIL timing post-fix", {"stage":"decode_pil","ms":t_decode_ms,"w":w,"h":h,"coord_scale":coord_scale,"runId":"post-fix"})

        rgb = pixels[:, :, :3].astype(np.int32)
        alpha = pixels[:, :, 3]

        # Exclude transparent + white background
        opaque = alpha > 128
        non_white = np.any(rgb < 250, axis=2)
        valid_mask = opaque & non_white

        valid_count = int(np.sum(valid_mask))
        _log("H-A/H-B: valid pixels post-fix", {"stage":"valid_mask","valid_pixels":valid_count,"total_pixels":w*h,"runId":"post-fix"})

        if not np.any(valid_mask):
            result["status"] = "ok"
            result["processingMs"] = round((time.perf_counter() - t0) * 1000, 2)
            return result

        # Build target color arrays for vectorised nearest-neighbour search
        tc_rgb = np.array([[r, g, b] for r, g, b, _ in target_colors], dtype=np.int32)  # (K, 3)
        tc_ids = [obj_id for _, _, _, obj_id in target_colors]

        # Flatten valid pixels
        ys_all, xs_all = np.where(valid_mask)
        flat_rgb = rgb[ys_all, xs_all]  # (N, 3)
        N, K = len(flat_rgb), len(tc_rgb)

        # [agent log] stage: distance matrix (BLAS matmul version)
        t_dist = time.perf_counter()
        # ||a-b||^2 = ||a||^2 + ||b||^2 - 2*(a·b) — uses Apple Accelerate BLAS via @
        a = flat_rgb.astype(np.float32)
        b = tc_rgb.astype(np.float32)
        a_sq = (a * a).sum(axis=1, keepdims=True)   # (N, 1)
        b_sq = (b * b).sum(axis=1, keepdims=True)   # (K, 1)
        ab = a @ b.T                                  # (N, K) — BLAS sgemm
        dist_sq = a_sq + b_sq.T - 2.0 * ab           # (N, K)
        nearest_idx = dist_sq.argmin(axis=1)          # (N,)
        nearest_dist = dist_sq[np.arange(N), nearest_idx]
        t_dist_ms = round((time.perf_counter() - t_dist) * 1000, 2)
        _log("H-A post-fix: BLAS dist timing", {"stage":"dist_matrix","ms":t_dist_ms,"N":N,"K":K,"runId":"post-fix","hypothesisId":"H-A"})

        accepted = nearest_dist < MATCH_DIST_THRESH_SQ

        # [agent log] stage: vectorized grouping (bincount)
        t_group = time.perf_counter()
        # Fully vectorized centroid computation using np.bincount
        tc_ids_arr = np.array(tc_ids, dtype=np.int32)
        acc_ids = tc_ids_arr[nearest_idx[accepted]]   # (M,) object ID per accepted pixel
        acc_xs = xs_all[accepted].astype(np.float32)  # (M,)
        acc_ys = ys_all[accepted].astype(np.float32)  # (M,)
        unique_ids, inverse, counts = np.unique(acc_ids, return_inverse=True, return_counts=True)
        sum_xs = np.bincount(inverse, weights=acc_xs, minlength=len(unique_ids))
        sum_ys = np.bincount(inverse, weights=acc_ys, minlength=len(unique_ids))
        # Reconstruct obj_pixels-compatible structure (xs, ys lists) only for centroid use
        obj_centroids: dict[int, tuple[int, int, int]] = {}  # id -> (cx, cy, count)
        for i, uid in enumerate(unique_ids):
            if counts[i] >= MIN_PIXELS:
                cx_scaled = int(sum_xs[i] / counts[i] * coord_scale)
                cy_scaled = int(sum_ys[i] / counts[i] * coord_scale)
                obj_centroids[int(uid)] = (cx_scaled, cy_scaled, int(counts[i]))
        t_group_ms = round((time.perf_counter() - t_group) * 1000, 2)
        _log("H-B post-fix: vectorized grouping timing", {"stage":"group_bincount","ms":t_group_ms,"accepted":int(np.sum(accepted)),"unique_ids":len(unique_ids),"runId":"post-fix","hypothesisId":"H-B"})

        hand = None
        detected_ids = []
        for obj_id, (cx, cy, pixel_count) in obj_centroids.items():
            detected_ids.append(obj_id)

            if obj_id < 100:
                # Tube (0-13)
                result["tubes"].append({"id": obj_id, "x": cx, "y": cy, "pixels": pixel_count})
            elif obj_id < 500:
                # Ball: 100 + tubeId*10 + slotIndex (range 100-237)
                tube_id, slot_index = divmod(obj_id - 100, 10)
                result["balls"].append({
                    "id": obj_id,
                    "tubeId": tube_id,
                    "index": slot_index,
                    "x": cx,
                    "y": cy,
                    "pixels": pixel_count,
                })
            elif obj_id == 500:
                hand = {"id": 500, "x": cx, "y": cy, "pixels": pixel_count}
            elif obj_id == 501:
                result["buttons"].append({"id": 501, "label": "icon", "x": cx, "y": cy, "pixels": pixel_count})
            elif obj_id == 502:
                result["buttons"].append({"id": 502, "label": "download", "x": cx, "y": cy, "pixels": pixel_count})

        if hand:
            result["hand"] = hand

        # Filter to only active IDs if provided by the game
        if active_ids is not None:
            active_set = set(active_ids)
            result["tubes"] = [t for t in result["tubes"] if t["id"] in active_set]
            result["balls"] = [b for b in result["balls"] if b["id"] in active_set]
            result["buttons"] = [b for b in result["buttons"] if b["id"] in active_set]
            if hand and hand["id"] not in active_set:
                result.pop("hand", None)

        result["detectedIds"] = sorted(detected_ids)
        result["status"] = "ok"
        # [agent log] post-fix total
        _log("post-fix total time", {"stage":"total","ms":round((time.perf_counter()-t0)*1000,2),"runId":"post-fix","tubes":len(result["tubes"]),"balls":len(result["balls"])})

        print(
            f"[CV] tubes={len(result['tubes'])} "
            f"balls={len(result['balls'])} "
            f"hand={'yes' if result.get('hand') else 'no'} "
            f"ids={sorted(t['id'] for t in result['tubes'])+sorted(b['id'] for b in result['balls'])}"
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
