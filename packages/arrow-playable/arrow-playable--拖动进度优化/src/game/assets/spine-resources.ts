/**
 * Spine资源管理器
 * 
 * 基于ballsort-3d项目的最佳实践，实现正确的Spine资源导入和处理
 * 
 * @author 开发者
 * @date 2025-06-04
 */

/**
 * 纹理映射表接口
 */
export interface TexturesMap {
  [key: string]: string;
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
 * 示例Spine资源配置
 * 实际项目中需要根据具体的Spine资源进行配置
 */
export const EXAMPLE_SPINE_CONFIG: SpineResourceConfig = {
  key: 'example_spine',
  atlasKey: 'example_spine_atlas',
  skeletonKey: 'example_spine_data',
  defaultAnimation: 'idle',
  scale: 1.0,
  animations: ['idle', 'walk', 'run'] // 可用的动画列表
};

/**
 * 示例纹理映射表
 * 实际项目中需要根据具体的纹理文件进行配置
 */
export const EXAMPLE_TEXTURES_MAP: TexturesMap = {
  // 示例纹理映射
  // "texture1.png": "data:image/png;base64,..."
  // 实际使用时需要导入真实的图片资源
};

/**
 * 示例骨骼数据
 * 实际项目中需要导入真实的Spine JSON文件
 */
export const EXAMPLE_SKELETON_DATA = {
  skeleton: {
    hash: "example",
    spine: "4.2.80",
    x: 0,
    y: 0,
    width: 100,
    height: 100
  },
  bones: [
    {
      name: "root"
    }
  ],
  slots: [
    {
      name: "example_slot",
      bone: "root"
    }
  ],
  skins: [
    {
      name: "default"
    }
  ],
  animations: {
    idle: {
      slots: {}
    }
  }
};

/**
 * 示例Atlas文本
 * 实际项目中需要导入真实的Atlas文件内容
 */
export const EXAMPLE_ATLAS_TEXT = `
example_texture.png
size: 512,512
format: RGBA8888
filter: Linear,Linear
repeat: none
example_region
  rotate: false
  xy: 0, 0
  size: 100, 100
  orig: 100, 100
  offset: 0, 0
  index: -1
`;

/**
 * 创建Spine资源加载器
 * @param config 资源配置
 * @param skeletonData 骨骼数据
 * @param atlasText Atlas文本
 * @param texturesMap 纹理映射表
 * @returns 资源加载器对象
 */
export function createSpineResourceLoader(
  config: SpineResourceConfig,
  skeletonData: any,
  atlasText: string,
  texturesMap: TexturesMap
) {
  return {
    config,
    skeletonData,
    atlasText,
    texturesMap,
    
    /**
     * 验证资源完整性
     */
    validate(): boolean {
      // 检查配置
      if (!config || !config.key || !config.atlasKey || !config.skeletonKey) {
        console.warn('Spine资源配置不完整');
        return false;
      }
      
      // 检查骨骼数据
      if (!skeletonData || !skeletonData.skeleton) {
        console.warn('Spine骨骼数据无效');
        return false;
      }
      
      // 检查Atlas文本
      if (!atlasText || typeof atlasText !== 'string') {
        console.warn('Spine Atlas文本无效');
        return false;
      }
      
      // 检查纹理映射
      if (!texturesMap || typeof texturesMap !== 'object') {
        console.warn('Spine纹理映射表无效');
        return false;
      }
      
      return true;
    },
    
    /**
     * 获取纹理数量
     */
    getTextureCount(): number {
      return Object.keys(texturesMap).length;
    },
    
    /**
     * 获取动画列表
     */
    getAnimationList(): string[] {
      return config.animations || [];
    }
  };
}

/**
 * 示例资源加载器
 */
export const EXAMPLE_RESOURCE_LOADER = createSpineResourceLoader(
  EXAMPLE_SPINE_CONFIG,
  EXAMPLE_SKELETON_DATA,
  EXAMPLE_ATLAS_TEXT,
  EXAMPLE_TEXTURES_MAP
);