import { useRef, useEffect, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './game/PhaserGame';
import LevelSelect from './components/LevelSelect';
import './index.css';
import { Start } from './viewable-handler';
import { getInitialLevelFromURL, setPersistentSelectedLevel } from './game/levelSelection';

// 导入背景图片
import bgV from './assets/bg-v.png';
import bgH from './assets/bg-h.png';

/**
 * 主应用组件
 * 集成Phaser游戏与React UI，无 URL ?level= 时先显示选关界面
 */
function App() {
    const phaserRef = useRef<IRefPhaserGame | null>(null);
    const [bgImage, setBgImage] = useState<string>('');

    const initialLevelFromURL = getInitialLevelFromURL();
    const hasInitialLevel = initialLevelFromURL !== null;
    const [levelSelectVisible, setLevelSelectVisible] = useState(!hasInitialLevel);
    const [gameVisible, setGameVisible] = useState(hasInitialLevel);

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
        setPersistentSelectedLevel(difficulty);
        setLevelSelectVisible(false);
        setGameVisible(true);
    };

    const currentScene = (scene: Phaser.Scene) => {
        // 场景切换时的处理
    };

    return (
        <div id="app" style={{ backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
            {levelSelectVisible && <LevelSelect onSelectLevel={handleSelectLevel} />}
            {gameVisible && <PhaserGame ref={phaserRef} currentActiveScene={currentScene} />}
        </div>
    );
}

export default App;
