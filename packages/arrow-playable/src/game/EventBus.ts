import { Events } from 'phaser';

/**
 * 事件总线系统
 * 
 * 用于在React组件和Phaser场景之间进行事件通信
 * 基于Phaser的EventEmitter实现
 * 
 * @see https://newdocs.phaser.io/docs/3.70.0/Phaser.Events.EventEmitter
 */
export const EventBus = new Events.EventEmitter();

/**
 * 常用事件名称常量
 */
export const EVENT_NAMES = {
  /** 游戏状态变化 */
  GAME_STATE_CHANGE: 'game-state-change',
  /** 场景切换 */
  SCENE_CHANGE: 'scene-change',
  /** 游戏开始 */
  GAME_START: 'game-start',
  /** 游戏结束 */
  GAME_OVER: 'game-over',
  /** 游戏暂停 */
  GAME_PAUSE: 'game-pause',
  /** 游戏恢复 */
  GAME_RESUME: 'game-resume',
  /** 分数更新 */
  SCORE_UPDATE: 'score-update',
  /** 关卡完成 */
  LEVEL_COMPLETE: 'level-complete',
  /** 音效播放 */
  PLAY_SOUND: 'play-sound',
  /** 音乐播放 */
  PLAY_MUSIC: 'play-music',
  /** 屏幕方向变化 */
  ORIENTATION_CHANGE: 'orientation-change',
  /** 窗口大小变化 */
  RESIZE: 'resize',
  /** 编辑器状态更新 */
  EDITOR_STATE_UPDATE: 'editor-state-update',
  /** 编辑器箭头选择 */
  EDITOR_ARROW_SELECTED: 'editor-arrow-selected',
  /** 编辑器网格宽度变化 */
  EDITOR_GRID_WIDTH_CHANGE: 'editor-grid-width-change',
  /** 编辑器网格高度变化 */
  EDITOR_GRID_HEIGHT_CHANGE: 'editor-grid-height-change',
  /** 编辑器格子宽度变化 */
  EDITOR_CELL_WIDTH_CHANGE: 'editor-cell-width-change',
  /** 编辑器格子高度变化 */
  EDITOR_CELL_HEIGHT_CHANGE: 'editor-cell-height-change',
  /** 编辑器添加箭头 */
  EDITOR_ADD_ARROW: 'editor-add-arrow',
  /** 编辑器颜色变化 */
  EDITOR_COLOR_CHANGE: 'editor-color-change',
  /** 编辑器删除箭头 */
  EDITOR_DELETE_ARROW: 'editor-delete-arrow',
  /** 编辑器箭头对调（将选中箭头改到线条另一端） */
  EDITOR_FLIP_ARROW: 'editor-flip-arrow',
  /** 编辑器导出（下载 output-config.json） */
  EDITOR_EXPORT: 'editor-export',
  /** 编辑器复制 output-config.json 到剪贴板 */
  EDITOR_COPY_CONFIG: 'editor-copy-config',
  /** 编辑器缩放变化 */
  EDITOR_ZOOM_CHANGE: 'editor-zoom-change',
  /** 编辑器放大 */
  EDITOR_ZOOM_IN: 'editor-zoom-in',
  /** 编辑器缩小 */
  EDITOR_ZOOM_OUT: 'editor-zoom-out',
  /** 编辑器重置缩放 */
  EDITOR_ZOOM_RESET: 'editor-zoom-reset',
  /** 编辑器小地图更新 */
  EDITOR_MINIMAP_UPDATE: 'editor-minimap-update',
  /** 编辑器小地图导航 */
  EDITOR_MINIMAP_PAN: 'editor-minimap-pan',
  /** 编辑器应用图片导入结果（替换当前关卡） */
  EDITOR_APPLY_IMPORT: 'editor-apply-import'
} as const;

/**
 * 事件总线工具类
 */
export class EventBusUtils {
  /**
   * 发送游戏状态变化事件
   * @param state 新的游戏状态
   */
  static emitGameStateChange(state: string): void {
    EventBus.emit(EVENT_NAMES.GAME_STATE_CHANGE, state);
  }

  /**
   * 发送场景切换事件
   * @param sceneName 场景名称
   */
  static emitSceneChange(sceneName: string): void {
    EventBus.emit(EVENT_NAMES.SCENE_CHANGE, sceneName);
  }

  /**
   * 发送分数更新事件
   * @param score 新分数
   */
  static emitScoreUpdate(score: number): void {
    EventBus.emit(EVENT_NAMES.SCORE_UPDATE, score);
  }

  /**
   * 发送音效播放事件
   * @param soundKey 音效键名
   * @param volume 音量 (0-1)
   */
  static emitPlaySound(soundKey: string, volume: number = 1): void {
    EventBus.emit(EVENT_NAMES.PLAY_SOUND, { soundKey, volume });
  }

  /**
   * 发送屏幕方向变化事件
   * @param orientation 新的屏幕方向
   */
  static emitOrientationChange(orientation: string): void {
    EventBus.emit(EVENT_NAMES.ORIENTATION_CHANGE, orientation);
  }

  /**
   * 移除所有监听器
   */
  static removeAllListeners(): void {
    EventBus.removeAllListeners();
  }

  /**
   * 获取监听器数量
   * @param eventName 事件名称
   * @returns 监听器数量
   */
  static getListenerCount(eventName: string): number {
    return EventBus.listenerCount(eventName);
  }
}
