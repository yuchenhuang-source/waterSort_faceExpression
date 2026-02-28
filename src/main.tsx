import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { DeviceSimulator } from './components/DeviceSimulator';
import { pregeneratePuzzles } from './utils/puzzleCache';

// 尽早启动配置与谜题加载，与 React/Phaser 初始化并行
pregeneratePuzzles();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <DeviceSimulator>
            <App />
        </DeviceSimulator>
    </React.StrictMode>,
)
