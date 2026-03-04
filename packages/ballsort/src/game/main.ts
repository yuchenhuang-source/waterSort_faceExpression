import { Boot } from './scenes/Boot';
import { GameOver } from './scenes/GameOver';
import { Game as MainGame } from './scenes/Game';
// import { Game as MainGameLand } from './scenes/Game-LandScape';
import { WEBGL, Game } from 'phaser';
import { Preloader } from './scenes/Preloader';
import { SpineTestScene } from './scenes/SpineTestScene';
import { SpinePlugin } from '@esotericsoftware/spine-phaser-v3';

//  Find out more information about the Game Config at:
//  https://newdocs.phaser.io/docs/3.70.0/Phaser.Types.Core.GameConfig
const config: Phaser.Types.Core.GameConfig = {
    type: WEBGL,
    preserveDrawingBuffer: true,  // 使 toDataURL 能正确捕获画面（CV 黑屏修复）
    width: 1080,
    height: 1920,
    transparent: true,
    parent: 'game-container',
    fps: {
        target: 60,
        forceSetTimeOut: false,
    },
    render: {
        antialias: false,
        pixelArt: false,
        roundPixels: true,
        batchSize: 4096,
        maxTextures: 16,
    },
    scene: [
        Boot,
        Preloader,
        MainGame,
        GameOver,
        SpineTestScene,
        // MainGameLand
    ],
    plugins: {
        scene: [
            { key: 'spine.SpinePlugin', plugin: SpinePlugin, mapping: 'spine' }
        ]
    }
};

const StartGame = (parent: string) => {

    return new Game({ ...config, parent });

}

export default StartGame;
