# CV Bridge

Python server for Game ↔ CV communication. WebSocket on 8765, HTTP (CV UI) on 5000.

## Setup (one-time)

```bash
cd packages/ballsort
python3 -m venv cv-bridge/venv
cv-bridge/venv/bin/pip install -r cv-bridge/requirements.txt
```

## Run

```bash
cd packages/ballsort
npm run dev:cv
```

- Game: http://localhost:8080?cv=1 (manual: press S to step) or http://localhost:8080?cv=1&auto=1 (auto-send frames)
- CV UI: http://localhost:5000

Press **S** in the game to step one frame (game pauses until CV responds).

**Capture scope**: We capture `game.canvas` — Phaser's render target only. This does NOT include the simulator frame, toolbar, constants editor, or any DOM overlays. When the game runs in the simulator iframe, the canvas is purely the game content.
