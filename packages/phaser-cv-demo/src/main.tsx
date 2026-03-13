import React from 'react';
import ReactDOM from 'react-dom/client';
import { fetchGameConstants } from './game/constants/configLoader';
import { initGameConstants } from './game/constants/GameConstants';

async function bootstrap() {
  const config = await fetchGameConstants();
  initGameConstants(config as Parameters<typeof initGameConstants>[0]);

  const { pregeneratePuzzles } = await import('./utils/puzzleCache');
  pregeneratePuzzles();

  const App = (await import('./App')).default;

  // DEV: 仅启动游戏，不启动 Simulator。Simulator 在 arrow-playable--main 中运行。
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap();
