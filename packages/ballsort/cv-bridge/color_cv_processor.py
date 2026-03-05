"""
Color-coded CV processor - detects game objects by their random-assigned ID colors.

Each capture frame is accompanied by a colorMap: { "rrggbb": objectId }.
Detection finds all unique pixel-color clusters and matches each to the nearest
entry in colorMap (Euclidean distance in RGB space, threshold 25).

ID ranges (from game):
  Tubes:    0 ~ N-1
  Balls:    100 + tubeId*10 + slotIndex
  Hand:     200
  Icon:     201
  Download: 202
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
    result: dict[str, Any] = {"tubes": [], "balls": []}

    if not HAS_PIL:
        result["status"] = "error"
        result["error"] = "Pillow not installed"
        return result

    if not color_map:
        result["status"] = "error"
        result["error"] = "colorMap missing from message"
        return result

    target_colors = _parse_color_map(color_map)
    print(f"[CV-DBG] H1/H4 colorMap entries received={len(color_map)} parsed={len(target_colors)} sample={list(color_map.items())[:3]}")
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
        result["frameSize"] = {"width": w, "height": h}

        rgb = pixels[:, :, :3].astype(np.int32)
        alpha = pixels[:, :, 3]

        # Exclude transparent + white background
        opaque = alpha > 128
        non_white = np.any(rgb < 250, axis=2)
        valid_mask = opaque & non_white

        valid_count = int(np.sum(valid_mask))
        print(f"[CV-DBG] H2 valid pixels (non-white+opaque)={valid_count} total={w*h}")
        if not np.any(valid_mask):
            result["status"] = "ok"
            result["processingMs"] = round((time.perf_counter() - t0) * 1000, 2)
            print("[CV] No valid pixels found")
            return result

        # Build target color arrays for vectorised nearest-neighbour search
        tc_rgb = np.array([[r, g, b] for r, g, b, _ in target_colors], dtype=np.int32)  # (K, 3)
        tc_ids = [obj_id for _, _, _, obj_id in target_colors]

        # Flatten valid pixels
        ys_all, xs_all = np.where(valid_mask)
        flat_rgb = rgb[ys_all, xs_all]  # (N, 3)
        N, K = len(flat_rgb), len(tc_rgb)
        print(f"[CV-DBG] H3-pre N_valid_pixels={N} K_colors={K} est_mem_MB={N*K*3*4/1024/1024:.1f}")

        # Nearest-neighbour: for each pixel find closest target color
        # diff: (N, K, 3)
        diff = flat_rgb[:, None, :] - tc_rgb[None, :, :]
        dist_sq = np.sum(diff ** 2, axis=2)  # (N, K)
        nearest_idx = np.argmin(dist_sq, axis=1)  # (N,)
        nearest_dist = dist_sq[np.arange(len(flat_rgb)), nearest_idx]  # (N,)

        accepted = nearest_dist < MATCH_DIST_THRESH_SQ
        print(f"[CV-DBG] H3 pixels accepted={int(np.sum(accepted))}/{len(flat_rgb)} min_dist_sq={int(np.min(nearest_dist))} max_dist_sq={int(np.max(nearest_dist))} threshold={MATCH_DIST_THRESH_SQ}")

        # Group pixels by object ID
        obj_pixels: dict[int, tuple[list[int], list[int]]] = {}
        for i, (accept, n_idx) in enumerate(zip(accepted, nearest_idx)):
            if not accept:
                continue
            obj_id = tc_ids[n_idx]
            if obj_id not in obj_pixels:
                obj_pixels[obj_id] = ([], [])
            obj_pixels[obj_id][0].append(int(xs_all[i]))
            obj_pixels[obj_id][1].append(int(ys_all[i]))

        hand = None
        detected_ids = []
        for obj_id, (xs, ys) in obj_pixels.items():
            if len(xs) < MIN_PIXELS:
                continue
            cx = int(np.mean(xs))
            cy = int(np.mean(ys))
            pixel_count = len(xs)
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
            # 501/502 (icon/download) - not forwarded to game logic yet

        if hand:
            result["hand"] = hand

        # Filter to only active IDs if provided by the game
        if active_ids is not None:
            active_set = set(active_ids)
            result["tubes"] = [t for t in result["tubes"] if t["id"] in active_set]
            result["balls"] = [b for b in result["balls"] if b["id"] in active_set]
            if hand and hand["id"] not in active_set:
                result.pop("hand", None)

        result["detectedIds"] = sorted(detected_ids)
        result["status"] = "ok"

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
