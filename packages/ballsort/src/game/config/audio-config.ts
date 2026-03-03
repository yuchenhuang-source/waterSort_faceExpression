/**
 * 音频配置文件
 * 
 * 定义游戏中使用的音频资源配置
 * 提供通用的音频管理配置接口
 * 
 * @author 开发者
 * @date 2025-06-23
 */

/**
 * 音频配置接口
 */
export interface AudioItem {
  /** 音频资源键名 */
  key: string;
  /** 音频资源路径 */
  path: string;
  /** 音频配置选项 */
  config: {
    /** 是否循环播放 */
    loop: boolean;
    /** 音量（0-1） */
    volume: number;
  };
}

/**
 * 音频配置
 */
export interface AudioConfig {
  /** 所有音频资源 */
  sounds: {
    /** 背景音乐 */
    bgm: AudioItem;
    /** 通用音效 */
    [key: string]: AudioItem;
  };
}

/**
 * 音频事件类型
 */
export enum AudioEventType {
  /** 播放背景音乐 */
  PLAY_BGM = 'audio:play-bgm',
  /** 暂停背景音乐 */
  PAUSE_BGM = 'audio:pause-bgm',
  /** 停止背景音乐 */
  STOP_BGM = 'audio:bgm-stop',
  /** 开始背景音乐 */
  START_BGM = 'audio:bgm-start',
  /** 音频开关切换 */
  TOGGLE_AUDIO = 'audio:toggle',
  /** 播放音效 */
  PLAY_SOUND = 'audio:play-sound',
  /** 错误反馈音效 */
  ERROR_FEEDBACK = 'audio:error-feedback'
}

/**
 * 默认音频配置
 */
export const DEFAULT_AUDIO_CONFIG: AudioConfig = {
  sounds: {
    bgm: {
      key: 'bgm',
      path: 'assets/audio/bgm.mp3',
      config: {
        loop: true,
        volume: 0.5
      }
    },
    click: {
      key: 'click',
      path: 'assets/audio/click.mp3',
      config: {
        loop: false,
        volume: 1.0
      }
    },
    success: {
      key: 'success',
      path: 'assets/audio/success.mp3',
      config: {
        loop: false,
        volume: 1.0
      }
    },
    error: {
      key: 'error',
      path: 'assets/audio/error.mp3',
      config: {
        loop: false,
        volume: 1.0
      }
    }
  }
};

/**
 * 音频管理器配置接口
 */
export interface AudioManagerConfig {
  /** 是否启用音频 */
  enabled: boolean;
  /** 全局音量 */
  globalVolume: number;
  /** 背景音乐音量 */
  bgmVolume: number;
  /** 音效音量 */
  sfxVolume: number;
  /** 是否在移动端优化 */
  mobileOptimized: boolean;
  /** 音频预加载策略 */
  preloadStrategy: 'auto' | 'metadata' | 'none';
}

/**
 * 默认音频管理器配置
 */
export const DEFAULT_AUDIO_MANAGER_CONFIG: AudioManagerConfig = {
  enabled: true,
  globalVolume: 1.0,
  bgmVolume: 0.5,
  sfxVolume: 1.0,
  mobileOptimized: true,
  preloadStrategy: 'auto'
};