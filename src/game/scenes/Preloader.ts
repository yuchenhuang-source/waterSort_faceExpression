import { Scene } from 'phaser';
import { LIQUID_UP_FRAME_RATE, SPLASH_FRAME_RATE } from '../constants/GameConstants';
import { EventBus } from '../EventBus';
import { SpineLoader } from '../utils/SpineLoader';
import { getOutputConfigValueAsync } from '../../utils/outputConfigLoader';
import { loadAssetGroup } from 'virtual:game-assets';
import { generatePuzzleWithAdapter, PuzzleAdapterResult } from '../../utils/puzzle-adapter';
import { getCachedPuzzle, waitForPregenerate } from '../../utils/puzzleCache';
import { getPersistentSelectedLevel } from '../levelSelection';

// 导入游戏图片资源
import downloadBtn from '../../assets/按钮.png';
import icon from '../../assets/icon.png';
import hand from '../../assets/手.png';
import tube from '../../assets/试管.png';
import tubeBody from '../../assets/试管-管身.png';
import tubeMouth from '../../assets/试管-管口.png';

// 导入球图片
import ballBrown from '../../assets/ball/棕.png';
import ballOrange from '../../assets/ball/橙.png';
import ballLightPurple from '../../assets/ball/浅紫.png';
import ballGray from '../../assets/ball/灰.png';
import ballPink from '../../assets/ball/粉.png';
import ballPurple from '../../assets/ball/紫.png';
import ballRed from '../../assets/ball/红.png';
import ballGreen from '../../assets/ball/绿.png';
import ballFluorescentGreen from '../../assets/ball/荧光绿.png';
import ballBlue from '../../assets/ball/蓝.png';
import ballCyan from '../../assets/ball/青.png';
import ballYellow from '../../assets/ball/黄.png';

// 导入蜡烛图片 (注意：蜡烛目录中没有"蜡烛紫.png"，只有"蜡烛浅紫.png")
import candleBrown from '../../assets/candle/蜡烛棕.png';
import candleOrange from '../../assets/candle/蜡烛橙.png';
import candleLightPurple from '../../assets/candle/蜡烛浅紫.png';
import candleGray from '../../assets/candle/蜡烛灰.png';
import candlePink from '../../assets/candle/蜡烛粉.png';
import candlePurple from '../../assets/candle/蜡烛紫.png';
import candleRed from '../../assets/candle/蜡烛红.png';
import candleGreen from '../../assets/candle/蜡烛绿.png';
import candleFluorescentGreen from '../../assets/candle/蜡烛荧光绿.png';
import candleBlue from '../../assets/candle/蜡烛蓝.png';
import candleCyan from '../../assets/candle/蜡烛青.png';
import candleYellow from '../../assets/candle/蜡烛黄.png';

// 导入高亮图片
import highlightBrownBody from '../../assets/高亮/试管高亮棕-管身.png';
import highlightBrownMouth from '../../assets/高亮/试管高亮棕-管口.png';
import highlightOrangeBody from '../../assets/高亮/试管高亮橙-管身.png';
import highlightOrangeMouth from '../../assets/高亮/试管高亮橙-管口.png';
import highlightLightPurpleBody from '../../assets/高亮/试管高亮浅紫-管身.png';
import highlightLightPurpleMouth from '../../assets/高亮/试管高亮浅紫-管口.png';
import highlightGrayBody from '../../assets/高亮/试管高亮灰-管身.png';
import highlightGrayMouth from '../../assets/高亮/试管高亮灰-管口.png';
import highlightPinkBody from '../../assets/高亮/试管高亮粉-管身.png';
import highlightPinkMouth from '../../assets/高亮/试管高亮粉-管口.png';
import highlightPurpleBody from '../../assets/高亮/试管高亮紫-管身.png';
import highlightPurpleMouth from '../../assets/高亮/试管高亮紫-管口.png';
import highlightRedBody from '../../assets/高亮/试管高亮红-管身.png';
import highlightRedMouth from '../../assets/高亮/试管高亮红-管口.png';
import highlightGreenBody from '../../assets/高亮/试管高亮绿-管身.png';
import highlightGreenMouth from '../../assets/高亮/试管高亮绿-管口.png';
import highlightFluorescentGreenBody from '../../assets/高亮/试管高亮荧光绿-管身.png';
import highlightFluorescentGreenMouth from '../../assets/高亮/试管高亮荧光绿-管口.png';
import highlightBlueBody from '../../assets/高亮/试管高亮蓝-管身.png';
import highlightBlueMouth from '../../assets/高亮/试管高亮蓝-管口.png';
import highlightCyanBody from '../../assets/高亮/试管高亮青-管身.png';
import highlightCyanMouth from '../../assets/高亮/试管高亮青-管口.png';
import highlightYellowBody from '../../assets/高亮/试管高亮黄-管身.png';
import highlightYellowMouth from '../../assets/高亮/试管高亮黄-管口.png';

// 导入Spine资源 - Particle粒子特效
import particleAtlas from '../../assets/spine/Particle/Particle.atlas.txt?raw';
import particleJson from '../../assets/spine/Particle/Particle.json';
import particlePng from '../../assets/spine/Particle/Particle.png';

// 导入Spine资源 - Firework烟花特效
import fireworkAtlas from '../../assets/spine/Firework/Firework.atlas.txt?raw';
import fireworkJson from '../../assets/spine/Firework/Fireworks.json';
import fireworkPng from '../../assets/spine/Firework/Firework.png';

// 导入火焰序列帧（25帧）
import fire00000 from '../../assets/fire/fire_00000.png';
import fire00001 from '../../assets/fire/fire_00001.png';
import fire00002 from '../../assets/fire/fire_00002.png';
import fire00003 from '../../assets/fire/fire_00003.png';
import fire00004 from '../../assets/fire/fire_00004.png';
import fire00005 from '../../assets/fire/fire_00005.png';
import fire00006 from '../../assets/fire/fire_00006.png';
import fire00007 from '../../assets/fire/fire_00007.png';
import fire00008 from '../../assets/fire/fire_00008.png';
import fire00009 from '../../assets/fire/fire_00009.png';
import fire00010 from '../../assets/fire/fire_00010.png';
import fire00011 from '../../assets/fire/fire_00011.png';
import fire00012 from '../../assets/fire/fire_00012.png';
import fire00013 from '../../assets/fire/fire_00013.png';
import fire00014 from '../../assets/fire/fire_00014.png';
import fire00015 from '../../assets/fire/fire_00015.png';
import fire00016 from '../../assets/fire/fire_00016.png';
import fire00017 from '../../assets/fire/fire_00017.png';
import fire00018 from '../../assets/fire/fire_00018.png';
import fire00019 from '../../assets/fire/fire_00019.png';
import fire00020 from '../../assets/fire/fire_00020.png';
import fire00021 from '../../assets/fire/fire_00021.png';
import fire00022 from '../../assets/fire/fire_00022.png';
import fire00023 from '../../assets/fire/fire_00023.png';
import fire00024 from '../../assets/fire/fire_00024.png';

import tubeMask from '../../assets/tube_mask.png';
import liquidSurface from '../../assets/liquid/surface.png';

// 使用 import.meta.glob 批量导入液体动画序列帧
const liquidUpImgs = import.meta.glob('../../assets/liquid/1出瓶子/*.png', { eager: true, import: 'default' });
const ballExpressionImgs = import.meta.glob('../../assets/圆球表情/*.png', { eager: true, import: 'default' });
const liquidStillImgs = import.meta.glob('../../assets/liquid/2原地暂停/*.png', { eager: true, import: 'default' });
const liquidMoveImgs = import.meta.glob('../../assets/liquid/3移动和下降/*.png', { eager: true, import: 'default' });
const liquidDropImgs = import.meta.glob('../../assets/liquid/4落入水中/*.png', { eager: true, import: 'default' });
const liquidSplashImgs = import.meta.glob('../../assets/liquid/splash/*.png', { eager: true, import: 'default' });

/**
 * 预加载场景
 * 负责加载游戏资源并初始化游戏
 */
export class Preloader extends Scene {
    constructor() {
        super('Preloader');
    }

    init() {
        this.cameras.main.setBackgroundColor('rgba(0, 0, 0, 0)');
    }

    /**
     * 预加载所有游戏资源
     */
    preload() {
        // 加载基础UI
        this.load.image('download', downloadBtn);
        this.load.image('icon', icon);
        this.load.image('hand', hand);
        this.load.image('tube', tube);
        this.load.image('tube_body', tubeBody);
        this.load.image('tube_mouth', tubeMouth);

        // 加载球
        this.load.image('ball_brown', ballBrown);
        this.load.image('ball_orange', ballOrange);
        this.load.image('ball_light_purple', ballLightPurple);
        this.load.image('ball_gray', ballGray);
        this.load.image('ball_pink', ballPink);
        this.load.image('ball_purple', ballPurple);
        this.load.image('ball_red', ballRed);
        this.load.image('ball_green', ballGreen);
        this.load.image('ball_fluorescent_green', ballFluorescentGreen);
        this.load.image('ball_blue', ballBlue);
        this.load.image('ball_cyan', ballCyan);
        this.load.image('ball_yellow', ballYellow);

        this.load.image('candle_brown', candleBrown);
        this.load.image('candle_orange', candleOrange);
        this.load.image('candle_light_purple', candleLightPurple);
        this.load.image('candle_gray', candleGray);
        this.load.image('candle_pink', candlePink);
        this.load.image('candle_purple', candlePurple);
        this.load.image('candle_red', candleRed);
        this.load.image('candle_green', candleGreen);
        this.load.image('candle_fluorescent_green', candleFluorescentGreen);
        this.load.image('candle_blue', candleBlue);
        this.load.image('candle_cyan', candleCyan);
        this.load.image('candle_yellow', candleYellow);

        // 加载高亮
        this.load.image('highlight_brown_body', highlightBrownBody);
        this.load.image('highlight_brown_mouth', highlightBrownMouth);
        this.load.image('highlight_orange_body', highlightOrangeBody);
        this.load.image('highlight_orange_mouth', highlightOrangeMouth);
        this.load.image('highlight_light_purple_body', highlightLightPurpleBody);
        this.load.image('highlight_light_purple_mouth', highlightLightPurpleMouth);
        this.load.image('highlight_gray_body', highlightGrayBody);
        this.load.image('highlight_gray_mouth', highlightGrayMouth);
        this.load.image('highlight_pink_body', highlightPinkBody);
        this.load.image('highlight_pink_mouth', highlightPinkMouth);
        this.load.image('highlight_purple_body', highlightPurpleBody);
        this.load.image('highlight_purple_mouth', highlightPurpleMouth);
        this.load.image('highlight_red_body', highlightRedBody);
        this.load.image('highlight_red_mouth', highlightRedMouth);
        this.load.image('highlight_green_body', highlightGreenBody);
        this.load.image('highlight_green_mouth', highlightGreenMouth);
        this.load.image('highlight_fluorescent_green_body', highlightFluorescentGreenBody);
        this.load.image('highlight_fluorescent_green_mouth', highlightFluorescentGreenMouth);
        this.load.image('highlight_blue_body', highlightBlueBody);
        this.load.image('highlight_blue_mouth', highlightBlueMouth);
        this.load.image('highlight_cyan_body', highlightCyanBody);
        this.load.image('highlight_cyan_mouth', highlightCyanMouth);
        this.load.image('highlight_yellow_body', highlightYellowBody);
        this.load.image('highlight_yellow_mouth', highlightYellowMouth);

        // 加载Spine动画 - Particle粒子特效
        SpineLoader.load(this, {
            key: 'particle',
            json: particleJson,
            atlas: particleAtlas,
            textures: { 'Particle.png': particlePng }
        });

        // 加载Spine动画 - Firework烟花特效
        SpineLoader.load(this, {
            key: 'firework',
            json: fireworkJson,
            atlas: fireworkAtlas,
            textures: { 'Firework.png': fireworkPng }
        });

        // 加载火焰序列帧
        this.load.image('fire_00000', fire00000);
        this.load.image('fire_00001', fire00001);
        this.load.image('fire_00002', fire00002);
        this.load.image('fire_00003', fire00003);
        this.load.image('fire_00004', fire00004);
        this.load.image('fire_00005', fire00005);
        this.load.image('fire_00006', fire00006);
        this.load.image('fire_00007', fire00007);
        this.load.image('fire_00008', fire00008);
        this.load.image('fire_00009', fire00009);
        this.load.image('fire_00010', fire00010);
        this.load.image('fire_00011', fire00011);
        this.load.image('fire_00012', fire00012);
        this.load.image('fire_00013', fire00013);
        this.load.image('fire_00014', fire00014);
        this.load.image('fire_00015', fire00015);
        this.load.image('fire_00016', fire00016);
        this.load.image('fire_00017', fire00017);
        this.load.image('fire_00018', fire00018);
        this.load.image('fire_00019', fire00019);
        this.load.image('fire_00020', fire00020);
        this.load.image('fire_00021', fire00021);
        this.load.image('fire_00022', fire00022);
        this.load.image('fire_00023', fire00023);
        this.load.image('fire_00024', fire00024);

        // 加载遮罩
        this.load.image('tube_mask', tubeMask);
        // 加载液面纹理（黑色图，运行时按液体颜色着色）
        this.load.image('liquid_surface', liquidSurface);

        // 通过 virtual:game-assets 加载音频（供 Phaser 播放）
        loadAssetGroup(this, 'audio');

        // 加载液体动画序列帧
        this.loadLiquidFrames(liquidUpImgs);
        this.loadLiquidFrames(liquidStillImgs);
        this.loadLiquidFrames(liquidMoveImgs);
        this.loadLiquidFrames(liquidDropImgs);
        this.loadLiquidFrames(liquidSplashImgs);

        // 加载圆球表情序列帧
        this.loadLiquidFrames(ballExpressionImgs);
    }

    private loadLiquidFrames(images: Record<string, unknown>) {
        for (const path in images) {
            // 从路径中提取文件名作为key (例如: up_00001)
            const key = path.split('/').pop()?.replace('.png', '');
            if (key) {
                this.load.image(key, images[path] as string);
            }
        }
    }

    /**
     * 加载网络字体
     */
    loadFont(name: string, url: string) {
        var newFont = new FontFace(name, `url(${url})`);
        newFont.load().then(function (loaded) {
            document.fonts.add(loaded);
        }).catch(function (error) {
            console.error('Error loading font:', error);
            return error;
        });
    }

    /**
     * 资源加载完成后创建游戏场景
     */
    private createLiquidAnimations() {
        // 1. 出瓶子 (Up)
        this.anims.create({
            key: 'liquid_up',
            frames: this.generateFrames('up', 1, 10),
            frameRate: LIQUID_UP_FRAME_RATE,
            repeat: 0
        });

        // 2. 原地暂停 (Still) - 降低 frameRate 减轻每帧动画更新负担
        this.anims.create({
            key: 'liquid_still',
            frames: this.generateFrames('still', 11, 21),
            frameRate: 15,
            repeat: -1,
            yoyo: true
        });

        // 3. 移动和下降 (Move) - 20fps 平衡流畅度与性能
        this.anims.create({
            key: 'liquid_move',
            frames: this.generateFrames('move', 22, 44),
            frameRate: 20,
            repeat: -1
        });

        // 4. 落入水中 (Drop)
        this.anims.create({
            key: 'liquid_drop',
            frames: this.generateFrames('drop', 45, 50),
            frameRate: 30,
            repeat: 0
        });

        // 5. 水花 (Splash)
        this.anims.create({
            key: 'liquid_splash',
            frames: this.generateFrames('splash', 0, 18),
            frameRate: SPLASH_FRAME_RATE,
            repeat: 0
        });
    }

    private generateFrames(prefix: string, start: number, end: number): Phaser.Types.Animations.AnimationFrame[] {
        const frames: Phaser.Types.Animations.AnimationFrame[] = [];
        for (let i = start; i <= end; i++) {
            const frameKey = `${prefix}_${String(i).padStart(5, '0')}`;
            frames.push({ key: frameKey });
        }
        return frames;
    }

    create() {
        // 生成粒子纹理
        const graphics = this.make.graphics({ x: 0, y: 0 });
        graphics.fillStyle(0xffffff, 1);
        graphics.fillCircle(5, 5, 5);
        graphics.generateTexture('particle_texture', 10, 10);
        graphics.destroy();

        // 创建火焰动画序列
        const fireFrames: Phaser.Types.Animations.AnimationFrame[] = [];
        for (let i = 0; i <= 24; i++) {
            const frameKey = `fire_${String(i).padStart(5, '0')}`;
            fireFrames.push({ key: frameKey });
        }

        this.anims.create({
            key: 'fire_animation',
            frames: fireFrames,
            frameRate: 15,
            repeat: -1
        });

        // 创建圆球表情动画 (129帧) - 20fps 减轻更新负担
        const ballExpressionFrames: Phaser.Types.Animations.AnimationFrame[] = [];
        for (let i = 0; i <= 128; i++) {
            ballExpressionFrames.push({ key: `圆球表情_${String(i).padStart(5, '0')}` });
        }
        this.anims.create({
            key: 'ball_expression',
            frames: ballExpressionFrames,
            frameRate: 20,
            repeat: -1
        });

        // 创建液体动画
        this.createLiquidAnimations();

        // 资源加载完毕，立即启动 Game 场景（使用当前 difficulty，默认 1）
        // Game 在选关覆盖层后面渲染，用户点击选关后只需取消隐藏
        this.generatePuzzle().then((puzzleData) => {
            console.log('[TIMING] Preloader→Game', { t: performance.now() });
            this.scene.start('Game', puzzleData);
            EventBus.emit('preloading-complete');
        });
    }

    /**
     * 在 Preloader 阶段生成谜题，避免在 Game 场景初始化时阻塞
     * 这样可以在加载资源的同时并行生成谜题
     */
    private async generatePuzzle(): Promise<{ puzzle: PuzzleAdapterResult; difficulty: number; emptyTubeCount: number }> {
        try {
            await waitForPregenerate();

            // 使用选关界面选择的难度（1/5/9）
            const actualDifficulty = Math.max(1, Math.min(10, getPersistentSelectedLevel()));

            const emptyTubeCount = await getOutputConfigValueAsync<number>('emptyTubeCount', 2);
            const actualEmptyTubeCount = Math.max(1, Math.min(6, emptyTubeCount));

            const cached = getCachedPuzzle(actualDifficulty, actualEmptyTubeCount);
            if (cached) {
                return cached;
            }

            const puzzle = generatePuzzleWithAdapter({
                difficulty: actualDifficulty,
                emptyTubeCount: actualEmptyTubeCount,
            });

            return { puzzle, difficulty: actualDifficulty, emptyTubeCount: actualEmptyTubeCount };
        } catch (e) {
            if (import.meta.env.DEV) {
                console.warn('[Preloader] 生成谜题失败，使用默认值:', e);
            }
            const diff = Math.max(1, Math.min(10, getPersistentSelectedLevel()));
            const puzzle = generatePuzzleWithAdapter({
                difficulty: diff,
                emptyTubeCount: 2,
            });
            return { puzzle, difficulty: diff, emptyTubeCount: 2 };
        }
    }

}
