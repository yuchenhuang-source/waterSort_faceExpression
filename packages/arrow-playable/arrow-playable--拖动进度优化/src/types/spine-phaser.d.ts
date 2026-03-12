/**
 * Spine Phaser 类型定义
 * 为 @esotericsoftware/spine-phaser-v3 提供类型支持
 */

declare module '@esotericsoftware/spine-phaser-v3' {
  import { GameObjects, Scene } from 'phaser';

  export class SpineGameObject extends GameObjects.GameObject {
    constructor(scene: Scene, x: number, y: number, key: string, atlasKey: string);
    
    // 基本属性
    x: number;
    y: number;
    visible: boolean;
    alpha: number;
    
    // Spine特有属性
    skeleton: any;
    animationState: any;
    
    // 基本方法
    setPosition(x: number, y: number): this;
    setVisible(visible: boolean): this;
    setAlpha(alpha: number): this;
    setScale(x: number, y?: number): this;
    setDepth(depth: number): this;
    destroy(): void;
    
    // Spine动画方法
    play(animationName: string, loop?: boolean): this;
    setAnimation(trackIndex: number, animationName: string, loop?: boolean): any;
    getAnimationList(): string[];
    
    // 混合模式
    setBlendMode(mode: number): this;
  }

  export class SpinePlugin extends Phaser.Plugins.ScenePlugin {
    constructor(scene: Scene, pluginManager: Phaser.Plugins.PluginManager);
    
    add: {
      spine(x: number, y: number, key: string, atlasKey: string): SpineGameObject;
    };
  }
}

// 扩展 Phaser 类型
declare module 'phaser' {
  namespace GameObjects {
    interface GameObjectFactory {
      spine(x: number, y: number, key: string, atlasKey: string): import('@esotericsoftware/spine-phaser-v3').SpineGameObject;
    }
  }
}