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

- Game: http://localhost:8080?cv=1
- CV UI: http://localhost:5000

Press **S** in the game to step one frame (game pauses until CV responds).
