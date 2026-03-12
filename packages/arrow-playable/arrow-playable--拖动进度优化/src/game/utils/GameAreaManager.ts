/**
 * 游戏区域位置管理器
 * 
 * 负责管理游戏区域在不同屏幕方向下的位置，提供平滑的位置过渡
 * 支持响应式布局和背景相对位置配置
 * 
 * @author 开发者
 * @date 2025-06-05
 */

/**
 * 屏幕方向枚举
 */
export enum ScreenOrientation {
  LANDSCAPE = 'landscape',
  PORTRAIT = 'portrait'
}

/**
 * 游戏区域位置配置接口
 */
export interface GameAreaPosition {
  /** 横屏配置 */
  landscape: {
    x: number;
    y: number;
    anchor?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  };
  /** 竖屏配置 */
  portrait: {
    x: number;
    y: number;
    anchor?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  };
}

/**
 * UI元素位置配置接口
 */
export interface UIPositionConfig {
  /** 锚点类型 */
  anchor: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  /** X偏移量 */
  offsetX: number;
  /** Y偏移量 */
  offsetY: number;
  /** 是否跟随方向变化调整位置 */
  responsive?: boolean;
}

/**
 * 位置变化配置接口
 */
export interface PositionTransitionConfig {
  /** 动画持续时间（毫秒） */
  duration: number;
  /** 缓动函数 */
  ease: string;
  /** 是否启用动画 */
  enabled: boolean;
}

/**
 * 默认游戏区域位置配置
 */
export const DEFAULT_GAME_AREA_POSITION: GameAreaPosition = {
  landscape: {
    x: 0,
    y: 0,
    anchor: 'center'
  },
  portrait: {
    x: 0,
    y: 0,
    anchor: 'center'
  }
};

/**
 * 默认位置变化配置
 */
export const DEFAULT_TRANSITION_CONFIG: PositionTransitionConfig = {
  duration: 300,
  ease: 'Power2.easeOut',
  enabled: true
};

/**
 * 游戏区域管理器类
 */
export class GameAreaManager {
  /** Phaser场景实例 */
  private scene: Phaser.Scene;
  /** 当前游戏区域绝对坐标 */
  private currentOffset: { x: number; y: number };
  /** 当前屏幕方向 */
  private currentOrientation: ScreenOrientation;
  /** 游戏区域位置配置 */
  private areaConfig: GameAreaPosition;
  /** 位置变化配置 */
  private transitionConfig: PositionTransitionConfig;
  /** 需要管理的游戏对象 */
  private managedObjects: Set<Phaser.GameObjects.GameObject>;
  /** 需要管理的UI元素对象 */
  private managedUIObjects: Set<{
    object: Phaser.GameObjects.GameObject;
    positionConfig: UIPositionConfig;
  }>;
  /** 方向变化监听器清理函数 */
  private cleanupListener?: () => void;
  /** 屏幕尺寸变化监听器清理函数 */
  private resizeCleanupListener?: () => void;
  /** 是否已初始化 */
  private initialized: boolean = false;
  /** 上次屏幕尺寸 */
  private lastScreenSize: { width: number; height: number };

  /**
   * 构造函数
   *
   * @param scene Phaser场景实例
   * @param areaConfig 游戏区域位置配置
   * @param transitionConfig 位置变化配置
   */
  constructor(
    scene: Phaser.Scene,
    areaConfig: GameAreaPosition = DEFAULT_GAME_AREA_POSITION,
    transitionConfig: PositionTransitionConfig = DEFAULT_TRANSITION_CONFIG
  ) {
    this.scene = scene;
    this.areaConfig = areaConfig;
    this.transitionConfig = transitionConfig;
    this.managedObjects = new Set();
    this.managedUIObjects = new Set();
    this.currentOffset = { x: 0, y: 0 };
    this.currentOrientation = ScreenOrientation.LANDSCAPE;
    this.lastScreenSize = { width: 0, height: 0 };
  }

  /**
   * 初始化游戏区域管理器
   */
  initialize(): void {
    if (this.initialized) {
      console.warn('[GameAreaManager] 已经初始化过了');
      return;
    }

    // 获取初始屏幕尺寸和方向
    const screenWidth = this.scene.cameras.main.width;
    const screenHeight = this.scene.cameras.main.height;
    
    console.log(`[GameAreaManager] 初始化 - 屏幕尺寸: ${screenWidth}x${screenHeight}`);
    
    // 设置初始位置
    this.setGameAreaPosition(screenWidth, screenHeight, 'initialize');
    
    this.lastScreenSize = { width: screenWidth, height: screenHeight };
    
    // 设置屏幕变化监听
    this.setupScreenChangeListener();
    
    this.initialized = true;
    
    console.log('[GameAreaManager] 初始化完成');
  }

  /**
   * 统一的游戏区域位置设定方法
   * 确保初始化和resize时使用相同的逻辑
   *
   * @param screenWidth 屏幕宽度
   * @param screenHeight 屏幕高度
   * @param source 调用来源，用于调试
   * @param callback 位置设定完成的回调
   */
  setGameAreaPosition(
    screenWidth: number,
    screenHeight: number,
    source: string = 'unknown',
    callback?: () => void
  ): void {
    console.log(`[GameAreaManager] 设置游戏区域位置 - 来源: ${source}, 尺寸: ${screenWidth}x${screenHeight}`);
    
    const targetOffset = this.getGameAreaOffset(screenWidth, screenHeight);
    
    console.log(`[GameAreaManager] 目标偏移: x=${targetOffset.x}, y=${targetOffset.y}, 方向=${targetOffset.orientation}`);
    
    // 检查是否需要更新位置
    const needsUpdate = this.checkIfPositionUpdateNeeded(targetOffset);
    
    if (needsUpdate) {
      console.log('[GameAreaManager] 需要更新位置');
      
      // 如果已有管理的对象，使用动画过渡
      if (this.managedObjects.size > 0) {
        this.updateGameAreaWithTransition(targetOffset);
      } else {
        // 如果没有管理的对象，直接设置位置
        this.currentOffset = { x: targetOffset.x, y: targetOffset.y };
        this.currentOrientation = targetOffset.orientation;
      }
      
      // 更新UI元素位置
      this.updateUIPositions(screenWidth, screenHeight);
    } else {
      console.log('[GameAreaManager] 位置无需更新');
    }
    
    // 执行回调
    if (callback) {
      callback();
    }
  }

  /**
   * 获取游戏区域偏移量
   * @param screenWidth 屏幕宽度
   * @param screenHeight 屏幕高度
   * @returns 偏移量和方向信息
   */
  private getGameAreaOffset(screenWidth: number, screenHeight: number): {
    x: number;
    y: number;
    orientation: ScreenOrientation;
  } {
    const orientation = screenWidth > screenHeight ? ScreenOrientation.LANDSCAPE : ScreenOrientation.PORTRAIT;
    const config = orientation === ScreenOrientation.LANDSCAPE ? this.areaConfig.landscape : this.areaConfig.portrait;
    
    let x = config.x;
    let y = config.y;
    
    // 根据锚点调整位置
    switch (config.anchor) {
      case 'center':
        x += screenWidth / 2;
        y += screenHeight / 2;
        break;
      case 'top-left':
        // 保持原始坐标
        break;
      case 'top-right':
        x = screenWidth - x;
        break;
      case 'bottom-left':
        y = screenHeight - y;
        break;
      case 'bottom-right':
        x = screenWidth - x;
        y = screenHeight - y;
        break;
    }
    
    return { x, y, orientation };
  }

  /**
   * 检查是否需要更新位置
   * @param targetOffset 目标偏移量
   * @returns 是否需要更新
   */
  private checkIfPositionUpdateNeeded(targetOffset: {
    x: number;
    y: number;
    orientation: ScreenOrientation;
  }): boolean {
    // 检查方向是否变化
    if (targetOffset.orientation !== this.currentOrientation) {
      return true;
    }
    
    // 检查位置是否变化
    const delta = {
      x: Math.abs(targetOffset.x - this.currentOffset.x),
      y: Math.abs(targetOffset.y - this.currentOffset.y)
    };
    
    const threshold = 1; // 1像素阈值
    return delta.x >= threshold || delta.y >= threshold;
  }

  /**
   * 使用动画过渡更新游戏区域
   * @param targetOffset 目标偏移量
   */
  private updateGameAreaWithTransition(targetOffset: {
    x: number;
    y: number;
    orientation: ScreenOrientation;
  }): void {
    if (!this.transitionConfig.enabled) {
      // 如果禁用动画，直接设置位置
      this.moveGameAreaObjects({
        x: targetOffset.x - this.currentOffset.x,
        y: targetOffset.y - this.currentOffset.y
      });
      this.currentOffset = { x: targetOffset.x, y: targetOffset.y };
      this.currentOrientation = targetOffset.orientation;
      return;
    }

    const delta = {
      x: targetOffset.x - this.currentOffset.x,
      y: targetOffset.y - this.currentOffset.y
    };

    // 使用Phaser的Tween系统进行动画
    this.scene.tweens.add({
      targets: this.currentOffset,
      x: targetOffset.x,
      y: targetOffset.y,
      duration: this.transitionConfig.duration,
      ease: this.transitionConfig.ease,
      onUpdate: () => {
        // 在动画过程中更新对象位置
        this.moveGameAreaObjects(delta);
      },
      onComplete: () => {
        this.currentOrientation = targetOffset.orientation;
        console.log('[GameAreaManager] 位置过渡动画完成');
      }
    });
  }

  /**
   * 移动游戏区域对象
   * @param delta 位置变化量
   */
  private moveGameAreaObjects(delta: { x: number; y: number }): void {
    if (Math.abs(delta.x) < 1 && Math.abs(delta.y) < 1) {
      return; // 移动距离太小，跳过
    }

    Array.from(this.managedObjects).forEach(obj => {
      if (obj && typeof (obj as any).updatePosition === 'function') {
        // 如果对象有updatePosition方法，使用它
        const currentX = (obj as any).x || 0;
        const currentY = (obj as any).y || 0;
        (obj as any).updatePosition(currentX + delta.x, currentY + delta.y);
      } else if (obj && typeof (obj as any).x === 'number' && typeof (obj as any).y === 'number') {
        // 否则直接修改x, y属性
        (obj as any).x += delta.x;
        (obj as any).y += delta.y;
      }
    });
  }

  /**
   * 更新UI元素位置
   * @param screenWidth 屏幕宽度
   * @param screenHeight 屏幕高度
   */
  updateUIPositions(screenWidth: number, screenHeight: number): void {
    this.managedUIObjects.forEach(({ object, positionConfig }) => {
      if (positionConfig.responsive) {
        const newPosition = this.calculateUIPosition(positionConfig, screenWidth, screenHeight);
        if (object && typeof (object as any).setPosition === 'function') {
          (object as any).setPosition(newPosition.x, newPosition.y);
        } else if (object && typeof (object as any).x === 'number' && typeof (object as any).y === 'number') {
          (object as any).x = newPosition.x;
          (object as any).y = newPosition.y;
        }
      }
    });
  }

  /**
   * 计算UI元素位置
   * @param config UI位置配置
   * @param screenWidth 屏幕宽度
   * @param screenHeight 屏幕高度
   * @returns 计算后的位置
   */
  private calculateUIPosition(
    config: UIPositionConfig,
    screenWidth: number,
    screenHeight: number
  ): { x: number; y: number } {
    let x = config.offsetX;
    let y = config.offsetY;

    switch (config.anchor) {
      case 'top-left':
        // 保持原始偏移
        break;
      case 'top-right':
        x = screenWidth - config.offsetX;
        break;
      case 'bottom-left':
        y = screenHeight - config.offsetY;
        break;
      case 'bottom-right':
        x = screenWidth - config.offsetX;
        y = screenHeight - config.offsetY;
        break;
      case 'center':
        x = screenWidth / 2 + config.offsetX;
        y = screenHeight / 2 + config.offsetY;
        break;
    }

    return { x, y };
  }

  /**
   * 设置屏幕变化监听器
   */
  private setupScreenChangeListener(): void {
    const screenChangeHandler = () => {
      const screenWidth = this.scene.cameras.main.width;
      const screenHeight = this.scene.cameras.main.height;
      
      // 检查尺寸是否真的变化了
      if (screenWidth !== this.lastScreenSize.width || screenHeight !== this.lastScreenSize.height) {
        console.log(`[GameAreaManager] 屏幕尺寸变化: ${this.lastScreenSize.width}x${this.lastScreenSize.height} -> ${screenWidth}x${screenHeight}`);
        
        this.setGameAreaPosition(screenWidth, screenHeight, 'screen-resize', () => {
          this.lastScreenSize = { width: screenWidth, height: screenHeight };
        });
      }
    };

    // 防抖处理
    let resizeTimeout: number;
    const debouncedHandler = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(screenChangeHandler, 100);
    };

    // 监听窗口大小变化
    window.addEventListener('resize', debouncedHandler);
    window.addEventListener('orientationchange', debouncedHandler);

    this.cleanupListener = () => {
      window.removeEventListener('resize', debouncedHandler);
      window.removeEventListener('orientationchange', debouncedHandler);
      clearTimeout(resizeTimeout);
    };
  }

  /**
   * 添加需要管理的游戏对象
   * @param gameObject 游戏对象
   */
  addManagedObject(gameObject: Phaser.GameObjects.GameObject): void {
    this.managedObjects.add(gameObject);
  }

  /**
   * 移除管理的游戏对象
   * @param gameObject 游戏对象
   */
  removeManagedObject(gameObject: Phaser.GameObjects.GameObject): void {
    this.managedObjects.delete(gameObject);
  }

  /**
   * 批量添加需要管理的游戏对象
   * @param gameObjects 游戏对象数组
   */
  addManagedObjects(gameObjects: Phaser.GameObjects.GameObject[]): void {
    gameObjects.forEach(obj => this.managedObjects.add(obj));
  }

  /**
   * 清空所有管理的游戏对象
   */
  clearManagedObjects(): void {
    this.managedObjects.clear();
  }

  /**
   * 添加需要管理的UI元素
   * @param gameObject UI对象
   * @param positionConfig 位置配置
   */
  addManagedUIObject(gameObject: Phaser.GameObjects.GameObject, positionConfig: UIPositionConfig): void {
    this.managedUIObjects.add({ object: gameObject, positionConfig });
  }

  /**
   * 移除管理的UI元素
   * @param gameObject UI对象
   */
  removeManagedUIObject(gameObject: Phaser.GameObjects.GameObject): void {
    for (const item of this.managedUIObjects) {
      if (item.object === gameObject) {
        this.managedUIObjects.delete(item);
        break;
      }
    }
  }

  /**
   * 清空所有管理的UI元素
   */
  clearManagedUIObjects(): void {
    this.managedUIObjects.clear();
  }

  /**
   * 更新区域配置
   * @param newConfig 新的区域配置
   * @param applyImmediately 是否立即应用
   */
  updateAreaConfig(newConfig: GameAreaPosition, applyImmediately: boolean = true): void {
    this.areaConfig = newConfig;
    
    if (applyImmediately && this.initialized) {
      const screenWidth = this.scene.cameras.main.width;
      const screenHeight = this.scene.cameras.main.height;
      this.setGameAreaPosition(screenWidth, screenHeight, 'config-update');
    }
  }

  /**
   * 更新过渡配置
   * @param newConfig 新的过渡配置
   */
  updateTransitionConfig(newConfig: PositionTransitionConfig): void {
    this.transitionConfig = newConfig;
  }

  /**
   * 获取当前偏移量
   * @returns 当前偏移量
   */
  getCurrentOffset(): { x: number; y: number } {
    return { ...this.currentOffset };
  }

  /**
   * 获取当前屏幕方向
   * @returns 当前屏幕方向
   */
  getCurrentOrientation(): ScreenOrientation {
    return this.currentOrientation;
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    // 清理监听器
    if (this.cleanupListener) {
      this.cleanupListener();
      this.cleanupListener = undefined;
    }

    if (this.resizeCleanupListener) {
      this.resizeCleanupListener();
      this.resizeCleanupListener = undefined;
    }

    // 清空管理的对象
    this.managedObjects.clear();
    this.managedUIObjects.clear();

    this.initialized = false;
    
    console.log('[GameAreaManager] 已销毁');
  }

  /**
   * 获取调试信息
   * @returns 调试信息对象
   */
  getDebugInfo(): {
    initialized: boolean;
    currentOffset: { x: number; y: number };
    currentOrientation: ScreenOrientation;
    managedObjectsCount: number;
    managedUIObjectsCount: number;
    lastScreenSize: { width: number; height: number };
  } {
    return {
      initialized: this.initialized,
      currentOffset: { ...this.currentOffset },
      currentOrientation: this.currentOrientation,
      managedObjectsCount: this.managedObjects.size,
      managedUIObjectsCount: this.managedUIObjects.size,
      lastScreenSize: { ...this.lastScreenSize }
    };
  }
}