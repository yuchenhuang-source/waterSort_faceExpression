#!/usr/bin/env python3
"""
Image to Arrow Config Converter (v6 - Path-First Architecture)

v6 key principle: CONNECTIVITY FIRST, COLOR SECOND

New Pipeline:
1. Skeleton extraction (combined, no color info)
2. Connected component analysis → each CC = one complete line
3. Pixel-level path tracing → ordered pixel sequences
4. Path-to-grid alignment → preserve ALL bends
5. Path coloring → assign color to entire path based on pixel voting

This ensures no physical line is ever broken due to color artifacts.
"""

import argparse
import json
import math
import os
from collections import Counter, deque
from typing import Dict, List, Optional, Set, Tuple

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from sklearn.cluster import KMeans

# Type aliases
PixelPath = List[Tuple[int, int]]  # [(y, x), ...] in pixel space
GridPath = List[Tuple[int, int]]   # [(row, col), ...] in grid space


# ─────────────────── Image Loading ───────────────────


def load_image(path: str) -> np.ndarray:
    """Load an RGBA image as numpy array."""
    img = Image.open(path).convert("RGBA")
    return np.array(img)


# ─────────────────── Preprocessing ───────────────────


def filter_dark_borders(
    arr: np.ndarray, mask: np.ndarray, brightness_thresh: int = 40
) -> np.ndarray:
    """Filter out near-black border pixels from the stroke mask."""
    rgb = arr[:, :, :3].astype(float)
    luminance = (
        0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
    )
    is_dark = luminance < brightness_thresh
    return mask & ~is_dark


def preprocess_mask(mask: np.ndarray, close_radius: int) -> np.ndarray:
    """Apply morphological closing to fill small gaps in strokes."""
    if close_radius <= 0:
        return mask
    y, x = np.ogrid[
        -close_radius : close_radius + 1, -close_radius : close_radius + 1
    ]
    struct = (x**2 + y**2) <= close_radius**2
    return ndi.binary_closing(mask, struct).astype(bool)


# ─────────────────── Line Width Estimation ───────────────────


def estimate_line_width(mask: np.ndarray) -> float:
    """Estimate typical line width using distance transform."""
    dt = ndi.distance_transform_edt(mask)
    vals = dt[mask]
    if vals.size == 0:
        return 1.0
    bins = np.arange(0, np.max(vals) + 0.5, 0.5)
    if len(bins) < 2:
        return 1.0
    hist, edges = np.histogram(vals, bins=bins)
    if hist.size > 1:
        hist[:1] = 0
    mode_idx = int(np.argmax(hist))
    mode_val = (edges[mode_idx] + edges[mode_idx + 1]) / 2
    return max(1.0, 2 * mode_val)


# ─────────────────── Colour Detection ───────────────────


def _find_elbow(ks: List[int], inertias: List[float]) -> int:
    """Find the elbow point in an inertia curve."""
    ks_a = np.array(ks, dtype=float)
    inertias_a = np.array(inertias, dtype=float)

    k_range = ks_a[-1] - ks_a[0]
    i_range = inertias_a[0] - inertias_a[-1]
    if k_range == 0 or i_range <= 0:
        return int(ks_a[0])

    ks_n = (ks_a - ks_a[0]) / k_range
    in_n = (inertias_a - inertias_a[-1]) / i_range

    p1 = np.array([ks_n[0], in_n[0]])
    p2 = np.array([ks_n[-1], in_n[-1]])
    line_vec = p2 - p1
    line_len = np.linalg.norm(line_vec)
    if line_len == 0:
        return int(ks_a[0])

    max_dist = -1.0
    best_idx = 0
    for i in range(len(ks_a)):
        pt = np.array([ks_n[i], in_n[i]])
        diff = p1 - pt
        cross_val = line_vec[0] * diff[1] - line_vec[1] * diff[0]
        dist = abs(cross_val) / line_len
        if dist > max_dist:
            max_dist = dist
            best_idx = i

    return int(ks_a[best_idx])


def auto_cluster_colors(
    all_pixels: np.ndarray,
    dt_values: Optional[np.ndarray] = None,
    max_k: int = 8,
    center_percentile: float = 40.0,
) -> Tuple[np.ndarray, np.ndarray, int]:
    """Automatically detect the number of distinct colours and cluster pixels."""
    n_samples = all_pixels.shape[0]

    if dt_values is not None and dt_values.size == n_samples:
        dt_thresh = np.percentile(dt_values, center_percentile)
        center_mask = dt_values >= max(dt_thresh, 0.5)
        center_pixels = all_pixels[center_mask]
        if center_pixels.shape[0] < 200:
            center_pixels = all_pixels
    else:
        center_pixels = all_pixels

    max_fit = 200_000
    n_center = center_pixels.shape[0]
    fit_sample = (
        center_pixels
        if n_center <= max_fit
        else center_pixels[np.random.choice(n_center, max_fit, replace=False)]
    )

    actual_max_k = min(max_k, n_center - 1)
    ks: List[int] = []
    inertias: List[float] = []
    models: Dict[int, KMeans] = {}

    for k in range(2, actual_max_k + 1):
        km = KMeans(n_clusters=k, n_init="auto", random_state=0)
        km.fit(fit_sample)
        ks.append(k)
        inertias.append(float(km.inertia_))
        models[k] = km

    best_k = _find_elbow(ks, inertias) if len(ks) >= 3 else ks[0]
    print(
        f"[color]  auto-detect: elbow at k={best_k}  "
        f"(inertias: {[f'{v:.0f}' for v in inertias]})"
    )

    kmeans = models[best_k]
    centers = kmeans.cluster_centers_.round().astype(int)
    all_labels = kmeans.predict(all_pixels)

    return all_labels, centers, best_k


# ─────────────────── Skeletonisation (Zhang-Suen) ───────────────────


def zhang_suen_thinning(img_bin: np.ndarray) -> np.ndarray:
    """Zhang-Suen thinning – produces 1-px skeleton from binary image."""
    img = img_bin.astype(np.uint8)
    img = np.pad(img, 1, mode="constant")
    changed = True
    while changed:
        changed = False
        for step in (0, 1):
            P2 = np.roll(img, -1, axis=0)
            P3 = np.roll(np.roll(img, -1, axis=0), -1, axis=1)
            P4 = np.roll(img, -1, axis=1)
            P5 = np.roll(np.roll(img, 1, axis=0), -1, axis=1)
            P6 = np.roll(img, 1, axis=0)
            P7 = np.roll(np.roll(img, 1, axis=0), 1, axis=1)
            P8 = np.roll(img, 1, axis=1)
            P9 = np.roll(np.roll(img, -1, axis=0), 1, axis=1)

            neighbors = P2 + P3 + P4 + P5 + P6 + P7 + P8 + P9
            A = ((P2 == 0) & (P3 == 1)).astype(np.uint8)
            A += ((P3 == 0) & (P4 == 1)).astype(np.uint8)
            A += ((P4 == 0) & (P5 == 1)).astype(np.uint8)
            A += ((P5 == 0) & (P6 == 1)).astype(np.uint8)
            A += ((P6 == 0) & (P7 == 1)).astype(np.uint8)
            A += ((P7 == 0) & (P8 == 1)).astype(np.uint8)
            A += ((P8 == 0) & (P9 == 1)).astype(np.uint8)
            A += ((P9 == 0) & (P2 == 1)).astype(np.uint8)

            if step == 0:
                m1 = P2 * P4 * P6
                m2 = P4 * P6 * P8
            else:
                m1 = P2 * P4 * P8
                m2 = P2 * P6 * P8

            remove = (
                (img == 1)
                & (neighbors >= 2)
                & (neighbors <= 6)
                & (A == 1)
                & (m1 == 0)
                & (m2 == 0)
            )
            if np.any(remove):
                img[remove] = 0
                changed = True
    return img[1:-1, 1:-1].astype(bool)


# ─────────────────── Grid Step Estimation ───────────────────


def _dominant_period(signal: np.ndarray, min_period: int, max_period: int):
    """Find the fundamental period via autocorrelation."""
    n = len(signal)
    if n <= min_period:
        return None, 0.0
    sig = signal - signal.mean()
    if np.std(sig) < 1e-6:
        return None, 0.0
    f = np.fft.rfft(sig, n * 2)
    ac = np.fft.irfft(f * np.conj(f))[:n]
    ac[0] = 0
    lo = max(1, min_period)
    hi = min(max_period, n - 1)
    if lo >= hi:
        return None, 0.0

    ac_sub = ac[lo:hi]
    if ac_sub.max() <= 0:
        return None, 0.0

    peaks: List[Tuple[int, float]] = []
    for i in range(1, len(ac_sub) - 1):
        if (
            ac_sub[i] > ac_sub[i - 1]
            and ac_sub[i] > ac_sub[i + 1]
            and ac_sub[i] > 0
        ):
            peaks.append((i + lo, float(ac_sub[i])))

    if not peaks:
        idx = int(np.argmax(ac_sub)) + lo
        return idx, float(ac[idx])

    global_max = max(v for _, v in peaks)
    significance = 0.30
    for period, val in peaks:
        if val >= global_max * significance:
            return period, val

    best = max(peaks, key=lambda x: x[1])
    return best[0], best[1]


def estimate_grid_step(mask: np.ndarray, line_width: float):
    """Estimate grid step using skeleton projection autocorrelation."""
    skeleton = zhang_suen_thinning(mask)

    col_proj = skeleton.sum(axis=0).astype(float)
    row_proj = skeleton.sum(axis=1).astype(float)
    col_proj -= col_proj.mean()
    row_proj -= row_proj.mean()

    min_period = max(4, int(line_width * 2))
    max_x = min(300, mask.shape[1] - 1)
    max_y = min(300, mask.shape[0] - 1)
    step_x, score_x = _dominant_period(col_proj, min_period, max_x)
    step_y, score_y = _dominant_period(row_proj, min_period, max_y)
    return step_x, score_x, step_y, score_y, skeleton


# ─────────────────── Grid Offset Estimation ───────────────────


def estimate_offset(mask: np.ndarray, step: int, axis: int) -> float:
    """Estimate grid offset along *axis* using distance-weighted phase histogram."""
    if step <= 0:
        return 0.0
    dt = ndi.distance_transform_edt(mask)
    ys, xs = np.where(mask)
    coords = xs if axis == 0 else ys
    weights = dt[ys, xs]
    phases = coords.astype(int) % step
    hist = np.zeros(step, dtype=float)
    np.add.at(hist, phases, weights)
    peak = int(np.argmax(hist))
    return float(peak - step / 2)


# ─────────────────── V6: Pixel-Level Path Tracing ───────────────────


def trace_skeleton_paths_v6(
    skeleton: np.ndarray,
) -> List[PixelPath]:
    """
    Trace ordered pixel paths from a binary skeleton image.

    Uses 8-connectivity. Starts from endpoints (degree-1 pixels);
    at junctions (degree-3+) prefers the straightest continuation.

    Returns
    -------
    list of paths, each a list of ``(y, x)`` pixel coordinates.
    """
    ys, xs = np.where(skeleton)
    point_set: Set[Tuple[int, int]] = set(zip(ys.tolist(), xs.tolist()))
    if not point_set:
        return []

    # Pre-compute 8-connected neighbours
    neighbor_map: Dict[Tuple[int, int], List[Tuple[int, int]]] = {}
    for y, x in point_set:
        nbs: List[Tuple[int, int]] = []
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                if (y + dy, x + dx) in point_set:
                    nbs.append((y + dy, x + dx))
        neighbor_map[(y, x)] = nbs

    endpoints = sorted(p for p, nbs in neighbor_map.items() if len(nbs) == 1)

    visited: Set[Tuple[int, int]] = set()
    paths: List[PixelPath] = []

    def trace_from(start: Tuple[int, int]) -> PixelPath:
        path = [start]
        visited.add(start)
        current = start
        while True:
            nbs = [n for n in neighbor_map.get(current, []) if n not in visited]
            if not nbs:
                break
            # At true branches (degree ≥ 3), choose the straightest continuation.
            # If multiple unvisited neighbors exist, pick one and continue.
            # The global `visited` set prevents endless loops.
            if len(nbs) > 1 and len(path) >= 2:
                prev = path[-2]
                dy = current[0] - prev[0]
                dx = current[1] - prev[1]
                nbs.sort(
                    key=lambda n, _dy=dy, _dx=dx: abs(
                        (n[0] - current[0]) - _dy
                    )
                    + abs((n[1] - current[1]) - _dx)
                )
            next_pt = nbs[0]
            visited.add(next_pt)
            path.append(next_pt)
            current = next_pt
        return path

    # Trace from endpoints
    for ep in endpoints:
        if ep not in visited:
            path = trace_from(ep)
            if len(path) >= 2:
                paths.append(path)

    # Remaining unvisited pixels (cycles / isolated loops)
    for pt in sorted(point_set):
        if pt not in visited:
            path = trace_from(pt)
            if len(path) >= 2:
                paths.append(path)

    return paths


# ─────────────────── V6: Path-to-Grid Alignment ───────────────────


def douglas_peucker_simplify(
    path: PixelPath, epsilon: float
) -> PixelPath:
    """
    Douglas-Peucker line simplification.

    Returns a simplified path with fewer points while preserving shape.
    """
    if len(path) < 3:
        return path

    def perpendicular_distance(pt, line_start, line_end):
        if line_start == line_end:
            return math.hypot(pt[0] - line_start[0], pt[1] - line_start[1])
        num = abs(
            (line_end[1] - line_start[1]) * pt[0]
            - (line_end[0] - line_start[0]) * pt[1]
            + line_end[0] * line_start[1]
            - line_end[1] * line_start[0]
        )
        den = math.hypot(
            line_end[1] - line_start[1], line_end[0] - line_start[0]
        )
        return num / den

    dmax = 0.0
    index = 0
    for i in range(1, len(path) - 1):
        d = perpendicular_distance(path[i], path[0], path[-1])
        if d > dmax:
            dmax = d
            index = i

    if dmax > epsilon:
        left = douglas_peucker_simplify(path[:index + 1], epsilon)
        right = douglas_peucker_simplify(path[index:], epsilon)
        return left[:-1] + right
    else:
        return [path[0], path[-1]]


def snap_path_to_grid_v6(
    pixel_path: PixelPath,
    step_x: int,
    step_y: int,
    offset_x: float,
    offset_y: float,
    simplify_epsilon: Optional[float] = None,
) -> GridPath:
    """
    Snap a pixel path to grid coordinates, ensuring 4-connectivity.

    Steps:
    1. Map EVERY pixel in the path to its grid cell
    2. Remove consecutive duplicates
    3. Interpolate diagonal steps to ensure 4-connectivity

    simplify_epsilon is ignored to ensure full connectivity.
    """
    if not pixel_path:
        return []

    # Step 1 & 2: Map pixels → grid cells, remove duplicates
    raw_grid: GridPath = []
    for py, px in pixel_path:
        col = int(math.floor((px - offset_x) / step_x))
        row = int(math.floor((py - offset_y) / step_y))
        if not raw_grid or (row, col) != raw_grid[-1]:
            raw_grid.append((row, col))

    # Step 3: Interpolate diagonal steps
    result: GridPath = [raw_grid[0]]
    for i in range(1, len(raw_grid)):
        r0, c0 = result[-1]
        r1, c1 = raw_grid[i]
        dr = r1 - r0
        dc = c1 - c0
        manhattan = abs(dr) + abs(dc)

        if manhattan == 1:
            # Already 4-adjacent
            result.append((r1, c1))
        elif manhattan == 2 and abs(dr) == 1 and abs(dc) == 1:
            # Diagonal step: insert intermediate cell
            # Prefer direction that continues previous move
            if len(result) >= 2:
                pr, pc = result[-2]
                prev_dr = r0 - pr
                prev_dc = c0 - pc
                if prev_dr != 0:
                    # Previous move was vertical → continue vertical first
                    result.append((r0 + dr, c0))
                else:
                    # Previous move was horizontal → continue horizontal first
                    result.append((r0, c0 + dc))
            else:
                # No history: arbitrary choice (vertical first)
                result.append((r0 + dr, c0))
            result.append((r1, c1))
        elif manhattan > 2:
            # Large gap: interpolate step-by-step
            while (r0, c0) != (r1, c1):
                if abs(r1 - r0) > abs(c1 - c0):
                    r0 += 1 if r1 > r0 else -1
                else:
                    c0 += 1 if c1 > c0 else -1
                result.append((r0, c0))
        else:
            # Manhattan == 0 (duplicate, shouldn't happen)
            pass

    return result


# ─────────────────── V6: Path Coloring ───────────────────


def assign_path_color(
    pixel_path: PixelPath,
    label_img: np.ndarray,
    dt: np.ndarray,
    n_colors: int,
    edge_ignore_dt: float = 0.3,
) -> int:
    """
    Assign a single color to an entire pixel path using centre-pixel voting.

    Only pixels with DT >= edge_ignore_dt participate in voting,
    to avoid dark border artifacts.
    """
    votes: List[int] = []
    votes_fallback: List[int] = []

    for y, x in pixel_path:
        label = label_img[y, x]
        if label >= 0:
            votes_fallback.append(label)
            if dt[y, x] >= edge_ignore_dt:
                votes.append(label)

    vote_pool = votes if votes else votes_fallback
    if not vote_pool:
        return 0  # fallback to first color

    counts = np.bincount(vote_pool, minlength=n_colors)
    return int(np.argmax(counts))


# ─────────────────── V6: Arrow Head Detection ───────────────────


def detect_arrow_head_at_endpoint(
    pixel_path: PixelPath,
    mask_orig: np.ndarray,
    endpoint_idx: int,
    window_size: int = 10,
) -> bool:
    """
    Detect if an endpoint of a pixel path is an arrow head.

    Arrow heads have higher pixel density (triangular shape) within a
    local window around the endpoint.

    Parameters
    ----------
    pixel_path : ordered list of (y, x) pixel coordinates
    mask_orig : original stroke mask (for density calculation)
    endpoint_idx : 0 (start) or -1 (end)
    window_size : radius in pixels to check around endpoint
    """
    if len(pixel_path) < 2:
        return False

    h, w = mask_orig.shape
    ey, ex = pixel_path[endpoint_idx]

    # Define local window
    y0, y1 = max(0, ey - window_size), min(h, ey + window_size + 1)
    x0, x1 = max(0, ex - window_size), min(w, ex + window_size + 1)

    if y0 >= y1 or x0 >= x1:
        return False

    window = mask_orig[y0:y1, x0:x1]
    density = window.sum() / (window.size + 1e-6)

    # Compare to sample density along the line (away from endpoint)
    sample_start = 5 if endpoint_idx == 0 else -15
    sample_end = 15 if endpoint_idx == 0 else -5
    sample_start = max(0, min(len(pixel_path), sample_start if sample_start >= 0 else len(pixel_path) + sample_start))
    sample_end = max(0, min(len(pixel_path), sample_end if sample_end >= 0 else len(pixel_path) + sample_end))

    if sample_start >= sample_end:
        return False

    line_densities = []
    for sy, sx in pixel_path[sample_start:sample_end]:
        ly0, ly1 = max(0, sy - window_size), min(h, sy + window_size + 1)
        lx0, lx1 = max(0, sx - window_size), min(w, sx + window_size + 1)
        if ly0 < ly1 and lx0 < lx1:
            lw = mask_orig[ly0:ly1, lx0:lx1]
            line_densities.append(lw.sum() / (lw.size + 1e-6))

    if not line_densities:
        return False

    median_line_density = np.median(line_densities)

    # Arrow head has significantly higher density (typically 1.5x+)
    return density > median_line_density * 1.4


# ─────────────────── V6: Adjacent Path Merging ───────────────────


def are_paths_adjacent(path_a: GridPath, path_b: GridPath) -> bool:
    """Check if two grid paths have any 4-adjacent cells."""
    for ra, ca in path_a:
        for rb, cb in path_b:
            if abs(ra - rb) + abs(ca - cb) == 1:
                return True
    return False


def try_merge_adjacent_paths(
    grid_paths_with_color: List[Tuple[GridPath, int]],
) -> List[Tuple[GridPath, int]]:
    """
    Merge grid paths that are adjacent (4-connected neighbor cells exist).

    Two arrows should NEVER have adjacent cells anywhere in their paths.
    If they do, it means a single physical line was incorrectly split
    (e.g., at a bend that was misidentified as two separate arrows).

    Merge paths that:
    1. Are 4-adjacent somewhere
    2. Have the same color
    3. Can be connected via shared/adjacent endpoints

    Returns merged path list.
    """
    if len(grid_paths_with_color) < 2:
        return grid_paths_with_color

    changed = True
    result = list(grid_paths_with_color)

    while changed:
        changed = False
        new_result = []
        merged_indices: Set[int] = set()

        for i in range(len(result)):
            if i in merged_indices:
                continue

            path_i, color_i = result[i]
            did_merge = False

            for j in range(i + 1, len(result)):
                if j in merged_indices:
                    continue

                path_j, color_j = result[j]

                # Only merge same-color paths
                if color_i != color_j:
                    continue

                # Check if adjacent
                if not are_paths_adjacent(path_i, path_j):
                    continue

                # Try to connect: check if endpoints are adjacent/shared
                # Cases: end-of-i → start-of-j, end-of-i → end-of-j, etc.
                merged_path = None

                def path_concat(pa, pb):
                    """Concatenate two paths, ensuring 4-connectivity at join."""
                    if not pa or not pb:
                        return pa + pb
                    # If endpoints are already identical or 4-adjacent, simple concat
                    dist = abs(pa[-1][0] - pb[0][0]) + abs(pa[-1][1] - pb[0][1])
                    if dist == 0:
                        return pa + pb[1:]
                    elif dist == 1:
                        return pa + pb
                    else:
                        # Should not happen if endpoints were properly detected as adjacent
                        return pa + pb

                # Case 1: i.end → j.start (natural continuation)
                if (
                    abs(path_i[-1][0] - path_j[0][0])
                    + abs(path_i[-1][1] - path_j[0][1])
                    <= 1
                ):
                    merged_path = path_concat(path_i, path_j)
                # Case 2: i.end → j.end (reverse j)
                elif (
                    abs(path_i[-1][0] - path_j[-1][0])
                    + abs(path_i[-1][1] - path_j[-1][1])
                    <= 1
                ):
                    merged_path = path_concat(path_i, list(reversed(path_j)))
                # Case 3: i.start → j.start (reverse i)
                elif (
                    abs(path_i[0][0] - path_j[0][0])
                    + abs(path_i[0][1] - path_j[0][1])
                    <= 1
                ):
                    merged_path = path_concat(list(reversed(path_i)), path_j)
                # Case 4: i.start → j.end (reverse both)
                elif (
                    abs(path_i[0][0] - path_j[-1][0])
                    + abs(path_i[0][1] - path_j[-1][1])
                    <= 1
                ):
                    merged_path = path_concat(list(reversed(path_i)), list(reversed(path_j)))

                if merged_path:
                    # Successful merge
                    result[i] = (merged_path, color_i)
                    path_i = merged_path  # update for potential cascade
                    merged_indices.add(j)
                    did_merge = True
                    changed = True

            if not did_merge:
                new_result.append((path_i, color_i))
            else:
                new_result.append((path_i, color_i))

        # Add unmerged paths
        for j in range(len(result)):
            if j not in merged_indices and j >= len(new_result):
                new_result.append(result[j])

        result = new_result

    return result


# ─────────────────── Arrow Processing ───────────────────


def split_monotonic(path: GridPath) -> List[GridPath]:
    """Split a path into monotonic segments (X and Y both monotonic)."""
    if len(path) < 2:
        return []

    segments: List[GridPath] = []
    cur: GridPath = [path[0]]
    dx_sign = 0
    dy_sign = 0

    for i in range(1, len(path)):
        r0, c0 = path[i - 1]
        r1, c1 = path[i]
        sdx = (1 if c1 > c0 else -1) if c1 != c0 else 0
        sdy = (1 if r1 > r0 else -1) if r1 != r0 else 0

        violates = False
        if sdx != 0 and dx_sign != 0 and sdx != dx_sign:
            violates = True
        if sdy != 0 and dy_sign != 0 and sdy != dy_sign:
            violates = True

        if violates:
            if len(cur) >= 2:
                segments.append(cur)
            cur = [path[i - 1], path[i]]
            dx_sign = sdx
            dy_sign = sdy
        else:
            if sdx != 0:
                dx_sign = sdx
            if sdy != 0:
                dy_sign = sdy
            cur.append(path[i])

    if len(cur) >= 2:
        segments.append(cur)
    return segments


def _is_monotonic(path: GridPath) -> bool:
    if len(path) < 2:
        return True
    dx_sign = 0
    dy_sign = 0
    for i in range(1, len(path)):
        r0, c0 = path[i - 1]
        r1, c1 = path[i]
        sdx = (1 if c1 > c0 else -1) if c1 != c0 else 0
        sdy = (1 if r1 > r0 else -1) if r1 != r0 else 0
        if sdx != 0:
            if dx_sign != 0 and sdx != dx_sign:
                return False
            dx_sign = sdx
        if sdy != 0:
            if dy_sign != 0 and sdy != dy_sign:
                return False
            dy_sign = sdy
    return True


def merge_short_segments(segments: List[GridPath], min_len: int = 3) -> List[GridPath]:
    """Try to merge adjacent short segments if the result is still monotonic."""
    if len(segments) <= 1:
        return segments

    merged: List[GridPath] = [segments[0]]
    for i in range(1, len(segments)):
        prev = merged[-1]
        cur = segments[i]
        if prev[-1] == cur[0] and (len(prev) < min_len or len(cur) < min_len):
            combined = prev + cur[1:]
            if _is_monotonic(combined):
                merged[-1] = combined
                continue
        merged.append(cur)
    return merged


# ─────────────────── Main ───────────────────


def main():
    ap = argparse.ArgumentParser(
        description="Import arrow image → level JSON (v6 path-first)"
    )
    ap.add_argument(
        "--input", default=None,
        help="Input PNG path (default: first PNG in test/)",
    )
    ap.add_argument(
        "--colors", type=int, default=0,
        help="Number of colour clusters (0 = auto-detect)",
    )
    ap.add_argument(
        "--alpha-threshold", type=int, default=1,
        help="Alpha threshold for stroke mask",
    )
    ap.add_argument(
        "--close-radius", type=int, default=-1,
        help="Morphological closing radius (-1 = auto, 0 = off)",
    )
    ap.add_argument("--force-step-x", type=int, default=0, help="Force grid step X")
    ap.add_argument("--force-step-y", type=int, default=0, help="Force grid step Y")
    ap.add_argument(
        "--min-arrow-len", type=int, default=2,
        help="Min arrow length in cells",
    )
    ap.add_argument(
        "--border-brightness", type=int, default=30,
        help="Luminance threshold for black border filtering (0 = off)",
    )
    ap.add_argument(
        "--simplify-epsilon", type=float, default=0.0,
        help="Douglas-Peucker simplification epsilon (0 = off)",
    )
    ap.add_argument(
        "--out", default="test/import_result_v6.json",
        help="Output JSON path",
    )
    ap.add_argument(
        "--debug", action="store_true",
        help="Save debug visualisation PNGs",
    )
    args = ap.parse_args()

    # ── resolve input ──
    if args.input is None:
        base = os.path.join(os.getcwd(), "test")
        pngs = [
            f
            for f in os.listdir(base)
            if f.lower().endswith(".png")
            and "_debug" not in f.lower()
            and "result" not in f.lower()
        ]
        if not pngs:
            raise SystemExit(
                "No PNG files found in test/ (excluding debug/result files)"
            )
        path = os.path.join(base, pngs[0])
    else:
        path = args.input

    print(f"[input]  {path}")

    # ── 1. Load & mask ──
    arr = load_image(path)
    h, w = arr.shape[:2]
    alpha = arr[..., 3]
    mask_alpha = alpha >= args.alpha_threshold
    print(f"[image]  {w}×{h}  stroke px: {mask_alpha.sum()}")

    # ── 1b. Filter black borders ──
    if args.border_brightness > 0:
        mask_orig = filter_dark_borders(arr, mask_alpha, args.border_brightness)
        n_removed = int(mask_alpha.sum() - mask_orig.sum())
        print(
            f"[border] removed {n_removed} dark border px "
            f"(luminance < {args.border_brightness})"
        )
    else:
        mask_orig = mask_alpha

    # ── 2. Line width ──
    line_width = estimate_line_width(mask_orig)
    print(f"[line]   width ≈ {line_width:.1f} px")

    # ── 3. Morphological closing ──
    close_r = args.close_radius
    if close_r < 0:  # auto
        close_r = max(1, int(line_width * 0.7))
    mask_combined = preprocess_mask(mask_orig, close_r)
    if close_r > 0:
        print(f"[close]  radius={close_r}  px after closing: {mask_combined.sum()}")

    # ── 4. Colour quantisation (for later path coloring) ──
    pixels = arr[mask_orig][:, :3]
    if pixels.size == 0:
        raise SystemExit("No stroke pixels found")

    dt = ndi.distance_transform_edt(mask_orig)
    dt_values = dt[mask_orig]

    if args.colors > 0:
        max_samples = 200_000
        n_px = pixels.shape[0]
        sample = (
            pixels
            if n_px <= max_samples
            else pixels[np.random.choice(n_px, max_samples, replace=False)]
        )
        kmeans = KMeans(n_clusters=args.colors, n_init="auto", random_state=0)
        kmeans.fit(sample)
        centers = kmeans.cluster_centers_.round().astype(int)
        labels_arr = kmeans.predict(pixels)
        n_colors = args.colors
    else:
        labels_arr, centers, n_colors = auto_cluster_colors(
            pixels, dt_values=dt_values, max_k=8,
        )

    # Label image
    label_img = np.full(mask_orig.shape, -1, dtype=np.int16)
    label_img[mask_orig] = labels_arr.astype(np.int16)

    palette = ["#{:02x}{:02x}{:02x}".format(*c) for c in centers]
    print(f"[color]  {n_colors} colours: {palette}")

    # ── 5. Grid step & skeleton extraction ──
    # Use mask_orig (NOT mask_combined) for skeleton to avoid bridging
    # separate arrows. Grid step estimation uses combined for better
    # periodicity, but skeleton uses original for better separation.
    step_x, _, step_y, _, _ = estimate_grid_step(
        mask_combined, line_width,
    )
    skeleton = zhang_suen_thinning(mask_orig)
    if step_x is None or step_y is None:
        raise SystemExit("Failed to estimate grid step")
    if args.force_step_x > 0:
        step_x = args.force_step_x
    if args.force_step_y > 0:
        step_y = args.force_step_y
    if step_x and step_y and abs(step_x - step_y) < max(step_x, step_y) * 0.15:
        step = round((step_x + step_y) / 2)
        step_x = step_y = step
    print(f"[grid]   step {step_x}×{step_y}")

    # ── 6. Grid offset ──
    ox_init = estimate_offset(mask_combined, step_x, axis=0)
    oy_init = estimate_offset(mask_combined, step_y, axis=1)

    best_ox, best_oy, best_score = ox_init, oy_init, -1.0
    search_range = max(2, step_x // 3)
    skel_ys, skel_xs = np.where(skeleton)
    for dox in range(-search_range, search_range + 1):
        for doy in range(-search_range, search_range + 1):
            test_ox = ox_init + dox
            test_oy = oy_init + doy
            if skel_xs.size == 0:
                continue
            cx = ((skel_xs - test_ox) % step_x) / step_x
            cy = ((skel_ys - test_oy) % step_y) / step_y
            in_centre = (
                (cx > 0.2) & (cx < 0.8) & (cy > 0.2) & (cy < 0.8)
            ).sum()
            if in_centre > best_score:
                best_score = in_centre
                best_ox, best_oy = test_ox, test_oy

    ox, oy = float(best_ox), float(best_oy)
    print(
        f"[grid]   offset ({ox:.1f}, {oy:.1f})  "
        f"(refined from {ox_init:.1f}, {oy_init:.1f})"
    )

    # ── 7. V6: Pixel-level path tracing (color-agnostic) ──
    print("[v6]     extracting pixel paths from skeleton...")
    pixel_paths = trace_skeleton_paths_v6(skeleton)
    print(f"[v6]     {len(pixel_paths)} pixel paths extracted")

    # Filter out very short fragments
    min_pixel_len = max(2, int(line_width))
    pixel_paths = [p for p in pixel_paths if len(p) >= min_pixel_len]
    print(f"[v6]     {len(pixel_paths)} paths after filtering (>= {min_pixel_len} px)")

    # ── 8. V6: Snap paths to grid + detect arrow heads ──
    print("[v6]     snapping paths to grid & detecting arrow heads...")
    epsilon = args.simplify_epsilon if args.simplify_epsilon > 0 else None
    grid_paths_with_color: List[Tuple[GridPath, int]] = []
    path_arrow_heads: List[bool] = []  # True if end is arrow head, False if start

    window_px = max(5, int(line_width * 2))

    for pp in pixel_paths:
        # Detect arrow head at endpoints (only)
        is_head_at_start = detect_arrow_head_at_endpoint(
            pp, mask_orig, endpoint_idx=0, window_size=window_px
        )
        is_head_at_end = detect_arrow_head_at_endpoint(
            pp, mask_orig, endpoint_idx=-1, window_size=window_px
        )

        # Orient path so arrow head is at the END
        if is_head_at_start and not is_head_at_end:
            pp_oriented = list(reversed(pp))
            head_at_end = True
        elif is_head_at_end:
            pp_oriented = pp
            head_at_end = True
        else:
            # No clear arrow head detected → keep original orientation
            pp_oriented = pp
            head_at_end = False

        # Snap to grid
        gp = snap_path_to_grid_v6(pp_oriented, step_x, step_y, ox, oy, epsilon)
        if len(gp) < 2:
            continue

        # Assign color to entire path
        color = assign_path_color(
            pp_oriented, label_img, dt, n_colors,
            edge_ignore_dt=max(0.3, line_width * 0.15),
        )

        grid_paths_with_color.append((gp, color))
        path_arrow_heads.append(head_at_end)

    n_detected_heads = sum(1 for h in path_arrow_heads if h)
    print(
        f"[v6]     {len(grid_paths_with_color)} grid paths "
        f"(avg len {sum(len(p) for p, _ in grid_paths_with_color) / len(grid_paths_with_color):.1f}, "
        f"{n_detected_heads} arrow heads detected)"
    )

    # ── 9. Compute grid bounds ──
    all_nodes: Set[Tuple[int, int]] = set()
    for gp, _ in grid_paths_with_color:
        all_nodes.update(gp)

    if not all_nodes:
        raise SystemExit("No cells mapped to grid")

    min_row = min(r for r, _ in all_nodes)
    min_col = min(c for _, c in all_nodes)
    max_row = max(r for r, _ in all_nodes)
    max_col = max(c for _, c in all_nodes)
    grid_w = max_col - min_col + 1
    grid_h = max_row - min_row + 1
    print(f"[grid]   {grid_w}×{grid_h}")

    # ── 10. Split at gaps only (NO monotonic constraint) ──
    #
    # Split ONLY where there are genuine gaps (non-4-connected).
    # Preserve all bends to minimize arrow fragmentation.
    arrows: list = []

    def split_at_gaps(path: GridPath) -> List[GridPath]:
        """Split a grid path at non-4-connected gaps."""
        if len(path) < 2:
            return [path] if path else []
        segments = []
        current = [path[0]]
        for i in range(1, len(path)):
            dist = abs(path[i][0] - path[i-1][0]) + abs(path[i][1] - path[i-1][1])
            if dist > 1:
                if len(current) >= 2:
                    segments.append(current)
                current = [path[i]]
            else:
                current.append(path[i])
        if len(current) >= 2:
            segments.append(current)
        return segments

    def has_backtrack(path: GridPath) -> bool:
        """Check if a path visits the same cell twice (backtracking/loop)."""
        return len(path) != len(set(path))

    filtered_count = 0
    for gp, color in grid_paths_with_color:
        shifted = [(r - min_row, c - min_col) for r, c in gp]
        
        # Filter out paths with backtracking (skeleton tracing artifact)
        if has_backtrack(shifted):
            filtered_count += 1
            continue
        
        gap_segs = split_at_gaps(shifted)

        for seg in gap_segs:
            if len(seg) < args.min_arrow_len:
                continue

            indices = [r * grid_w + c for r, c in seg]
            arrows.append(
                {
                    "id": f"import_c{color}_{len(arrows)}",
                    "indices": indices,
                    "style": {"color": palette[color]},
                }
            )

    if filtered_count > 0:
        print(f"[filter] removed {filtered_count} paths with backtracking")
    print(f"[arrows] total: {len(arrows)}")

    # ── 11. Output ──
    result = {
        "meta": {
            "source": os.path.basename(path),
            "lineWidthPx": round(float(line_width), 2),
            "gridStepX": int(step_x),
            "gridStepY": int(step_y),
            "offsetX": round(float(ox), 2),
            "offsetY": round(float(oy), 2),
            "closingRadius": int(close_r),
            "borderBrightness": int(args.border_brightness),
            "simplifyEpsilon": float(args.simplify_epsilon),
            "palette": palette,
        },
        "config": {"width": int(grid_w), "height": int(grid_h)},
        "cellSizeX": int(step_x),
        "cellSizeY": int(step_y),
        "arrows": arrows,
    }

    out_path = args.out
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"[out]    {out_path}")
    print(
        f"         grid {grid_w}×{grid_h}  cell {step_x}×{step_y}  "
        f"arrows {len(arrows)}"
    )

    # ── 12. Debug images ──
    if args.debug:
        from PIL import ImageDraw

        dbg_base = out_path.rsplit(".", 1)[0]

        # Step 1: skeleton
        bg = np.full((h, w, 4), 255, dtype=np.uint8)
        bg[mask_orig, 0] = 180; bg[mask_orig, 1] = 180; bg[mask_orig, 2] = 180; bg[mask_orig, 3] = 80
        bg[skeleton, 0] = 255; bg[skeleton, 1] = 0; bg[skeleton, 2] = 0; bg[skeleton, 3] = 220
        Image.fromarray(bg, "RGBA").save(f"{dbg_base}_step1_skeleton.png")
        print(f"  debug: step1_skeleton.png")

        # Step 2: pixel paths
        bg = np.full((h, w, 4), 255, dtype=np.uint8)
        path_colors = [
            (220, 40, 40), (40, 180, 40), (40, 40, 220),
            (220, 180, 40), (220, 40, 220), (40, 220, 220),
        ]
        img2 = Image.fromarray(bg, "RGBA")
        draw2 = ImageDraw.Draw(img2)
        for i, pp in enumerate(pixel_paths[:100]):  # limit to first 100
            pc = path_colors[i % len(path_colors)]
            pts = [(x, y) for y, x in pp]
            if len(pts) >= 2:
                draw2.line(pts, fill=(*pc, 180), width=2)
        img2.save(f"{dbg_base}_step2_pixel_paths.png")
        print(f"  debug: step2_pixel_paths.png (showing first 100 paths)")

        # Step 3: grid paths
        bg = np.full((h, w, 4), 255, dtype=np.uint8)
        img3 = Image.fromarray(bg, "RGBA")
        draw3 = ImageDraw.Draw(img3)
        for row in range(-2, 120):
            yy = int(oy + row * step_y)
            if 0 <= yy < h:
                draw3.line([(0, yy), (w - 1, yy)], fill=(210, 210, 210, 80))
        for col in range(-2, 80):
            xx = int(ox + col * step_x)
            if 0 <= xx < w:
                draw3.line([(xx, 0), (xx, h - 1)], fill=(210, 210, 210, 80))

        for gp, color in grid_paths_with_color:
            c = centers[color]
            pts = [
                (int(ox + col * step_x + step_x / 2), int(oy + row * step_y + step_y / 2))
                for row, col in gp
            ]
            if len(pts) >= 2:
                draw3.line(pts, fill=(int(c[0]), int(c[1]), int(c[2]), 180), width=2)

        img3.save(f"{dbg_base}_step3_grid_paths.png")
        print(f"  debug: step3_grid_paths.png")


if __name__ == "__main__":
    main()
