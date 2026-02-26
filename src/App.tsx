import { useRef, useEffect, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './game/PhaserGame';
import './index.css';
import { Start } from './viewable-handler';

// 导入背景图片
import bgV from './assets/bg-v.png';
import bgH from './assets/bg-h.png';

/**
 * 主应用组件
 * 集成Phaser游戏与React UI
 */
function App() {
    // 引用Phaser游戏实例
    const phaserRef = useRef<IRefPhaserGame | null>(null);
    const [bgImage, setBgImage] = useState<string>('');

    useEffect(() => {
        // 加载背景图片
        const loadBackground = () => {
            const isPortrait = window.innerHeight > window.innerWidth;
            setBgImage(isPortrait ? bgV : bgH);
        };

        loadBackground();
        window.addEventListener('resize', loadBackground);

        // 启动可玩广告处理程序
        Start();

        return () => {
            window.removeEventListener('resize', loadBackground);
        };
    }, []);

    // 处理当前活动场景的回调函数
    // 可用于在场景切换时执行特定逻辑
    const currentScene = (scene: Phaser.Scene) => {
        // 场景切换时的处理示例
        // console.log('当前活动场景:', scene.scene.key);
    }

    return (
        <div id="app" style={{ backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
            <PhaserGame ref={phaserRef} currentActiveScene={currentScene} />
        </div>
    );
}

export default App;
