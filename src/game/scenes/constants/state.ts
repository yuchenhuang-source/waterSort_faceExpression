export const Global = {
  containers: [0, 0, 0],
  score: 0,
  started: false,
  orientation: 0,
  y: 300,
  clearCount: 0,
  maxClearCount: 8,
  guideBlockId: ['0-0', '0-1', '0-2'],
  currentGuideId: '0-0',
  current: 0,
  puzzle: [
    [2, 2, 2, 4, 4],
    [16, 4, 8, 8, 8],
    [16, 32, 32, 64, 64],
    [16, 128, 256, 1024, 128],
    [32, 256, 128, 256, 1024],
    [64, 1024, 1024, 256, 256],
    [64, 128, 128, 512, 256],
    [2048, 128, 64, 1024, 256],
    [512, 1024, 128, 128, 256],
  ]
};