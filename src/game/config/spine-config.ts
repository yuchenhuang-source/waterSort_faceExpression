/**
 * Spine动画资源配置文件
 * 
 * 定义游戏中使用的Spine动画资源配置
 * 
 * @author 开发者
 * @date 2025-05-20
 */

/**
 * Spine资源配置接口
 */
export interface SpineResource {
  /** 资源键名 */
  key: string;
  /** JSON文件路径 */
  jsonPath: string;
  /** Atlas文件路径 */
  atlasPath: string;
  /** 是否使用预乘alpha */
  premultipliedAlpha: boolean;
}

/**
 * Spine动画配置接口
 */
export interface SpineAnimation {
  /** 关联的资源键名 */
  key: string;
  /** 动画名称 - null表示不使用Spine动画 */
  animation: string | null;
  /** 是否循环播放 */
  loop: boolean;
}

/**
 * Spine配置接口
 */
export interface SpineConfig {
  /** Spine资源列表 */
  resources: SpineResource[];
  /** 动画配置 */
  animations: {
    /** 示例动画 */
    exampleAnimation: SpineAnimation;
  };
}

/**
 * 默认Spine配置
 */
export const DEFAULT_SPINE_CONFIG: SpineConfig = {
  resources: [
    {
      key: 'example',
      jsonPath: 'assets/spine/example.json',
      atlasPath: 'assets/spine/example.atlas',
      premultipliedAlpha: false
    }
  ],
  
  animations: {
    // 示例动画
    exampleAnimation: {
      key: 'example',
      animation: 'idle',
      loop: true
    }
  }
};

/**
 * 获取动画配置
 * @param animationKey 动画键名
 * @returns 动画配置或null
 */
export function getAnimationConfig(animationKey: keyof SpineConfig['animations']): SpineAnimation | null {
  return DEFAULT_SPINE_CONFIG.animations[animationKey] || null;
}

/**
 * 获取资源配置
 * @param resourceKey 资源键名
 * @returns 资源配置或null
 */
export function getResourceConfig(resourceKey: string): SpineResource | null {
  return DEFAULT_SPINE_CONFIG.resources.find(resource => resource.key === resourceKey) || null;
}