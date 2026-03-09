/**
 * 通用交互反馈系统
 *
 * 提供用户交互的视觉反馈、无效操作提示等
 * 增强用户体验和交互反馈
 * 避免具体游戏逻辑，提供通用的反馈功能
 *
 * @author 开发者
 * @date 2025-06-23
 */

import { Scene } from 'phaser';
import { EventBus } from '../EventBus';

/**
 * 反馈类型枚举
 */
export enum FeedbackType {
  /** 对象选中 */
  OBJECT_SELECTED = 'object_selected',
  /** 对象取消选中 */
  OBJECT_DESELECTED = 'object_deselected',
  /** 无效操作 */
  INVALID_OPERATION = 'invalid_operation',
  /** 移动预览 */
  MOVE_PREVIEW = 'move_preview',
  /** 成功操作 */
  SUCCESS_OPERATION = 'success_operation',
  /** 点击反馈 */
  CLICK_FEEDBACK = 'click_feedback',
  /** 引导提示 */
  GUIDE_HINT = 'guide_hint'
}

/**
 * 反馈效果配置接口
 */
export interface FeedbackConfig {
  /** 效果持续时间 */
  duration: number;
  /** 缩放比例 */
  scale?: number;
  /** 透明度 */
  alpha?: number;
  /** 颜色 */
  tint?: number;
  /** 是否循环 */
  loop?: boolean;
  /** 半径大小 */
  radius?: number;
}

/**
 * 位置接口
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * 交互反馈管理器
 */
export class InteractionFeedback {
  /** 场景引用 */
  private _scene: Scene;
  
  /** 当前选中对象的反馈效果 */
  private _selectedObjectFeedback: Phaser.GameObjects.Graphics | null = null;
  
  /** 移动预览效果 */
  private _movePreviewFeedback: Phaser.GameObjects.Graphics | null = null;
  
  /** 无效操作提示文本 */
  private _invalidOperationText: Phaser.GameObjects.Text | null = null;
  
  /** 点击反馈效果集合 */
  private _clickFeedbacks: Set<Phaser.GameObjects.Graphics> = new Set();
  
  /** 反馈效果配置 */
  private _feedbackConfigs: Map<FeedbackType, FeedbackConfig> = new Map([
    [FeedbackType.OBJECT_SELECTED, { duration: -1, scale: 1.1, alpha: 0.8, tint: 0x00ff00, loop: true, radius: 40 }],
    [FeedbackType.OBJECT_DESELECTED, { duration: 200, scale: 1.0, alpha: 1.0, radius: 40 }],
    [FeedbackType.INVALID_OPERATION, { duration: 1000, alpha: 1.0 }],
    [FeedbackType.MOVE_PREVIEW, { duration: -1, alpha: 0.5, tint: 0x0088ff, radius: 30 }],
    [FeedbackType.SUCCESS_OPERATION, { duration: 500, scale: 1.2, alpha: 0.8, tint: 0x00ff00, radius: 50 }],
    [FeedbackType.CLICK_FEEDBACK, { duration: 300, scale: 1.3, alpha: 0.6, tint: 0xffffff, radius: 25 }],
    [FeedbackType.GUIDE_HINT, { duration: -1, scale: 1.1, alpha: 0.8, tint: 0xffff00, loop: true, radius: 45 }]
  ]);

  /**
   * 构造函数
   * @param scene 场景引用
   */
  constructor(scene: Scene) {
    this._scene = scene;
    this._setupEventListeners();
  }

  /**
   * 设置事件监听器
   * @private
   */
  private _setupEventListeners(): void {
    // 监听对象选中事件
    EventBus.on('interaction:object-selected', (data: { position: Position; config?: Partial<FeedbackConfig> }) => {
      this.showObjectSelectedFeedback(data.position, data.config);
    });
    
    // 监听对象取消选中事件
    EventBus.on('interaction:object-deselected', () => {
      this.hideObjectSelectedFeedback();
    });
    
    // 监听无效操作事件
    EventBus.on('interaction:invalid-operation', (data: { message: string; position?: Position }) => {
      this.showInvalidOperationFeedback(data.message, data.position);
    });
    
    // 监听移动预览事件
    EventBus.on('interaction:move-preview', (data: { fromPosition: Position; toPosition: Position }) => {
      this.showMovePreviewFeedback(data.fromPosition, data.toPosition);
    });
    
    // 监听移动预览隐藏事件
    EventBus.on('interaction:hide-move-preview', () => {
      this.hideMovePreviewFeedback();
    });

    // 监听点击反馈事件
    EventBus.on('interaction:click-feedback', (data: { position: Position; config?: Partial<FeedbackConfig> }) => {
      this.showClickFeedback(data.position, data.config);
    });

    // 监听成功操作事件
    EventBus.on('interaction:success-operation', (data: { position: Position; config?: Partial<FeedbackConfig> }) => {
      this.showSuccessOperationFeedback(data.position, data.config);
    });
  }

  /**
   * 显示对象选中反馈
   * @param position 对象位置
   * @param customConfig 自定义配置
   */
  public showObjectSelectedFeedback(position: Position, customConfig?: Partial<FeedbackConfig>): void {
    // 清除之前的反馈效果
    this.hideObjectSelectedFeedback();
    
    const config = { ...this._feedbackConfigs.get(FeedbackType.OBJECT_SELECTED)!, ...customConfig };
    
    // 防御性检查：确保position参数有效
    if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
      console.warn('[InteractionFeedback] 无效的位置参数');
      return;
    }
    
    // 创建选中反馈圆圈
    this._selectedObjectFeedback = this._scene.add.graphics();
    this._selectedObjectFeedback.lineStyle(4, config.tint || 0x00ff00, config.alpha || 0.8);
    this._selectedObjectFeedback.strokeCircle(0, 0, config.radius || 40);
    this._selectedObjectFeedback.setPosition(position.x, position.y);
    
    // 设置深度，确保在对象上方
    this._selectedObjectFeedback.setDepth(1000);
    
    // 创建脉冲动画
    if (config.loop) {
      this._scene.tweens.add({
        targets: this._selectedObjectFeedback,
        scaleX: config.scale || 1.1,
        scaleY: config.scale || 1.1,
        alpha: { from: config.alpha || 0.8, to: 0.4 },
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }
  }

  /**
   * 隐藏对象选中反馈
   */
  public hideObjectSelectedFeedback(): void {
    if (this._selectedObjectFeedback) {
      this._selectedObjectFeedback.destroy();
      this._selectedObjectFeedback = null;
    }
  }

  /**
   * 显示点击反馈
   * @param position 点击位置
   * @param customConfig 自定义配置
   */
  public showClickFeedback(position: Position, customConfig?: Partial<FeedbackConfig>): void {
    const config = { ...this._feedbackConfigs.get(FeedbackType.CLICK_FEEDBACK)!, ...customConfig };
    
    // 防御性检查
    if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
      console.warn('[InteractionFeedback] 无效的位置参数');
      return;
    }
    
    // 创建点击反馈圆圈
    const clickFeedback = this._scene.add.graphics();
    clickFeedback.lineStyle(3, config.tint || 0xffffff, config.alpha || 0.6);
    clickFeedback.strokeCircle(0, 0, config.radius || 25);
    clickFeedback.setPosition(position.x, position.y);
    clickFeedback.setDepth(1500);
    
    this._clickFeedbacks.add(clickFeedback);
    
    // 创建扩散动画
    this._scene.tweens.add({
      targets: clickFeedback,
      scaleX: config.scale || 1.3,
      scaleY: config.scale || 1.3,
      alpha: 0,
      duration: config.duration,
      ease: 'Power2',
      onComplete: () => {
        this._clickFeedbacks.delete(clickFeedback);
        clickFeedback.destroy();
      }
    });
  }

  /**
   * 显示引导提示反馈
   * @param position 显示位置
   * @param customConfig 自定义配置
   */
  public showGuideFeedback(position: Position, customConfig?: Partial<FeedbackConfig>): void {
    // 清除之前的反馈效果
    this.hideObjectSelectedFeedback();
    
    const config = { ...this._feedbackConfigs.get(FeedbackType.GUIDE_HINT)!, ...customConfig };
    
    // 防御性检查
    if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
      console.warn('[InteractionFeedback] 无效的位置参数');
      return;
    }
    
    // 创建引导反馈圆圈
    this._selectedObjectFeedback = this._scene.add.graphics();
    this._selectedObjectFeedback.lineStyle(4, config.tint || 0xffff00, config.alpha || 0.8);
    this._selectedObjectFeedback.strokeCircle(0, 0, config.radius || 45);
    this._selectedObjectFeedback.setPosition(position.x, position.y);
    
    // 设置深度
    this._selectedObjectFeedback.setDepth(1000);
    
    // 创建脉冲动画
    this._scene.tweens.add({
      targets: this._selectedObjectFeedback,
      scaleX: config.scale || 1.1,
      scaleY: config.scale || 1.1,
      alpha: { from: config.alpha || 0.8, to: 0.4 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  /**
   * 隐藏引导提示反馈
   */
  public hideGuideFeedback(): void {
    this.hideObjectSelectedFeedback();
  }

  /**
   * 显示无效操作反馈
   * @param message 提示消息
   * @param position 显示位置
   */
  public showInvalidOperationFeedback(message: string, position?: Position): void {
    const config = this._feedbackConfigs.get(FeedbackType.INVALID_OPERATION);
    if (!config) return;
    
    // 清除之前的提示
    if (this._invalidOperationText) {
      this._invalidOperationText.destroy();
    }
    
    // 设置默认位置（屏幕中央）
    const defaultPosition = {
      x: this._scene.cameras.main.width / 2,
      y: this._scene.cameras.main.height / 2
    };
    const finalPosition = position || defaultPosition;
    
    // 创建提示文本
    this._invalidOperationText = this._scene.add.text(
      finalPosition.x,
      finalPosition.y,
      message,
      {
        fontSize: '24px',
        color: '#ff4444',
        fontStyle: 'bold',
        backgroundColor: '#000000',
        padding: { x: 10, y: 5 }
      }
    );
    
    this._invalidOperationText.setOrigin(0.5, 0.5);
    this._invalidOperationText.setDepth(2000);
    
    // 创建淡入淡出动画
    this._scene.tweens.add({
      targets: this._invalidOperationText,
      alpha: { from: 0, to: 1 },
      y: finalPosition.y - 30,
      duration: 200,
      ease: 'Power2',
      onComplete: () => {
        // 延迟后淡出
        this._scene.time.delayedCall(config.duration - 400, () => {
          if (this._invalidOperationText) {
            this._scene.tweens.add({
              targets: this._invalidOperationText,
              alpha: 0,
              y: finalPosition.y - 60,
              duration: 200,
              ease: 'Power2',
              onComplete: () => {
                if (this._invalidOperationText) {
                  this._invalidOperationText.destroy();
                  this._invalidOperationText = null;
                }
              }
            });
          }
        });
      }
    });
  }

  /**
   * 显示移动预览反馈
   * @param fromPosition 起始位置
   * @param toPosition 目标位置
   */
  public showMovePreviewFeedback(fromPosition: Position, toPosition: Position): void {
    // 清除之前的预览效果
    this.hideMovePreviewFeedback();
    
    const config = this._feedbackConfigs.get(FeedbackType.MOVE_PREVIEW);
    if (!config) return;
    
    // 创建移动预览线条
    this._movePreviewFeedback = this._scene.add.graphics();
    this._movePreviewFeedback.lineStyle(3, config.tint || 0x0088ff, config.alpha || 0.5);
    this._movePreviewFeedback.lineBetween(fromPosition.x, fromPosition.y, toPosition.x, toPosition.y);
    
    // 在目标位置绘制圆圈
    this._movePreviewFeedback.lineStyle(2, config.tint || 0x0088ff, config.alpha || 0.5);
    this._movePreviewFeedback.strokeCircle(toPosition.x, toPosition.y, config.radius || 30);
    
    // 设置深度
    this._movePreviewFeedback.setDepth(999);
    
    // 创建闪烁动画
    this._scene.tweens.add({
      targets: this._movePreviewFeedback,
      alpha: { from: config.alpha || 0.5, to: 0.2 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  /**
   * 隐藏移动预览反馈
   */
  public hideMovePreviewFeedback(): void {
    if (this._movePreviewFeedback) {
      this._movePreviewFeedback.destroy();
      this._movePreviewFeedback = null;
    }
  }

  /**
   * 显示成功操作反馈
   * @param position 显示位置
   * @param customConfig 自定义配置
   */
  public showSuccessOperationFeedback(position: Position, customConfig?: Partial<FeedbackConfig>): void {
    const config = { ...this._feedbackConfigs.get(FeedbackType.SUCCESS_OPERATION)!, ...customConfig };
    
    // 创建成功反馈圆圈
    const successFeedback = this._scene.add.graphics();
    successFeedback.lineStyle(6, config.tint || 0x00ff00, config.alpha || 0.8);
    successFeedback.strokeCircle(0, 0, config.radius || 50);
    successFeedback.setPosition(position.x, position.y);
    successFeedback.setDepth(1500);
    
    // 创建扩散动画
    this._scene.tweens.add({
      targets: successFeedback,
      scaleX: config.scale || 1.2,
      scaleY: config.scale || 1.2,
      alpha: 0,
      duration: config.duration,
      ease: 'Power2',
      onComplete: () => {
        successFeedback.destroy();
      }
    });
  }

  /**
   * 更新反馈配置
   * @param type 反馈类型
   * @param config 新配置
   */
  public updateFeedbackConfig(type: FeedbackType, config: Partial<FeedbackConfig>): void {
    const currentConfig = this._feedbackConfigs.get(type);
    if (currentConfig) {
      this._feedbackConfigs.set(type, { ...currentConfig, ...config });
    }
  }

  /**
   * 获取反馈配置
   * @param type 反馈类型
   * @returns 配置对象
   */
  public getFeedbackConfig(type: FeedbackType): FeedbackConfig | undefined {
    return this._feedbackConfigs.get(type);
  }

  /**
   * 清除所有反馈效果
   */
  public clearAllFeedback(): void {
    this.hideObjectSelectedFeedback();
    this.hideMovePreviewFeedback();
    
    if (this._invalidOperationText) {
      this._invalidOperationText.destroy();
      this._invalidOperationText = null;
    }

    // 清除所有点击反馈
    this._clickFeedbacks.forEach(feedback => {
      feedback.destroy();
    });
    this._clickFeedbacks.clear();
  }

  /**
   * 销毁交互反馈管理器
   */
  public destroy(): void {
    // 清除所有反馈效果
    this.clearAllFeedback();
    
    // 移除事件监听器
    EventBus.off('interaction:object-selected');
    EventBus.off('interaction:object-deselected');
    EventBus.off('interaction:invalid-operation');
    EventBus.off('interaction:move-preview');
    EventBus.off('interaction:hide-move-preview');
    EventBus.off('interaction:click-feedback');
    EventBus.off('interaction:success-operation');
  }
}

/**
 * 便捷函数：发送对象选中事件
 */
export function emitObjectSelected(position: Position, config?: Partial<FeedbackConfig>): void {
  EventBus.emit('interaction:object-selected', { position, config });
}

/**
 * 便捷函数：发送对象取消选中事件
 */
export function emitObjectDeselected(): void {
  EventBus.emit('interaction:object-deselected');
}

/**
 * 便捷函数：发送点击反馈事件
 */
export function emitClickFeedback(position: Position, config?: Partial<FeedbackConfig>): void {
  EventBus.emit('interaction:click-feedback', { position, config });
}

/**
 * 便捷函数：发送无效操作事件
 */
export function emitInvalidOperation(message: string, position?: Position): void {
  EventBus.emit('interaction:invalid-operation', { message, position });
}

/**
 * 便捷函数：发送成功操作事件
 */
export function emitSuccessOperation(position: Position, config?: Partial<FeedbackConfig>): void {
  EventBus.emit('interaction:success-operation', { position, config });
}