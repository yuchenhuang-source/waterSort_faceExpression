/**
 * 视口管理器
 * 
 * 基于nutssort-playable的viewable-handler.ts转换而来
 * 处理广告可见性和MRAID集成
 * 提供通用的视口状态管理功能
 * 
 * @author 开发者
 * @date 2025-06-23
 */

import { EventBus } from '../game/EventBus';

/**
 * MRAID接口定义
 */
interface MRAID {
  getState(): string;
  addEventListener(event: string, handler: Function): void;
  removeEventListener(event: string, handler: Function): void;
  isViewable(): boolean;
}

/**
 * 视口状态枚举
 */
export enum ViewportState {
  LOADING = 'loading',
  DEFAULT = 'default',
  EXPANDED = 'expanded',
  HIDDEN = 'hidden'
}

/**
 * 视口事件类型
 */
export enum ViewportEventType {
  /** 广告显示 */
  SHOW_AD = 'showAd',
  /** 广告暂停 */
  PAUSE_AD = 'pauseAd',
  /** 视口状态变化 */
  VIEWPORT_CHANGED = 'viewport:changed',
  /** MRAID就绪 */
  MRAID_READY = 'viewport:mraid-ready',
  /** 视口可见性变化 */
  VISIBILITY_CHANGED = 'viewport:visibility-changed'
}

/**
 * 视口管理器配置
 */
export interface ViewportManagerConfig {
  /** 是否启用MRAID支持 */
  enableMRAID: boolean;
  /** 是否启用调试日志 */
  debug: boolean;
  /** 自动启动 */
  autoStart: boolean;
}

/**
 * 默认配置
 */
export const DEFAULT_VIEWPORT_CONFIG: ViewportManagerConfig = {
  enableMRAID: true,
  debug: false,
  autoStart: true
};

/**
 * 视口管理器类
 */
export class ViewportManager {
  private static instance: ViewportManager;
  
  /** 配置 */
  private config: ViewportManagerConfig;
  /** MRAID对象 */
  private mraid: MRAID | null = null;
  /** 当前视口状态 */
  private currentState: ViewportState = ViewportState.LOADING;
  /** 是否可见 */
  private isVisible: boolean = false;
  /** 是否已初始化 */
  private initialized: boolean = false;
  /** 事件监听器映射 */
  private eventListeners: Map<string, Function> = new Map();

  /**
   * 私有构造函数
   */
  private constructor(config: ViewportManagerConfig = DEFAULT_VIEWPORT_CONFIG) {
    this.config = { ...config };
    this.detectMRAID();
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: ViewportManagerConfig): ViewportManager {
    if (!ViewportManager.instance) {
      ViewportManager.instance = new ViewportManager(config);
    }
    return ViewportManager.instance;
  }

  /**
   * 检测MRAID环境
   */
  private detectMRAID(): void {
    const win = window as any;
    this.mraid = win.mraid || null;
    
    if (this.config.debug) {
      console.log('[ViewportManager] MRAID检测结果:', this.mraid ? '已找到' : '未找到');
    }
  }

  /**
   * 初始化视口管理器
   */
  initialize(): void {
    if (this.initialized) {
      console.warn('[ViewportManager] 已经初始化过了');
      return;
    }

    if (this.config.debug) {
      console.log('[ViewportManager] 开始初始化');
    }

    if (this.config.enableMRAID && this.mraid) {
      this.initializeMRAID();
    } else {
      this.initializeStandalone();
    }

    this.setupPageVisibilityListener();
    this.initialized = true;

    if (this.config.debug) {
      console.log('[ViewportManager] 初始化完成');
    }

    // 发送初始化完成事件
    EventBus.emit(ViewportEventType.MRAID_READY, {
      hasMRAID: !!this.mraid,
      state: this.currentState
    });

    if (this.config.autoStart) {
      this.start();
    }
  }

  /**
   * 初始化MRAID环境
   */
  private initializeMRAID(): void {
    if (!this.mraid) return;

    if (this.mraid.getState() === 'loading') {
      // SDK仍在加载中，添加ready事件监听器
      const readyHandler = () => {
        this.onMRAIDReady();
      };
      this.mraid.addEventListener('ready', readyHandler);
      this.eventListeners.set('ready', readyHandler);
    } else {
      // SDK已就绪
      this.onMRAIDReady();
    }
  }

  /**
   * 初始化独立模式
   */
  private initializeStandalone(): void {
    this.currentState = ViewportState.DEFAULT;
    this.isVisible = true;
    
    if (this.config.debug) {
      console.log('[ViewportManager] 独立模式初始化完成');
    }
  }

  /**
   * MRAID就绪处理
   */
  private onMRAIDReady(): void {
    if (!this.mraid) return;

    if (this.config.debug) {
      console.log('[ViewportManager] MRAID SDK就绪');
    }

    // 添加可见性变化监听器
    const viewableChangeHandler = (viewable: boolean) => {
      this.handleViewabilityChange(viewable);
    };
    this.mraid.addEventListener('viewableChange', viewableChangeHandler);
    this.eventListeners.set('viewableChange', viewableChangeHandler);

    // 检查初始可见性状态
    if (this.mraid.isViewable()) {
      this.isVisible = true;
      this.currentState = ViewportState.DEFAULT;
      this.showAd();
    } else {
      this.isVisible = false;
      this.currentState = ViewportState.HIDDEN;
    }
  }

  /**
   * 设置页面可见性监听器
   */
  private setupPageVisibilityListener(): void {
    const handleVisibilityChange = () => {
      const isHidden = document.hidden;
      
      if (this.config.debug) {
        console.log('[ViewportManager] 页面可见性变化:', isHidden ? '隐藏' : '可见');
      }

      if (isHidden) {
        this.handleViewabilityChange(false);
      } else {
        this.handleViewabilityChange(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    this.eventListeners.set('visibilitychange', handleVisibilityChange);
  }

  /**
   * 处理可见性变化
   */
  private handleViewabilityChange(viewable: boolean): void {
    const wasVisible = this.isVisible;
    this.isVisible = viewable;

    if (this.config.debug) {
      console.log('[ViewportManager] 可见性变化:', wasVisible, '->', viewable);
    }

    if (viewable && !wasVisible) {
      // 从不可见变为可见
      this.currentState = ViewportState.DEFAULT;
      this.showAd();
    } else if (!viewable && wasVisible) {
      // 从可见变为不可见
      this.currentState = ViewportState.HIDDEN;
      this.pauseAd();
    }

    // 发送可见性变化事件
    EventBus.emit(ViewportEventType.VISIBILITY_CHANGED, {
      visible: viewable,
      previousVisible: wasVisible,
      state: this.currentState
    });
  }

  /**
   * 显示广告
   */
  private showAd(): void {
    if (this.config.debug) {
      console.log('[ViewportManager] 显示广告');
    }

    // 发送显示广告事件
    EventBus.emit(ViewportEventType.SHOW_AD);
  }

  /**
   * 暂停广告
   */
  private pauseAd(): void {
    if (this.config.debug) {
      console.log('[ViewportManager] 暂停广告');
    }

    // 发送暂停广告事件
    EventBus.emit(ViewportEventType.PAUSE_AD);
  }

  /**
   * 启动视口管理器
   */
  start(): void {
    if (!this.initialized) {
      console.warn('[ViewportManager] 尚未初始化，请先调用initialize()');
      return;
    }

    if (this.config.debug) {
      console.log('[ViewportManager] 启动视口管理器');
    }

    // 如果当前可见，立即显示广告
    if (this.isVisible) {
      this.showAd();
    }
  }

  /**
   * 停止视口管理器
   */
  stop(): void {
    if (this.config.debug) {
      console.log('[ViewportManager] 停止视口管理器');
    }

    this.pauseAd();
  }

  /**
   * 获取当前状态
   */
  getCurrentState(): {
    state: ViewportState;
    visible: boolean;
    hasMRAID: boolean;
    initialized: boolean;
  } {
    return {
      state: this.currentState,
      visible: this.isVisible,
      hasMRAID: !!this.mraid,
      initialized: this.initialized
    };
  }

  /**
   * 检查是否可见
   */
  isCurrentlyVisible(): boolean {
    return this.isVisible;
  }

  /**
   * 检查是否有MRAID支持
   */
  hasMRAIDSupport(): boolean {
    return !!this.mraid;
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<ViewportManagerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (this.config.debug) {
      console.log('[ViewportManager] 配置已更新:', this.config);
    }
  }

  /**
   * 销毁视口管理器
   */
  destroy(): void {
    if (this.config.debug) {
      console.log('[ViewportManager] 销毁视口管理器');
    }

    // 移除MRAID事件监听器
    if (this.mraid) {
      this.eventListeners.forEach((handler, event) => {
        if (event !== 'visibilitychange') {
          this.mraid!.removeEventListener(event, handler);
        }
      });
    }

    // 移除页面可见性监听器
    const visibilityHandler = this.eventListeners.get('visibilitychange');
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler as EventListener);
    }

    // 清理
    this.eventListeners.clear();
    this.initialized = false;
    this.mraid = null;
  }
}

/**
 * 获取视口管理器实例的便捷函数
 */
export function getViewportManager(config?: ViewportManagerConfig): ViewportManager {
  return ViewportManager.getInstance(config);
}

/**
 * 启动视口管理器的便捷函数
 */
export function startViewportManager(config?: ViewportManagerConfig): void {
  const manager = getViewportManager(config);
  manager.initialize();
}