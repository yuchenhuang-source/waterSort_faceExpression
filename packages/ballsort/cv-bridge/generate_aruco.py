#!/usr/bin/env python3
"""
Generate ArUco marker PNGs for Phase 2 CV debug mode.
IDs: 0-13 tubes, 100-199 balls, 200 hand, 210-213 board corners.
Output: packages/ballsort/public/aruco/aruco_N.png
"""
import os
import sys

try:
    import cv2
except ImportError:
    print("Error: opencv-python required. Run: pip install opencv-python opencv-contrib-python")
    sys.exit(1)

# Output directory (relative to script location)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PKG_DIR = os.path.dirname(SCRIPT_DIR)
OUT_DIR = os.path.join(PKG_DIR, "public", "aruco")
SIZE_PX = 128  # Marker size in pixels


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    try:
        aruco_dict = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_ARUCO_ORIGINAL)
    except AttributeError:
        print("Error: DICT_ARUCO_ORIGINAL not found. Try: pip install opencv-contrib-python")
        sys.exit(1)

    # Generate marker image - API differs between OpenCV versions
    def gen_marker(marker_id: int):
        try:
            return cv2.aruco.generateImageMarker(aruco_dict, marker_id, SIZE_PX)
        except AttributeError:
            return cv2.aruco.drawMarker(aruco_dict, marker_id, SIZE_PX)

    ids = (
        list(range(14))  # 0-13 tubes
        + list(range(100, 200))  # 100-199 balls (100 + tubeId*10 + slot)
        + [200]  # hand
        + [201, 202]  # 201 icon, 202 download button
        + list(range(210, 214))  # 210-213 board corners
    )

    BORDER_PX = 25  # 白边有助于 OpenCV ArUco 检测
    for marker_id in ids:
        img = gen_marker(marker_id)
        img = cv2.copyMakeBorder(img, BORDER_PX, BORDER_PX, BORDER_PX, BORDER_PX, cv2.BORDER_CONSTANT, value=255)
        path = os.path.join(OUT_DIR, f"aruco_{marker_id}.png")
        cv2.imwrite(path, img)
        print(f"Generated {path}")

    print(f"Done. {len(ids)} markers in {OUT_DIR}")


if __name__ == "__main__":
    main()
