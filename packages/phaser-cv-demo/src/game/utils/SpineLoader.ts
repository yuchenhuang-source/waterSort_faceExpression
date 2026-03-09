import { Scene } from 'phaser';

/**
 * Spine资源配置
 */
export interface SpineAssetConfig {
    /** 资源唯一标识 */
    key: string;
    /** Spine JSON 数据 (直接导入的JSON对象) */
    json: any;
    /** Spine Atlas 文本 (使用 ?raw 导入的字符串) */
    atlas: string;
    /** 纹理映射: { "纹理文件名": 导入的图片路径 } */
    textures: Record<string, string>;
    /** 是否预乘alpha，默认true */
    premultipliedAlpha?: boolean;
}

/**
 * Spine动画加载器
 * 用于简化Spine动画资源的加载流程
 * 
 * @example
 * ```typescript
 * // 导入资源
 * import fireworkAtlas from '../../assets/spine/Firework/Firework.atlas.txt?raw';
 * import fireworkJson from '../../assets/spine/Firework/Fireworks.json';
 * import fireworkPng from '../../assets/spine/Firework/Firework.png';
 * 
 * // 在preload中
 * SpineLoader.load(this, {
 *     key: 'firework',
 *     json: fireworkJson,
 *     atlas: fireworkAtlas,
 *     textures: { 'Firework.png': fireworkPng }
 * });
 * 
 * // 在create中
 * const spine = this.add.spine(x, y, 'firework_data', 'firework_atlas');
 * spine.animationState.setAnimation(0, 'animation_name', true);
 * ```
 */
export class SpineLoader {
    /**
     * 加载Spine动画资源
     * @param scene Phaser场景
     * @param config Spine资源配置
     */
    static load(scene: Scene, config: SpineAssetConfig): void {
        const { key, json, atlas, textures, premultipliedAlpha = true } = config;
        
        const dataKey = `${key}_data`;
        const atlasKey = `${key}_atlas`;

        // 加载所有纹理
        Object.entries(textures).forEach(([textureFileName, texturePath]) => {
            const combinedKey = `${atlasKey}!${textureFileName}`;
            scene.load.image(combinedKey, texturePath);
        });
        
        // 添加JSON数据到缓存
        scene.cache.json.add(dataKey, json);
        
        // 添加Atlas文本到缓存
        scene.cache.text.add(atlasKey, {
            data: atlas,
            premultipliedAlpha
        });

    }

    /**
     * 批量加载多个Spine动画资源
     * @param scene Phaser场景
     * @param configs Spine资源配置数组
     */
    static loadMultiple(scene: Scene, configs: SpineAssetConfig[]): void {
        configs.forEach(config => SpineLoader.load(scene, config));
    }

    /**
     * 创建Spine动画对象
     * @param scene Phaser场景
     * @param x X坐标
     * @param y Y坐标
     * @param key 资源标识 (与load时使用的key一致)
     * @param defaultAnimation 默认播放的动画名称
     * @param loop 是否循环播放
     * @returns Spine游戏对象
     */
    static create(
        scene: Scene,
        x: number,
        y: number,
        key: string,
        defaultAnimation?: string,
        loop: boolean = true
    ): any {
        const dataKey = `${key}_data`;
        const atlasKey = `${key}_atlas`;
        
        const gameObjectFactory = scene.add as any;
        
        if (typeof gameObjectFactory.spine !== 'function') {
            throw new Error('Spine插件未正确加载，请检查main.ts中的plugin配置');
        }
        
        const spineObj = gameObjectFactory.spine(x, y, dataKey, atlasKey);
        
        if (defaultAnimation && spineObj.animationState) {
            spineObj.animationState.setAnimation(0, defaultAnimation, loop);
        }
        
        return spineObj;
    }

    /**
     * 获取Spine对象的所有动画名称
     * @param spineObj Spine游戏对象
     * @returns 动画名称数组
     */
    static getAnimations(spineObj: any): string[] {
        try {
            if (spineObj?.skeleton?.data?.animations) {
                return spineObj.skeleton.data.animations.map((anim: any) => anim.name);
            }
        } catch (e) {
            console.warn('SpineLoader: 获取动画列表失败', e);
        }
        return [];
    }

    /**
     * 播放Spine动画
     * @param spineObj Spine游戏对象
     * @param animationName 动画名称
     * @param loop 是否循环
     * @param trackIndex 轨道索引，默认0
     */
    static playAnimation(
        spineObj: any,
        animationName: string,
        loop: boolean = true,
        trackIndex: number = 0
    ): void {
        if (!spineObj) {
            console.warn('SpineLoader: spineObj为空');
            return;
        }
        
        try {
            if (spineObj.animationState) {
                spineObj.animationState.setAnimation(trackIndex, animationName, loop);
            } else if (typeof spineObj.play === 'function') {
                spineObj.play(animationName, loop);
            }
        } catch (e) {
            console.error(`SpineLoader: 播放动画 ${animationName} 失败`, e);
        }
    }
}

export default SpineLoader;