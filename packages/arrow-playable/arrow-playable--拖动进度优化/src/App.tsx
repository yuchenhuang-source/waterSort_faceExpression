import { useRef, useEffect, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './game/PhaserGame';
import './index.css';
import bgPortrait from '@/assets/bg-v.png';
import bgLandscape from '@/assets/bg-h.png';
import Sound from './sound';
import { Start } from './viewable-handler';
import { EditorUI } from './components/EditorUI';
import { IntroVideo } from './components/IntroVideo';
import { getOutputConfigValueAsync } from './utils/outputConfigLoader';

/**
 * 主应用组件
 * 集成Phaser游戏与React UI
 */
function App() {
    // 引用Phaser游戏实例
    const phaserRef = useRef<IRefPhaserGame | null>(null);
    const [isEditorMode, setIsEditorMode] = useState(false);
    /** 是否播放开场视频（从 output-config.playIntroVideo 读取，默认 true） */
    const [playIntroVideo, setPlayIntroVideo] = useState(true);

    useEffect(() => {
        // 检查 URL 参数 editor=1
        const urlParams = new URLSearchParams(window.location.search);
        const isEditor = urlParams.get('editor') === '1';
        setIsEditorMode(isEditor);
        // 从 output-config 读取是否播放开场视频
        getOutputConfigValueAsync<boolean>('playIntroVideo', true).then(setPlayIntroVideo);
        // 启动可玩广告处理程序
        Start();
    }, []);

    // 处理当前活动场景的回调函数
    // 可用于在场景切换时执行特定逻辑
    const currentScene = (scene: Phaser.Scene) => {
        // 场景切换时的处理示例
        // console.log('当前活动场景:', scene.scene.key);
    }
    const isLandscape = typeof window !== 'undefined' && window.innerWidth > window.innerHeight;
    const bgImage = isLandscape ? bgLandscape : bgPortrait;

    return (
        <div id="app" style={{ backgroundImage: `url(${bgImage})` }}    >
            <IntroVideo skip={isEditorMode || !playIntroVideo} />
            <PhaserGame ref={phaserRef} currentActiveScene={currentScene} />
            {isEditorMode && <EditorUI />}
            <Sound />
        </div>
    );
}

export default App;
