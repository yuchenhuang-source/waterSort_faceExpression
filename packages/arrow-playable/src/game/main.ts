import { Boot } from './scenes/Boot';
import { GameOver } from './scenes/GameOver';
import { Game as MainGame } from './scenes/Game';
import { ArrowTest } from './scenes/ArrowTest';
import { BoardTest } from './scenes/BoardTest';
import { Editor } from './scenes/Editor';
// import { Game as MainGameLand } from './scenes/Game-LandScape';
import { AUTO, Game } from 'phaser';
import { Preloader } from './scenes/Preloader';

//  Find out more information about the Game Config at:
//  https://newdocs.phaser.io/docs/3.70.0/Phaser.Types.Core.GameConfig
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    transparent: true,
    parent: 'game-container',

    scene: [
        Boot,
        Preloader,
        BoardTest, // 棋盘测试场景
        ArrowTest, // 箭头测试场景
        MainGame,
        GameOver,
        Editor, // 编辑器场景
        // MainGameLand
    ]
};

const StartGame = (parent: string) => {

    return new Game({ ...config, parent });

}

export default StartGame;
