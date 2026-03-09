# @ballsort-multi/phaser-cv

Color-encoded instance segmentation for Phaser games - CV bridge, integration, and Python server.

## Demo

**[phaser-cv-demo](../phaser-cv-demo)** is the official demo showing full CV integration:

```bash
# From repo root
npm run dev:demo

# Or from demo package
cd packages/phaser-cv-demo && npm run dev:cv
```

- Game: http://localhost:8080?cv=1 (press **S** to capture frame)
- CV UI: http://localhost:5000

## Installation

```bash
npm install @ballsort-multi/phaser-cv
# or with local: "dependencies": { "@ballsort-multi/phaser-cv": "file:../phaser-cv" }
```

## Setup (CV server)

One-time Python venv setup:

```bash
cd packages/phaser-cv
python3 -m venv cv-bridge/venv
cv-bridge/venv/bin/pip install -r cv-bridge/requirements.txt
```

## API

See [docs/CvColorCode接入指南.md](../phaser-cv-demo/docs/CvColorCode接入指南.md) in the demo package for full integration guide.

## Usage

```typescript
import { initCvIntegration, CvAutoInitPlugin } from '@ballsort-multi/phaser-cv';

// Register plugin in game config
plugins: { scene: [{ key: 'CvAutoInit', plugin: CvAutoInitPlugin, mapping: 'cvAutoInit' }] }

// Implement getCvAdapter() in your main scene
getCvAdapter() {
  return {
    getStaticCvIds: () => [500, 501, 502, 1000, 1001],
    getRootRenderable: () => this.board,
    getStaticTintables: () => this.cvTintables,
    getActiveIds: () => this.board.getColorCodeObjectIds(),
  };
}
```

## Packages

- [phaser-cv-demo](../phaser-cv-demo) - Official demo (Ballsort)
- [watersort-playable--v2](../watersort-playable--v2) - Another game using phaser-cv
