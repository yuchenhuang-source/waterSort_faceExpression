import { useRef, useEffect, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './game/PhaserGame';
import LevelSelect from './components/LevelSelect';
import FpsDisplay from './components/FpsDisplay';
import './index.css';
import { Start } from './viewable-handler';
import { EventBus } from './game/EventBus';
import { getInitialLevelFromURL, setPersistentSelectedLevel, isLevelSelectionReady } from './game/levelSelection';
import { pregeneratePuzzles } from './utils/puzzleCache';
import { refreshConfig } from './game/constants/configLoader';
// CV 录制功能已暂时注释。恢复时取消下方注释。
// import { CV_RECORD_PLAY, CV_RECORD_PAUSE, CV_RECORD_END, CV_RECORD_STATUS } from './game/cvRecordEvents';

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
    const [screenshotVersion, setScreenshotVersion] = useState(0);

    const initialLevelFromURL = getInitialLevelFromURL();
    const hasInitialLevel = initialLevelFromURL !== null;
    const [levelSelectVisible, setLevelSelectVisible] = useState(!hasInitialLevel);

    useEffect(() => {
        pregeneratePuzzles();
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handler = async (e: MessageEvent) => {
            if (e.data?.type === 'level-screenshots-updated') {
                await refreshConfig();
                setScreenshotVersion((v) => v + 1);
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []);

    // CV 录制功能已暂时注释：不再监听 cv-record-play/pause/end、cv-capture-frame，不再转发 CV_RECORD_STATUS。恢复时取消下方注释。
    /*
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const isCV = new URLSearchParams(window.location.search).get('cv') === '1';
        const inIframe = window.self !== window.top;
        if (!isCV || !inIframe) return;
        const handler = (e: MessageEvent) => {
            if (e.data?.type === 'cv-record-play') {
                console.log('[CV-RECORD] iframe received play');
                EventBus.emit(CV_RECORD_PLAY);
            } else if (e.data?.type === 'cv-record-pause') EventBus.emit(CV_RECORD_PAUSE);
            else if (e.data?.type === 'cv-record-end') EventBus.emit(CV_RECORD_END);
            else if (e.data?.type === 'cv-capture-frame') {
                const game = phaserRef.current?.game;
                if (!game) return;
                const gameScene = game.scene.getScene('Game') as any;
                if (!gameScene || typeof gameScene.captureColorCodedFrame !== 'function') return;
                const frame = gameScene.captureColorCodedFrame();
                window.parent.postMessage({ type: 'cv-frame-data', ...frame }, '*');
            }
        };
        window.addEventListener('message', handler);
        const unsub = (s: string) => {
            if (window.self !== window.top) window.parent.postMessage({ type: 'cv-record-status', status: s }, '*');
        };
        EventBus.on(CV_RECORD_STATUS, unsub);
        return () => {
            window.removeEventListener('message', handler);
            EventBus.off(CV_RECORD_STATUS, unsub);
        };
    }, []);
    */

    useEffect(() => {
        const onGameReady = () => {
            gameReadyRef.current = true;
            if (isLevelSelectionReady()) {
                setLevelSelectVisible(false);
                EventBus.emit('game-visible'); // 有初始关卡时游戏立即可见，用于引导手指计时起点
            }
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
        <div id="app" className={levelSelectVisible ? 'level-select-visible' : ''} style={{ backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
            <PhaserGame ref={phaserRef} currentActiveScene={currentScene} />
            {levelSelectVisible && <LevelSelect onSelectLevel={handleSelectLevel} screenshotVersion={screenshotVersion} />}
            {import.meta.env.DEV ? <FpsDisplay /> : null}
        </div>
    );
}

export default App;
