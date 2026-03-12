/**
 * 响应式背景管理器
 * 
 * 提供统一的背景管理功能，可在多个场景中复用
 * 与GameAreaManager协同工作，提供完整的响应式布局解决方案
 * 
 * @author 开发者
 * @date 2025-06-23
 */

import { EventBus } from '../EventBus';

/**
 * 屏幕方向枚举
 */
export enum ScreenOrientation {
  LANDSCAPE = 'landscape',
  PORTRAIT = 'portrait'
}

/**
 * 固定画布尺寸常量
 */
export const FIXED_CANVAS_SIZES = {
  /** 横屏模式：1920 × 1080 */
  LANDSCAPE: {
    WIDTH: 1920,
    HEIGHT: 1080
  },
  /** 竖屏模式：1080 × 1920 */
  PORTRAIT: {
    WIDTH: 1080,
    HEIGHT: 1920
  }
} as const;

/**
 * 背景配置接口
 */
export interface BackgroundConfig {
  /** 背景原始尺寸 */
  originalSize: number;
  /** 横屏目标尺寸 */
  landscapeTarget: {
    width: number;
    height: number;
  };
  /** 竖屏目标尺寸 */
  portraitTarget: {
    width: number;
    height: number;
  };
}

/**
 * 背景信息接口
 */
export interface BackgroundInfo {
  position: {
    x: number;
    y: number;
  };
  displaySize: {
    width: number;
    height: number;
  };
  scale: number;
  originalSize: number;
  orientation: ScreenOrientation;
}

/**
 * 响应式背景配置
 */
export const RESPONSIVE_BACKGROUND_CONFIG: BackgroundConfig = {
  originalSize: 2160,
  landscapeTarget: {
    width: FIXED_CANVAS_SIZES.LANDSCAPE.WIDTH,
    height: FIXED_CANVAS_SIZES.LANDSCAPE.HEIGHT
  },
  portraitTarget: {
    width: FIXED_CANVAS_SIZES.PORTRAIT.WIDTH,
    height: FIXED_CANVAS_SIZES.PORTRAIT.HEIGHT
  }
};

/**
 * 响应式工具类
 */
export class ResponsiveUtils {
  /**
   * 判断画布方向
   */
  static getCanvasOrientation(canvasWidth: number, canvasHeight: number): ScreenOrientation {
    if (canvasWidth === FIXED_CANVAS_SIZES.LANDSCAPE.WIDTH && canvasHeight === FIXED_CANVAS_SIZES.LANDSCAPE.HEIGHT) {
      return ScreenOrientation.LANDSCAPE;
    } else if (canvasWidth === FIXED_CANVAS_SIZES.PORTRAIT.WIDTH && canvasHeight === FIXED_CANVAS_SIZES.PORTRAIT.HEIGHT) {
      return ScreenOrientation.PORTRAIT;
    }
    
    return canvasWidth > canvasHeight ? ScreenOrientation.LANDSCAPE : ScreenOrientation.PORTRAIT;
  }

  /**
   * 获取当前画布尺寸
   */
  static getCurrentCanvasSize(): {
    width: number;
    height: number;
    orientation: ScreenOrientation;
  } {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const isLandscape = windowWidth > windowHeight;
    
    if (isLandscape) {
      return {
        width: FIXED_CANVAS_SIZES.LANDSCAPE.WIDTH,
        height: FIXED_CANVAS_SIZES.LANDSCAPE.HEIGHT,
        orientation: ScreenOrientation.LANDSCAPE
      };
    } else {
      return {
        width: FIXED_CANVAS_SIZES.PORTRAIT.WIDTH,
        height: FIXED_CANVAS_SIZES.PORTRAIT.HEIGHT,
        orientation: ScreenOrientation.PORTRAIT
      };
    }
  }

  /**
   * 获取背景显示尺寸
   */
  static getBackgroundDisplaySize(
    canvasWidth: number,
    canvasHeight: number,
    config: BackgroundConfig = RESPONSIVE_BACKGROUND_CONFIG
  ): {
    displayWidth: number;
    displayHeight: number;
    scale: number;
    orientation: ScreenOrientation;
  } {
    const orientation = this.getCanvasOrientation(canvasWidth, canvasHeight);
    const scale = Math.max(canvasWidth / config.originalSize, canvasHeight / config.originalSize);
    
    return {
      displayWidth: config.originalSize * scale,
      displayHeight: config.originalSize * scale,
      scale,
      orientation
    };
  }

  /**
   * 验证画布尺寸是否为支持的固定尺寸
   */
  static isValidCanvasSize(width: number, height: number): boolean {
    return (
      (width === FIXED_CANVAS_SIZES.LANDSCAPE.WIDTH && height === FIXED_CANVAS_SIZES.LANDSCAPE.HEIGHT) ||
      (width === FIXED_CANVAS_SIZES.PORTRAIT.WIDTH && height === FIXED_CANVAS_SIZES.PORTRAIT.HEIGHT)
    );
  }

  /**
   * 获取画布尺寸信息
   */
  static getCanvasSizeInfo(width: number, height: number): {
    isValid: boolean;
    orientation: ScreenOrientation;
    expectedSize: { width: number; height: number };
    actualSize: { width: number; height: number };
  } {
    const orientation = this.getCanvasOrientation(width, height);
    const expectedSize = orientation === ScreenOrientation.LANDSCAPE
      ? { width: FIXED_CANVAS_SIZES.LANDSCAPE.WIDTH, height: FIXED_CANVAS_SIZES.LANDSCAPE.HEIGHT }
      : { width: FIXED_CANVAS_SIZES.PORTRAIT.WIDTH, height: FIXED_CANVAS_SIZES.PORTRAIT.HEIGHT };
    
    return {
      isValid: this.isValidCanvasSize(width, height),
      orientation,
      expectedSize,
      actualSize: { width, height }
    };
  }
}

/**
 * 响应式背景管理器类
 */
export class ResponsiveBackgroundManager {
  private scene: Phaser.Scene;
  private background: Phaser.GameObjects.Image | null = null;
  private resizeDebounceTimer: Phaser.Time.TimerEvent | null = null;
  private readonly BACKGROUND_SIZE = 2160;
  private backgroundChangeCallbacks: Set<(bgInfo: BackgroundInfo) => void> = new Set();
  private currentCanvasSize: { width: number; height: number; orientation: ScreenOrientation };

  /**
   * 构造函数
   */
  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.currentCanvasSize = ResponsiveUtils.getCurrentCanvasSize();
  }

  /**
   * 创建响应式背景
   */
  createBackground(textureKey: string = 'background'): Phaser.GameObjects.Image {
    this.background = this.scene.add.image(0, 0, textureKey);
    this.background.setOrigin(0.5, 0.5);
    
    this.updateBackground();
    this.scene.scale.on('resize', this.onResize, this);
    
    return this.background;
  }

  /**
   * 更新背景显示
   */
  updateBackground(): void {
    if (!this.background) return;

    const canvasWidth = this.scene.cameras.main.width;
    const canvasHeight = this.scene.cameras.main.height;
    
    const canvasSizeInfo = ResponsiveUtils.getCanvasSizeInfo(canvasWidth, canvasHeight);
    
    this.currentCanvasSize = {
      width: canvasWidth,
      height: canvasHeight,
      orientation: canvasSizeInfo.orientation
    };
    
    const backgroundInfo = ResponsiveUtils.getBackgroundDisplaySize(canvasWidth, canvasHeight);
    
    this.background.setPosition(canvasWidth / 2, canvasHeight / 2);
    this.background.setDisplaySize(backgroundInfo.displayWidth, backgroundInfo.displayHeight);
    this.background.setDepth(-1000);
    
    const bgInfo = this.createBackgroundInfo();
    this.notifyBackgroundChange(bgInfo);
  }

  /**
   * 窗口大小变化事件处理
   */
  private onResize(): void {
    if (this.resizeDebounceTimer) {
      this.resizeDebounceTimer.destroy();
    }
    
    this.resizeDebounceTimer = this.scene.time.delayedCall(100, () => {
      this.updateBackground();
      this.resizeDebounceTimer = null;
    });
  }

  /**
   * 获取当前画布方向
   */
  getCurrentOrientation(): ScreenOrientation {
    return this.currentCanvasSize.orientation;
  }

  /**
   * 获取背景显示信息
   */
  getBackgroundInfo() {
    if (!this.background) return null;

    const canvasWidth = this.scene.cameras.main.width;
    const canvasHeight = this.scene.cameras.main.height;
    
    return ResponsiveUtils.getBackgroundDisplaySize(canvasWidth, canvasHeight);
  }

  /**
   * 创建完整的背景信息对象
   */
  createBackgroundInfo(): BackgroundInfo | null {
    if (!this.background) return null;

    const canvasWidth = this.scene.cameras.main.width;
    const canvasHeight = this.scene.cameras.main.height;
    const displayInfo = ResponsiveUtils.getBackgroundDisplaySize(canvasWidth, canvasHeight);
    
    return {
      position: {
        x: this.background.x,
        y: this.background.y
      },
      displaySize: {
        width: displayInfo.displayWidth,
        height: displayInfo.displayHeight
      },
      scale: displayInfo.scale,
      originalSize: this.BACKGROUND_SIZE,
      orientation: displayInfo.orientation
    };
  }

  /**
   * 获取当前画布尺寸信息
   */
  getCurrentCanvasSize(): { width: number; height: number; orientation: ScreenOrientation } {
    return { ...this.currentCanvasSize };
  }

  /**
   * 验证当前画布尺寸是否为支持的固定尺寸
   */
  validateCanvasSize(): {
    isValid: boolean;
    currentSize: { width: number; height: number };
    expectedSize: { width: number; height: number };
    orientation: ScreenOrientation;
  } {
    const canvasWidth = this.scene.cameras.main.width;
    const canvasHeight = this.scene.cameras.main.height;
    const sizeInfo = ResponsiveUtils.getCanvasSizeInfo(canvasWidth, canvasHeight);
    
    return {
      isValid: sizeInfo.isValid,
      currentSize: sizeInfo.actualSize,
      expectedSize: sizeInfo.expectedSize,
      orientation: sizeInfo.orientation
    };
  }

  /**
   * 获取当前背景信息
   */
  getCurrentBackgroundInfo(): BackgroundInfo | null {
    return this.createBackgroundInfo();
  }

  /**
   * 添加背景变化监听器
   */
  addBackgroundChangeListener(callback: (bgInfo: BackgroundInfo) => void): void {
    this.backgroundChangeCallbacks.add(callback);
    
    const currentBgInfo = this.createBackgroundInfo();
    if (currentBgInfo) {
      callback(currentBgInfo);
    }
  }

  /**
   * 移除背景变化监听器
   */
  removeBackgroundChangeListener(callback: (bgInfo: BackgroundInfo) => void): void {
    this.backgroundChangeCallbacks.delete(callback);
  }

  /**
   * 通知所有监听器背景已变化
   */
  private notifyBackgroundChange(bgInfo: BackgroundInfo | null): void {
    if (!bgInfo) return;
    
    this.backgroundChangeCallbacks.forEach(callback => {
      try {
        callback(bgInfo);
      } catch (error) {
        console.error('[ResponsiveBackgroundManager] 背景变化回调执行失败:', error);
      }
    });

    // 通过EventBus发送背景变化事件
    EventBus.emit('responsive:background-changed', bgInfo);
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    if (this.resizeDebounceTimer) {
      this.resizeDebounceTimer.destroy();
      this.resizeDebounceTimer = null;
    }
    
    this.scene.scale.off('resize', this.onResize, this);
    this.backgroundChangeCallbacks.clear();
    this.background = null;
  }
}