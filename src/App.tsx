import { useRef, useEffect, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './game/PhaserGame';
import LevelSelect from './components/LevelSelect';
import './index.css';
import { Start } from './viewable-handler';
import { EventBus } from './game/EventBus';
import { getInitialLevelFromURL, setPersistentSelectedLevel, isLevelSelectionReady } from './game/levelSelection';
import { pregeneratePuzzles } from './utils/puzzleCache';

// 导入背景图片
import bgV from './assets/bg-v.png';
import bgH from './assets/bg-h.png';

/**
 * 主应用组件
 * 集成Phaser游戏与React UI，无 URL ?level= 时先显示选关界面
 * 用户点击关卡卡片后立即隐藏选关页面所有元素
 */
function App() {
    const phaserRef = useRef<IRefPhaserGame | null>(null);
    const gameReadyRef = useRef(false);
    const [bgImage, setBgImage] = useState<string>('');

    const initialLevelFromURL = getInitialLevelFromURL();
    const hasInitialLevel = initialLevelFromURL !== null;
    const [levelSelectVisible, setLevelSelectVisible] = useState(!hasInitialLevel);

    useEffect(() => {
        pregeneratePuzzles();
    }, []);

    useEffect(() => {
        const onGameReady = () => {
            gameReadyRef.current = true;
            if (isLevelSelectionReady()) setLevelSelectVisible(false);
        };
        EventBus.on('current-scene-ready', onGameReady);
        return () => {
            EventBus.off('current-scene-ready', onGameReady);
            gameReadyRef.current = false;
        };
    }, []);

    useEffect(() => {
        const loadBackground = () => {
            const isPortrait = window.innerHeight > window.innerWidth;
            setBgImage(isPortrait ? bgV : bgH);
        };

        loadBackground();
        window.addEventListener('resize', loadBackground);

        Start();

        return () => {
            window.removeEventListener('resize', loadBackground);
        };
    }, []);

    const handleSelectLevel = (difficulty: number) => {
        console.log('[TIMING] 点击选择关卡', { difficulty, t: performance.now(), ts: new Date().toISOString() });
        setPersistentSelectedLevel(difficulty);
        setLevelSelectVisible(false); // 点击后立即隐藏选关页面所有元素
    };

    const currentScene = (scene: Phaser.Scene) => {
        // 场景切换时的处理
    };

    return (
        <div id="app" style={{ backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
            <PhaserGame ref={phaserRef} currentActiveScene={currentScene} />
            {levelSelectVisible && <LevelSelect onSelectLevel={handleSelectLevel} />}
        </div>
    );
}

export default App;
