/**
 * 通用音频管理工具类
 * 
 * 基于nutssort-playable的sound.tsx转换而来的TypeScript工具类
 * 提供统一的音频播放、暂停、音量控制等功能
 * 特别优化移动端背景音乐持续播放
 * 
 * @author 开发者
 * @date 2025-06-23
 */

import { EventBus } from '../game/EventBus';
import { AudioConfig, AudioEventType, AudioManagerConfig, DEFAULT_AUDIO_MANAGER_CONFIG } from '../game/config/audio-config';

/**
 * 音频管理器类
 */
export class AudioManager {
  private static instance: AudioManager;
  
  /** 背景音乐实例 */
  private backgroundMusic: HTMLAudioElement | null = null;
  /** 音效实例映射 */
  private soundEffects: Map<string, HTMLAudioElement> = new Map();
  /** 音频配置 */
  private config: AudioManagerConfig;
  /** 是否启用音频 */
  private audioEnabled: boolean = true;
  
  /** 用户交互状态 */
  private userInteracted: boolean = false;
  /** 是否应该播放背景音乐 */
  private shouldPlayBGM: boolean = false;
  /** 背景音乐检查定时器 */
  private bgmCheckInterval: number | null = null;
  /** 重试计数 */
  private retryCount: number = 0;
  /** 是否为移动端 */
  private isMobile: boolean = false;
  /** 上次检查时间 */
  private lastBGMCheckTime: number = 0;

  /**
   * 私有构造函数
   */
  private constructor(config: AudioManagerConfig = DEFAULT_AUDIO_MANAGER_CONFIG) {
    this.config = { ...config };
    this.detectMobile();
    this.setupEventListeners();
    this.setupUserInteractionListeners();
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: AudioManagerConfig): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager(config);
    }
    return AudioManager.instance;
  }

  /**
   * 检测移动端设备
   */
  private detectMobile(): void {
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    this.isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase()) ||
                    ('ontouchstart' in window) ||
                    (navigator.maxTouchPoints > 0);
  }

  /**
   * 设置用户交互监听器
   */
  private setupUserInteractionListeners(): void {
    const interactionEvents = ['touchstart', 'click', 'keydown'];
    const handleUserInteraction = async () => {
      if (this.userInteracted) return;

      this.userInteracted = true;
      console.log('[AudioManager] 用户首次交互，启用音频功能');

      // 如果应该播放背景音乐，立即尝试播放
      if (this.shouldPlayBGM && this.audioEnabled && this.backgroundMusic) {
        try {
          await this.backgroundMusic.play();
          console.log('[AudioManager] 用户交互后背景音乐播放成功');
        } catch (error) {
          console.error('[AudioManager] 用户交互后背景音乐播放失败:', error);
        }
      }

      // 启动持续监控
      this.startBGMMonitoring();
    };

    interactionEvents.forEach(eventType => {
      document.addEventListener(eventType, handleUserInteraction, { once: true, passive: true });
    });
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 播放背景音乐
    EventBus.on(AudioEventType.PLAY_BGM, () => this.playBGM());
    EventBus.on(AudioEventType.START_BGM, () => this.playBGM());
    
    // 暂停背景音乐
    EventBus.on(AudioEventType.PAUSE_BGM, () => this.pauseBGM());
    
    // 停止背景音乐
    EventBus.on(AudioEventType.STOP_BGM, () => this.stopBGM());
    
    // 音频开关切换
    EventBus.on(AudioEventType.TOGGLE_AUDIO, () => this.toggleAudio());
    
    // 播放音效
    EventBus.on(AudioEventType.PLAY_SOUND, (soundKey: string) => this.playSound(soundKey));
    
    // 错误反馈音效
    EventBus.on(AudioEventType.ERROR_FEEDBACK, () => this.playErrorFeedback());

    // 广告相关事件
    EventBus.on('showAd', () => {
      this.shouldPlayBGM = true;
      if (this.userInteracted && this.backgroundMusic && this.audioEnabled) {
        this.backgroundMusic.play().catch(error => {
          console.error('[AudioManager] 广告显示时背景音乐播放失败:', error);
        });
      }
    });

    EventBus.on('pauseAd', () => {
      this.shouldPlayBGM = false;
      if (this.backgroundMusic) {
        this.backgroundMusic.pause();
      }
    });

    // 游戏开始事件
    EventBus.on('game:start', () => this.playBGM());

    // 页面可见性变化处理
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stopBGMMonitoring();
      } else {
        if (this.userInteracted && this.audioEnabled) {
          this.startBGMMonitoring();
          setTimeout(() => this.checkAndPlayBGM(), 100);
        }
      }
    });
  }

  /**
   * 初始化音频资源
   */
  async initializeAudio(audioConfig: AudioConfig): Promise<void> {
    try {
      // 创建背景音乐实例
      if (audioConfig.sounds.bgm) {
        this.backgroundMusic = new Audio(audioConfig.sounds.bgm.path);
        this.backgroundMusic.loop = audioConfig.sounds.bgm.config.loop;
        this.backgroundMusic.volume = audioConfig.sounds.bgm.config.volume * this.config.bgmVolume;
        
        // 添加事件监听器
        this.backgroundMusic.addEventListener('error', (e) => {
          console.error('[AudioManager] 背景音乐加载失败:', e);
          this.retryCount++;
        });
        
        this.backgroundMusic.addEventListener('canplaythrough', () => {
          console.log('[AudioManager] 背景音乐加载完成');
        });

        this.backgroundMusic.addEventListener('pause', () => {
          console.log('[AudioManager] 背景音乐暂停');
        });

        this.backgroundMusic.addEventListener('ended', () => {
          console.log('[AudioManager] 背景音乐结束');
        });

        this.backgroundMusic.addEventListener('play', () => {
          console.log('[AudioManager] 背景音乐开始播放');
          this.retryCount = 0;
        });
      }

      // 预加载音效
      for (const [key, audioItem] of Object.entries(audioConfig.sounds)) {
        if (key !== 'bgm') {
          try {
            const audio = new Audio(audioItem.path);
            audio.preload = this.config.preloadStrategy;
            audio.volume = audioItem.config.volume * this.config.sfxVolume;
            
            audio.addEventListener('error', (e) => {
              console.error(`[AudioManager] 音效 ${key} 加载失败:`, e);
            });
            
            audio.addEventListener('canplaythrough', () => {
              console.log(`[AudioManager] 音效 ${key} 加载完成`);
            });
            
            this.soundEffects.set(key, audio);
          } catch (error) {
            console.error(`[AudioManager] 音效 ${key} 创建失败:`, error);
          }
        }
      }

      console.log(`[AudioManager] 音频初始化完成，加载了 ${this.soundEffects.size} 个音效`);
    } catch (error) {
      console.error('[AudioManager] 音频初始化失败:', error);
      throw error;
    }
  }

  /**
   * 播放背景音乐
   */
  async playBGM(): Promise<void> {
    this.shouldPlayBGM = true;
    
    if (!this.audioEnabled || !this.backgroundMusic) {
      return;
    }

    try {
      await this.backgroundMusic.play();
      console.log('[AudioManager] 背景音乐播放成功');
    } catch (error) {
      console.error('[AudioManager] 背景音乐播放失败:', error);
    }
  }

  /**
   * 暂停背景音乐
   */
  pauseBGM(): void {
    this.shouldPlayBGM = false;
    
    if (this.backgroundMusic) {
      this.backgroundMusic.pause();
      console.log('[AudioManager] 背景音乐已暂停');
    }
  }

  /**
   * 停止背景音乐
   */
  stopBGM(): void {
    this.shouldPlayBGM = false;
    
    if (this.backgroundMusic) {
      this.backgroundMusic.pause();
      this.backgroundMusic.currentTime = 0;
      console.log('[AudioManager] 背景音乐已停止');
    }
  }

  /**
   * 播放音效
   */
  async playSound(soundKey: string): Promise<void> {
    if (!this.audioEnabled) {
      return;
    }

    const audio = this.soundEffects.get(soundKey);
    if (audio) {
      try {
        audio.currentTime = 0;
        await audio.play();
        console.log(`[AudioManager] 音效 ${soundKey} 播放成功`);
      } catch (error) {
        console.error(`[AudioManager] 音效 ${soundKey} 播放失败:`, error);
      }
    } else {
      console.warn(`[AudioManager] 音效 ${soundKey} 不存在`);
    }
  }

  /**
   * 播放错误反馈音效
   */
  async playErrorFeedback(): Promise<void> {
    await this.playSound('error');
  }

  /**
   * 切换音频开关
   */
  toggleAudio(): void {
    this.audioEnabled = !this.audioEnabled;
    console.log(`[AudioManager] 音频${this.audioEnabled ? '启用' : '禁用'}`);
    
    if (!this.audioEnabled) {
      this.shouldPlayBGM = false;
      if (this.backgroundMusic) {
        this.backgroundMusic.pause();
      }
      this.stopBGMMonitoring();
    } else {
      if (this.userInteracted) {
        this.startBGMMonitoring();
      }
    }

    // 发送音频状态变化事件
    EventBus.emit('audio:status-changed', { enabled: this.audioEnabled });
  }

  /**
   * 设置全局音量
   */
  setGlobalVolume(volume: number): void {
    this.config.globalVolume = Math.max(0, Math.min(1, volume));
    this.updateAllVolumes();
  }

  /**
   * 设置背景音乐音量
   */
  setBGMVolume(volume: number): void {
    this.config.bgmVolume = Math.max(0, Math.min(1, volume));
    if (this.backgroundMusic) {
      this.backgroundMusic.volume = this.config.bgmVolume * this.config.globalVolume;
    }
  }

  /**
   * 设置音效音量
   */
  setSFXVolume(volume: number): void {
    this.config.sfxVolume = Math.max(0, Math.min(1, volume));
    this.soundEffects.forEach(audio => {
      audio.volume = this.config.sfxVolume * this.config.globalVolume;
    });
  }

  /**
   * 更新所有音量
   */
  private updateAllVolumes(): void {
    if (this.backgroundMusic) {
      this.backgroundMusic.volume = this.config.bgmVolume * this.config.globalVolume;
    }
    
    this.soundEffects.forEach(audio => {
      audio.volume = this.config.sfxVolume * this.config.globalVolume;
    });
  }

  /**
   * 背景音乐状态检查和自动播放
   */
  private async checkAndPlayBGM(): Promise<void> {
    const now = Date.now();
    
    const checkInterval = this.isMobile ? 500 : 2000;
    if (now - this.lastBGMCheckTime < checkInterval) {
      return;
    }
    this.lastBGMCheckTime = now;

    if (!this.audioEnabled || !this.shouldPlayBGM || !this.userInteracted || !this.backgroundMusic) {
      return;
    }

    try {
      if (this.backgroundMusic.paused || this.backgroundMusic.ended) {
        if (this.backgroundMusic.ended) {
          this.backgroundMusic.currentTime = 0;
        }
        
        await this.backgroundMusic.play();
        this.retryCount = 0;
      } else if (this.backgroundMusic.readyState >= 2) {
        this.retryCount = 0;
      }
    } catch (error) {
      this.retryCount++;
      console.error(`[AudioManager] 背景音乐自动播放失败 (重试 ${this.retryCount}/5):`, error);
      
      if (this.retryCount >= 5) {
        console.warn('[AudioManager] 背景音乐重试次数过多，暂停自动播放检查');
        this.shouldPlayBGM = false;
        
        setTimeout(() => {
          this.retryCount = 0;
          this.shouldPlayBGM = true;
        }, 5000);
      }
    }
  }

  /**
   * 启动背景音乐持续检查
   */
  private startBGMMonitoring(): void {
    if (this.bgmCheckInterval) {
      return;
    }

    const checkInterval = this.isMobile ? 300 : 1000;
    
    this.bgmCheckInterval = window.setInterval(() => {
      this.checkAndPlayBGM();
    }, checkInterval);
    
    console.log('[AudioManager] 启动背景音乐监控');
  }

  /**
   * 停止背景音乐监控
   */
  private stopBGMMonitoring(): void {
    if (this.bgmCheckInterval) {
      clearInterval(this.bgmCheckInterval);
      this.bgmCheckInterval = null;
      console.log('[AudioManager] 停止背景音乐监控');
    }
  }

  /**
   * 获取音频状态
   */
  getAudioStatus(): {
    enabled: boolean;
    bgmPlaying: boolean;
    globalVolume: number;
    bgmVolume: number;
    sfxVolume: number;
    userInteracted: boolean;
  } {
    return {
      enabled: this.audioEnabled,
      bgmPlaying: this.backgroundMusic ? !this.backgroundMusic.paused : false,
      globalVolume: this.config.globalVolume,
      bgmVolume: this.config.bgmVolume,
      sfxVolume: this.config.sfxVolume,
      userInteracted: this.userInteracted
    };
  }

  /**
   * 销毁音频管理器
   */
  destroy(): void {
    this.stopBGMMonitoring();
    
    // 移除事件监听器
    EventBus.off(AudioEventType.PLAY_BGM);
    EventBus.off(AudioEventType.START_BGM);
    EventBus.off(AudioEventType.PAUSE_BGM);
    EventBus.off(AudioEventType.STOP_BGM);
    EventBus.off(AudioEventType.TOGGLE_AUDIO);
    EventBus.off(AudioEventType.PLAY_SOUND);
    EventBus.off(AudioEventType.ERROR_FEEDBACK);
    EventBus.off('showAd');
    EventBus.off('pauseAd');
    EventBus.off('game:start');
    
    // 清理音频资源
    if (this.backgroundMusic) {
      this.backgroundMusic.pause();
      this.backgroundMusic = null;
    }
    
    this.soundEffects.clear();
    
    console.log('[AudioManager] 音频管理器已销毁');
  }
}

/**
 * 获取音频管理器实例的便捷函数
 */
export function getAudioManager(config?: AudioManagerConfig): AudioManager {
  return AudioManager.getInstance(config);
}