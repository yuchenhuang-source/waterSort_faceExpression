import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { SpineLoader } from '../utils/SpineLoader';

// 导入Spine资源
import fireworkAtlas from '../../assets/spine/Firework/Firework.atlas.txt?raw';
import fireworkJson from '../../assets/spine/Firework/Fireworks.json';
import fireworkPng from '../../assets/spine/Firework/Firework.png';

import particleAtlas from '../../assets/spine/Particle/Particle.atlas.txt?raw';
import particleJson from '../../assets/spine/Particle/Particle.json';
import particlePng from '../../assets/spine/Particle/Particle.png';

/**
 * Spine动画测试场景
 * 使用SpineLoader组件简化加载流程
 */
export class SpineTestScene extends Scene {
    private fireworkSpine: any = null;
    private particleSpine: any = null;

    constructor() {
        super('SpineTestScene');
    }

    init() {
        this.cameras.main.setBackgroundColor('#1a1a2e');
    }

    preload() {
        // 使用SpineLoader批量加载
        SpineLoader.loadMultiple(this, [
            {
                key: 'firework',
                json: fireworkJson,
                atlas: fireworkAtlas,
                textures: { 'Firework.png': fireworkPng }
            },
            {
                key: 'particle',
                json: particleJson,
                atlas: particleAtlas,
                textures: { 'Particle.png': particlePng }
            }
        ]);
    }

    create() {
        // 使用SpineLoader创建Spine动画
        this.fireworkSpine = SpineLoader.create(this, 540, 600, 'firework', 'high', true);
        this.particleSpine = SpineLoader.create(this, 540, 1300, 'particle', 'High', true);

        // 添加标题
        this.add.text(540, 100, 'Spine动画测试场景', {
            fontSize: '48px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // 添加Firework动画标签和按钮
        this.add.text(540, 350, 'Firework 动画', {
            fontSize: '32px',
            color: '#ff6b6b'
        }).setOrigin(0.5);

        this.createAnimationButtons(
            540, 420, 
            SpineLoader.getAnimations(this.fireworkSpine),
            '#ff6b6b',
            (anim) => SpineLoader.playAnimation(this.fireworkSpine, anim, true)
        );

        // 添加Particle动画标签和按钮
        this.add.text(540, 1050, 'Particle 动画', {
            fontSize: '32px',
            color: '#4ecdc4'
        }).setOrigin(0.5);

        this.createAnimationButtons(
            540, 1120,
            SpineLoader.getAnimations(this.particleSpine),
            '#4ecdc4',
            (anim) => SpineLoader.playAnimation(this.particleSpine, anim, true)
        );

        // 添加返回按钮
        const backButton = this.add.text(100, 50, '← 返回游戏', {
            fontSize: '28px',
            color: '#4ecdc4',
            backgroundColor: '#16213e',
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5);
        
        backButton.setInteractive({ useHandCursor: true });
        backButton.on('pointerover', () => backButton.setColor('#ff6b6b'));
        backButton.on('pointerout', () => backButton.setColor('#4ecdc4'));
        backButton.on('pointerdown', () => this.scene.start('Game'));

        // 通知场景就绪
        EventBus.emit('current-scene-ready', this);
    }

    /**
     * 创建动画切换按钮
     */
    private createAnimationButtons(
        centerX: number,
        y: number,
        animations: string[],
        color: string,
        onClick: (anim: string) => void
    ) {
        const buttonWidth = 150;
        const totalWidth = animations.length * buttonWidth;
        const startX = centerX - totalWidth / 2 + buttonWidth / 2;

        animations.forEach((anim, index) => {
            const btn = this.add.text(startX + index * buttonWidth, y, `▶ ${anim}`, {
                fontSize: '24px',
                color: color,
                backgroundColor: '#16213e',
                padding: { x: 15, y: 8 }
            }).setOrigin(0.5);

            btn.setInteractive({ useHandCursor: true });
            btn.on('pointerover', () => {
                btn.setScale(1.1);
                btn.setColor('#ffffff');
            });
            btn.on('pointerout', () => {
                btn.setScale(1);
                btn.setColor(color);
            });
            btn.on('pointerdown', () => onClick(anim));
        });
    }
}