import React, { useEffect, useRef } from "react";
import { EventBus } from "./game/EventBus";

const Sound: React.FC = () => {
    // 使用useRef保存音频实例，避免重新渲染时重新创建
    const backgroundMusicRef = useRef<HTMLAudioElement | null>(null);
    const soundEffectsRef = useRef<{[key: string]: HTMLAudioElement}>({});

    useEffect(() => {
        // =====================================================
        // 示例：如何加载和控制音频
        // =====================================================
        
        // 1. 创建背景音乐实例
        // backgroundMusicRef.current = new Audio('assets/sounds/background-music.mp3');
        // backgroundMusicRef.current.loop = true;
        // backgroundMusicRef.current.volume = 0.5;
        
        // 2. 预加载音效
        // const effects = {
        //   click: 'assets/sounds/click.mp3',
        //   success: 'assets/sounds/success.mp3',
        //   fail: 'assets/sounds/fail.mp3',
        // };
        //
        // Object.entries(effects).forEach(([key, path]) => {
        //   const audio = new Audio(path);
        //   audio.preload = 'auto';
        //   soundEffectsRef.current[key] = audio;
        // });

        // 3. 触摸/点击时播放背景音乐（解决移动设备自动播放限制问题）
        const playBGM = () => {
          // if (backgroundMusicRef.current && backgroundMusicRef.current.paused) {
          //   backgroundMusicRef.current.play().catch(error => {
          //     console.log('背景音乐播放失败:', error);
          //   });
          // }
        };
        
        document.addEventListener('touchstart', playBGM, { once: true });
        document.addEventListener('click', playBGM, { once: true });

        // 4. 播放音效的函数
        const playSound = (key: string) => {
          // if (soundEffectsRef.current[key]) {
          //   soundEffectsRef.current[key].currentTime = 0;
          //   soundEffectsRef.current[key].play().catch(error => {
          //     console.log(`音效 ${key} 播放失败:`, error);
          //   });
          // }
        };

        // 5. 事件监听器 - 广告显示
        EventBus.on('showAd', () => {
          // 广告可见时恢复背景音乐
          // if (backgroundMusicRef.current) {
          //   backgroundMusicRef.current.play().catch(e => console.log('恢复音乐失败:', e));
          // }
        });

        // 6. 事件监听器 - 广告暂停
        EventBus.on('pauseAd', () => {
          // 广告不可见时暂停所有声音
          // if (backgroundMusicRef.current) {
          //   backgroundMusicRef.current.pause();
          // }
        });

        // 7. 游戏相关事件示例
        // EventBus.on('click', () => playSound('click'));
        // EventBus.on('success', () => playSound('success'));
        // EventBus.on('fail', () => playSound('fail'));
        // EventBus.on('game-over', () => {
        //   if (backgroundMusicRef.current) {
        //     backgroundMusicRef.current.pause();
        //   }
        //   playSound('game-over');
        // });

        // 清理函数
        return () => {
          document.removeEventListener('touchstart', playBGM);
          document.removeEventListener('click', playBGM);
          EventBus.removeListener('showAd');
          EventBus.removeListener('pauseAd');
          // EventBus.removeListener('click');
          // EventBus.removeListener('success');
          // EventBus.removeListener('fail');
          // EventBus.removeListener('game-over');
          
          // 停止并释放所有音频资源
          // if (backgroundMusicRef.current) {
          //   backgroundMusicRef.current.pause();
          //   backgroundMusicRef.current = null;
          // }
          // Object.values(soundEffectsRef.current).forEach(audio => {
          //   audio.pause();
          // });
          // soundEffectsRef.current = {};
        };
    }, []);

    return <></>;
};

export default Sound;