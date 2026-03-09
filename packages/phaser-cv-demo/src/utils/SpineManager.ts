/**
 * Spine管理器 - 基于ballsort-3d最佳实践
 * 
 * 实现正确的Spine资源加载和对象创建流程
 * 移除对有问题API的依赖，使用手动资源管理
 * 
 * @author 开发者
 * @date 2025-06-04
 */

import { Scene } from 'phaser';
import { SpineGameObject } from '@esotericsoftware/spine-phaser-v3';

/**
 * Spine对象创建配置接口
 */
export interface SpineObjectConfig {
  /** X坐标 */
  x: number;
  /** Y坐标 */
  y: number;
  /** 资源键名 */
  key: string;
  /** 初始动画名称 */
  animation?: string;
  /** 是否循环播放 */
  loop?: boolean;
  /** 缩放比例 */
  scale?: number | { x: number, y: number };
  /** 深度值 */
  depth?: number;
  /** 是否可见 */
  visible?: boolean;
  /** 透明度 */
  alpha?: number;
}

/**
 * 动画混合配置接口
 */
export interface AnimationMixConfig {
  /** 起始动画名称 */
  from: string;
  /** 目标动画名称 */
  to: string;
  /** 混合持续时间(秒) */
  duration: number;
}

/**
 * Spine资源配置接口
 */
export interface SpineResourceConfig {
  /** 资源键名 */
  key: string;
  /** Atlas键名 */
  atlasKey: string;
  /** 骨骼数据键名 */
  skeletonKey: string;
  /** 默认动画名称 */
  defaultAnimation: string;
  /** 默认缩放 */
  scale: number;
  /** 可用动画列表 */
  animations: string[];
}

/**
 * Spine管理器类 - 基于ballsort-3d最佳实践
 * 使用手动资源管理，不依赖scene.cache.spine
 * 实现单例模式确保资源状态在场景间共享
 */
export class SpineManager {
  /** 全局单例实例 */
  private static instance: SpineManager | null = null;
  /** 全局资源是否已准备 */
  private static globalResourcesReady: boolean = false;
  
  /** 场景实例 */
  private scene: Scene;
  /** 调试模式 */
  private debugMode: boolean = false;
  /** 资源是否已准备 */
  private resourcesReady: boolean = false;
  /** 当前资源配置 */
  private currentConfig: SpineResourceConfig | null = null;

  /**
   * 构造函数 - 私有化以实现单例模式
   * @param scene Phaser场景实例
   * @param debug 是否启用调试模式
   */
  private constructor(scene: Scene, debug: boolean = false) {
    this.scene = scene;
    this.debugMode = debug;
    this.resourcesReady = SpineManager.globalResourcesReady;
    
    // 生成实例ID用于调试
    const instanceId = 'SpineManager_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    (this as any).instanceId = instanceId;
  }

  /**
   * 获取SpineManager实例 - 单例模式
   * @param scene Phaser场景实例
   * @param debug 是否启用调试模式
   * @returns SpineManager实例
   */
  public static getInstance(scene: Scene, debug: boolean = false): SpineManager {
    if (!SpineManager.instance) {
      SpineManager.instance = new SpineManager(scene, debug);
    } else {
      // 更新场景引用但保持资源状态
      SpineManager.instance.scene = scene;
      SpineManager.instance.debugMode = debug;
      SpineManager.instance.resourcesReady = SpineManager.globalResourcesReady;
    }
    
    return SpineManager.instance;
  }

  /**
   * 手动加载Spine资源 - 基于ballsort-3d最佳实践
   * 修复透明背景问题：正确处理premultipliedAlpha
   * @param config 资源配置
   * @param skeletonData 骨骼数据
   * @param atlasText Atlas文本
   * @param texturesMap 纹理映射表
   * @returns Promise<boolean> 是否加载成功
   */
  public async loadSpineResources(
    config: SpineResourceConfig,
    skeletonData: any,
    atlasText: string,
    texturesMap: Record<string, string>
  ): Promise<boolean> {
    try {
      this.currentConfig = config;
      
      // 1. 手动将atlas文本添加到游戏缓存
      // 修复：设置premultipliedAlpha为false以避免白色色块
      this.scene.game.cache.text.add(config.atlasKey, {
        data: atlasText,
        premultipliedAlpha: false  // 修复透明背景问题
      });
      
      // 2. 手动将骨骼JSON添加到游戏缓存
      this.scene.game.cache.json.add(config.skeletonKey, skeletonData);
      
      // 3. 加载所有纹理（带透明度优化）
      await this.loadTextures(config.atlasKey, texturesMap);
      
      this.resourcesReady = true;
      SpineManager.globalResourcesReady = true; // 同步全局状态
      return true;
      
    } catch (error) {
      console.error('Spine资源加载失败:', error);
      return false;
    }
  }

  /**
   * 加载纹理 - 基于ballsort-3d最佳实践
   * @param atlasKey Atlas键名
   * @param texturesMap 纹理映射表
   * @private
   */
  private async loadTextures(atlasKey: string, texturesMap: Record<string, string>): Promise<void> {
    const loadedTexturePromises: Promise<void>[] = [];
    const textureCallbackList: Function[] = [];
    
    // 创建纹理加载回调
    const textureCallback = (resolve: () => void, combinedKey: string) => (key: string) => {
      if (combinedKey === key) {
        resolve();
      }
    };
    
    // 遍历并加载所有纹理
    Object.entries(texturesMap).forEach(([keyTexture, value]) => {
      // 创建Spine插件将搜索的缓存键
      const combinedKey = `${atlasKey}!${keyTexture}`;
      
      // 检查纹理是否已存在
      if (this.scene.textures.exists(combinedKey)) {
        return;
      }
      
      try {
        // 添加纹理（Phaser的addBase64方法只接受2个参数）
        this.scene.textures.addBase64(combinedKey, value);
        
        // 等待纹理加载完成
        const promise = new Promise<void>((resolve, reject) => {
          const cb = textureCallback(resolve, combinedKey);
          textureCallbackList.push(cb);
          this.scene.textures.on(Phaser.Textures.Events.ADD, cb);
          
          // 添加超时处理
          setTimeout(() => {
            resolve(); // 即使超时也继续，避免阻塞
          }, 5000);
        });
        
        loadedTexturePromises.push(promise);
      } catch (error) {
        // 纹理添加失败，继续处理其他纹理
        console.warn('纹理添加失败:', keyTexture, error);
      }
    });
    
    // 等待所有纹理加载完成
    await Promise.all(loadedTexturePromises);
    
    // 移除纹理事件监听器
    textureCallbackList.forEach(cb =>
      this.scene.textures.off(Phaser.Textures.Events.ADD, cb)
    );
    
    // 验证纹理是否正确加载
    this.verifyTexturesLoaded(atlasKey, texturesMap);
  }

  /**
   * 验证纹理是否正确加载
   * @param atlasKey Atlas键名
   * @param texturesMap 纹理映射表
   * @private
   */
  private verifyTexturesLoaded(atlasKey: string, texturesMap: Record<string, string>): void {
    let successCount = 0;
    let failCount = 0;
    
    Object.keys(texturesMap).forEach(keyTexture => {
      const combinedKey = `${atlasKey}!${keyTexture}`;
      const exists = this.scene.textures.exists(combinedKey);
      
      if (exists) {
        successCount++;
      } else {
        failCount++;
        if (this.debugMode) {
          console.warn('纹理加载失败:', combinedKey);
        }
      }
    });
    
    if (this.debugMode) {
      console.log(`纹理加载完成: 成功${successCount}个, 失败${failCount}个`);
    }
  }

  /**
   * 检查资源是否已准备
   * @returns 是否已准备
   */
  public isResourceReady(): boolean {
    return this.resourcesReady;
  }

  /**
   * 验证Spine对象的有效性 - 详细调试版本
   * @param spineObject 要验证的Spine对象
   * @param context 调用上下文（用于日志）
   * @returns 是否有效
   * @private
   */
  private isValidSpineObject(spineObject: any, context: string): boolean {
    if (!spineObject) {
      if (this.debugMode) {
        console.warn(`Spine对象验证失败 [${context}]: 对象为null`);
      }
      return false;
    }
    
    // 检查关键方法
    const hasPlay = typeof spineObject.play === 'function';
    const hasGetAnimationList = typeof spineObject.getAnimationList === 'function';
    const hasAnimationState = typeof spineObject.animationState !== 'undefined';
    const hasSkeleton = typeof spineObject.skeleton !== 'undefined';
    
    // 基本验证：至少要有play方法或者animationState
    const isValid = hasPlay || hasAnimationState;
    
    if (this.debugMode && !isValid) {
      console.warn(`Spine对象验证失败 [${context}]: 缺少必要方法`);
    }
    
    return isValid;
  }

  /**
   * 创建Spine对象 - 使用手动加载的资源
   * @param config Spine对象创建配置
   * @returns 创建的Spine对象或null（如果创建失败）
   */
  public createSpineObject(config: SpineObjectConfig): SpineGameObject | null {
    // 检查基本条件
    if (!config || !config.key) {
      if (this.debugMode) {
        console.warn('Spine对象创建失败: 配置无效');
      }
      return null;
    }
    
    if (!this.resourcesReady || !this.currentConfig) {
      if (this.debugMode) {
        console.warn('Spine对象创建失败: 资源未准备');
      }
      return null;
    }
    
    if (typeof this.scene.add?.spine !== 'function') {
      if (this.debugMode) {
        console.warn('Spine对象创建失败: scene.add.spine方法不可用');
      }
      return null;
    }
    
    try {
      // 使用手动加载的资源创建Spine对象
      const spineObject = this.scene.add.spine(
        config.x,
        config.y,
        this.currentConfig.skeletonKey,
        this.currentConfig.atlasKey
      );
      
      if (!spineObject) {
        throw new Error('scene.add.spine 返回null');
      }
      
      // 修复透明背景：设置正确的混合模式
      this.setupTransparencyFix(spineObject);
      
      // 使用详细验证函数检查创建的对象
      const isValid = this.isValidSpineObject(spineObject, '对象创建后验证');
      
      // 应用配置
      this.applyObjectConfig(spineObject, config);
      
      // 如果指定了初始动画，播放它
      if (config.animation) {
        this.playAnimation(spineObject, config.animation, config.loop ?? true);
      }
      
      return spineObject;
    } catch (error) {
      if (this.debugMode) {
        console.error('Spine对象创建异常:', error);
      }
      return null;
    }
  }

  /**
   * 设置透明度修复 - 解决白色色块问题
   * @param spineObject Spine对象
   * @private
   */
  private setupTransparencyFix(spineObject: SpineGameObject): void {
    try {
      // 尝试设置不同的混合模式来修复透明背景
      if (typeof (spineObject as any).setBlendMode === 'function') {
        // 首先尝试NORMAL混合模式
        (spineObject as any).setBlendMode(Phaser.BlendModes.NORMAL);
      }
      
      // 确保透明度设置正确
      if (typeof spineObject.setAlpha === 'function') {
        spineObject.setAlpha(1.0);
      }
      
      // 尝试访问Spine特有的透明度设置
      if ((spineObject as any).skeleton) {
        const skeleton = (spineObject as any).skeleton;
        if (skeleton.color) {
          skeleton.color.a = 1.0; // 确保骨骼透明度为1
        }
      }
      
    } catch (error) {
      // 透明度修复设置失败，继续执行
      if (this.debugMode) {
        console.warn('透明度修复设置失败:', error);
      }
    }
  }

  /**
   * 应用对象配置
   * @param spineObject Spine对象
   * @param config 配置
   * @private
   */
  private applyObjectConfig(spineObject: SpineGameObject, config: SpineObjectConfig): void {
    // 设置缩放
    if (config.scale !== undefined) {
      if (typeof config.scale === 'number') {
        spineObject.setScale(config.scale);
      } else {
        spineObject.setScale(config.scale.x, config.scale.y);
      }
    }
    
    // 设置深度
    if (config.depth !== undefined && 'setDepth' in spineObject) {
      (spineObject as any).setDepth(config.depth);
    }
    
    // 设置可见性
    if (config.visible !== undefined) {
      spineObject.setVisible(config.visible);
    }
    
    // 设置透明度
    if (config.alpha !== undefined) {
      spineObject.setAlpha(config.alpha);
    }
  }

  /**
   * 播放动画
   * @param spineObject Spine对象
   * @param animationName 动画名称
   * @param loop 是否循环播放
   * @param trackIndex 轨道索引，默认为0
   * @returns 是否播放成功
   */
  public playAnimation(
    spineObject: SpineGameObject,
    animationName: string,
    loop: boolean = true,
    trackIndex: number = 0
  ): boolean {
    try {
      // 使用详细验证函数
      if (!this.isValidSpineObject(spineObject, '播放动画')) {
        return false;
      }
      
      const spineObj = spineObject as any;
      
      // 检查可用动画列表
      try {
        const availableAnimations = this.getAnimationList(spineObject);
        if (!availableAnimations.includes(animationName)) {
          if (this.debugMode) {
            console.warn(`动画 "${animationName}" 不在可用列表中:`, availableAnimations);
          }
        }
      } catch (animError) {
        // 无法获取动画列表，继续尝试播放
      }
      
      // 多轨道播放修复：确保多轨道播放真正工作
      if (trackIndex >= 0) {
        // 修复：优先使用animationState.setAnimation方法
        if (spineObj.animationState && typeof spineObj.animationState.setAnimation === 'function') {
          try {
            const trackEntry = spineObj.animationState.setAnimation(trackIndex, animationName, loop);
            
            // 验证轨道设置
            setTimeout(() => {
              const currentTrack = spineObj.animationState.getCurrent(trackIndex);
              if (this.debugMode && currentTrack) {
                console.log(`轨道${trackIndex}动画设置成功:`, currentTrack.animation?.name);
              }
            }, 50);
            
            return true;
          } catch (animStateError) {
            if (this.debugMode) {
              console.warn('animationState.setAnimation方法调用失败:', animStateError);
            }
          }
        }
        
        // 修复：备用方案使用spineObject.setAnimation方法
        if (typeof (spineObject as any).setAnimation === 'function') {
          try {
            (spineObject as any).setAnimation(trackIndex, animationName, loop);
            return true;
          } catch (spineSetAnimError) {
            if (this.debugMode) {
              console.warn('spineObject.setAnimation方法调用失败:', spineSetAnimError);
            }
          }
        }
      }
      
      // 尝试多种播放方法（轨道0或回退方案）
      if (typeof spineObject.play === 'function') {
        spineObject.play(animationName, loop);
        return true;
        
      } else if (typeof (spineObject as any).setAnimation === 'function') {
        (spineObject as any).setAnimation(trackIndex, animationName, loop);
        return true;
        
      } else if ((spineObject as any).animationState && typeof (spineObject as any).animationState.setAnimation === 'function') {
        (spineObject as any).animationState.setAnimation(trackIndex, animationName, loop);
        return true;
        
      } else {
        if (this.debugMode) {
          console.warn('没有可用的动画播放方法');
        }
        return false;
      }
    } catch (error) {
      if (this.debugMode) {
        console.error('播放动画异常:', error);
      }
      return false;
    }
  }

  /**
   * 获取动画列表
   * @param spineObject Spine对象
   * @returns 动画名称数组
   */
  public getAnimationList(spineObject: SpineGameObject): string[] {
    try {
      // 使用详细验证函数
      if (!this.isValidSpineObject(spineObject, '获取动画列表')) {
        return this.currentConfig?.animations || []; // 返回配置中的动画列表作为备用
      }
      
      // 尝试多种获取动画列表的方法
      if (typeof spineObject.getAnimationList === 'function') {
        const animations = spineObject.getAnimationList();
        return animations;
      } else if ((spineObject as any).skeleton?.data?.animations) {
        const skeleton = (spineObject as any).skeleton;
        const animations = skeleton.data.animations.map((anim: any) => anim.name || 'unnamed');
        return animations;
      } else if ((spineObject as any).animationState?.data?.skeletonData?.animations) {
        const animState = (spineObject as any).animationState;
        const animations = animState.data.skeletonData.animations.map((anim: any) => anim.name || 'unnamed');
        return animations;
      } else {
        return this.currentConfig?.animations || []; // 返回配置中的动画列表作为备用
      }
    } catch (error) {
      if (this.debugMode) {
        console.error('获取动画列表异常:', error);
      }
      return this.currentConfig?.animations || []; // 返回配置中的动画列表作为备用
    }
  }

  /**
   * 停止动画
   * @param spineObject Spine对象
   * @param trackIndex 轨道索引，-1表示停止所有轨道
   * @returns 是否停止成功
   */
  public stopAnimation(spineObject: SpineGameObject, trackIndex: number = -1): boolean {
    try {
      if (!this.isValidSpineObject(spineObject, '停止动画')) {
        return false;
      }
      
      const spineObj = spineObject as any;
      
      if (spineObj.animationState) {
        if (trackIndex >= 0) {
          // 停止指定轨道
          spineObj.animationState.setEmptyAnimation(trackIndex, 0);
        } else {
          // 停止所有轨道
          spineObj.animationState.clearTracks();
        }
        return true;
      }
      
      return false;
    } catch (error) {
      if (this.debugMode) {
        console.error('停止动画异常:', error);
      }
      return false;
    }
  }

  /**
   * 设置动画混合
   * @param spineObject Spine对象
   * @param config 混合配置
   * @returns 是否设置成功
   */
  public setMix(spineObject: SpineGameObject, config: AnimationMixConfig): boolean {
    try {
      if (!this.isValidSpineObject(spineObject, '设置动画混合')) {
        return false;
      }
      
      const spineObj = spineObject as any;
      
      if (spineObj.animationState?.data?.setMix) {
        spineObj.animationState.data.setMix(config.from, config.to, config.duration);
        return true;
      }
      
      return false;
    } catch (error) {
      if (this.debugMode) {
        console.error('设置动画混合异常:', error);
      }
      return false;
    }
  }

  /**
   * 销毁管理器实例
   */
  public static destroy(): void {
    SpineManager.instance = null;
    SpineManager.globalResourcesReady = false;
  }
}