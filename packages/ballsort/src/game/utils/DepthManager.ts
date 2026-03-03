/**
 * 深度管理系统
 * 
 * 实现伪3D效果的深度计算和管理
 * 根据设计文档实现精确的深度管理
 * 
 * @author 开发者
 * @date 2025-06-05
 */

/**
 * 深度管理器
 * 负责计算和管理游戏中所有对象的深度值
 */
export class DepthManager {
  /** 基础深度值 */
  private static readonly BASE_DEPTH = {
    /** 背景层 */
    BACKGROUND: 0,
    /** 游戏对象后部 */
    OBJECT_BACK: 10,
    /** 游戏对象前部 */
    OBJECT_FRONT: 50,
    /** 浮动对象（移动中） */
    FLOATING_OBJECT: 80,
    /** UI层 */
    UI: 100
  };
  
  /** 层级深度增量 - 增大增量确保层级间有足够的深度差距 */
  private static readonly LAYER_INCREMENT = 20;
  
  /** 位置深度增量 */
  private static readonly POSITION_INCREMENT = 0.1;
  
  /** 同排内部深度偏移 */
  private static readonly INTERNAL_OFFSET = {
    /** 静态图片相对于Spine对象的偏移 */
    STATIC_IMAGE: 2,
    /** Spine对象基础偏移 */
    SPINE_OBJECT: 0
  };
  
  /**
   * 获取游戏对象的深度值（伪3D层级布局）
   * @param layer 对象所在层级（0-2，0为最前层，2为最后层）
   * @param isFront 是否为前部
   * @returns 深度值
   */
  public static getObjectDepth(layer: number, isFront: boolean): number {
    const baseDepth = isFront ? this.BASE_DEPTH.OBJECT_FRONT : this.BASE_DEPTH.OBJECT_BACK;
    // 伪3D层级：第一层（layer=0）深度最高，第三层（layer=2）深度最低
    return baseDepth + (2 - layer) * this.LAYER_INCREMENT;
  }
  
  /**
   * 获取静态图片的深度值
   * @param layer 对象所在层级（0-2，0为最前层，2为最后层）
   * @returns 深度值
   */
  public static getStaticImageDepth(layer: number): number {
    const baseDepth = this.BASE_DEPTH.OBJECT_FRONT;
    // 静态图片应该在Spine对象之上，确保前排不被后排遮挡
    return baseDepth + (2 - layer) * this.LAYER_INCREMENT + this.INTERNAL_OFFSET.STATIC_IMAGE;
  }
  
  /**
   * 获取Spine对象的深度值
   * @param layer 对象所在层级（0-2，0为最前层，2为最后层）
   * @returns 深度值
   */
  public static getSpineDepth(layer: number): number {
    const baseDepth = this.BASE_DEPTH.OBJECT_FRONT;
    // Spine对象在静态图片之下
    return baseDepth + (2 - layer) * this.LAYER_INCREMENT + this.INTERNAL_OFFSET.SPINE_OBJECT;
  }
  
  /**
   * 获取子对象的深度值（伪3D层级布局）
   * @param layer 子对象所在层级（0-2，0为最前层，2为最后层）
   * @param position 子对象在父对象上的位置（0-3，0为最下面）
   * @param isFront 是否为前部
   * @returns 深度值
   */
  public static getChildObjectDepth(layer: number, position: number, isFront: boolean): number {
    if (isFront) {
      const baseDepth = this.BASE_DEPTH.OBJECT_FRONT;
      // 伪3D层级：第一层（layer=0）深度最高，第三层（layer=2）深度最低
      // 位置越高，深度值越大（上面的对象在前面）
      return baseDepth + (2 - layer) * this.LAYER_INCREMENT + position * this.POSITION_INCREMENT;
    } else {
      // 后部深度必须使用安全计算方法，确保不会遮挡静态图片
      return this.getChildObjectBackDepthSafe(layer, position);
    }
  }
  
  /**
   * 获取浮动对象的深度值（移动中的对象应该在最上层）
   * @param isFront 是否为前部
   * @param layer 对象原始所在层级（可选，用于基于层级的安全计算）
   * @returns 深度值
   */
  public static getFloatingObjectDepth(isFront: boolean, layer?: number): number {
    if (isFront) {
      // 前部使用原有逻辑，确保在最上层
      const baseDepth = this.BASE_DEPTH.OBJECT_FRONT;
      return baseDepth + this.BASE_DEPTH.FLOATING_OBJECT;
    } else {
      // 基于对象原始层级计算安全的浮动深度
      if (layer !== undefined && layer >= 0 && layer <= 2) {
        // 基于原始层级计算：浮动对象后部深度 = 当前层级静态图片深度 - 1
        const currentLayerStaticDepth = this.getStaticImageDepth(layer);
        const safeBackDepth = currentLayerStaticDepth - 1;
        return safeBackDepth;
      } else {
        // 兜底方案：使用最小静态图片深度-8
        let minStaticDepth = Number.MAX_SAFE_INTEGER;
        
        for (let layerIndex = 0; layerIndex <= 2; layerIndex++) {
          const staticDepth = this.getStaticImageDepth(layerIndex);
          minStaticDepth = Math.min(minStaticDepth, staticDepth);
        }
        
        const safeBackDepth = minStaticDepth - 8;
        return safeBackDepth;
      }
    }
  }

  /**
   * 获取子对象后部的安全深度值（确保不会遮挡静态图片）
   * @param layer 子对象所在层级（0-2，0为最前层，2为最后层）
   * @param position 子对象在父对象上的位置（0-3，0为最下面）
   * @returns 安全的后部深度值
   */
  public static getChildObjectBackDepthSafe(layer: number, position: number): number {
    // 简化修复：直接将子对象后部深度设置为当前层级静态图片深度-1
    // 获取当前层级静态图片的深度值
    const staticDepth = this.getStaticImageDepth(layer);
    
    // 子对象后部深度 = 静态图片深度 - 1，确保不会遮挡
    const safeDepth = staticDepth - 1;
    
    return safeDepth;
  }
  
  /**
   * 获取背景深度值
   * @returns 深度值
   */
  public static getBackgroundDepth(): number {
    return this.BASE_DEPTH.BACKGROUND;
  }
  
  /**
   * 获取UI深度值
   * @returns 深度值
   */
  public static getUIDepth(): number {
    return this.BASE_DEPTH.UI;
  }

  /**
   * 计算跨层移动时的临时深度值
   * 用于对象在移动过程中显示在正确的层级
   * @param targetLayer 目标层级
   * @param isFront 是否为前部
   * @returns 临时深度值
   */
  public static getCrossLayerMoveDepth(targetLayer: number, isFront: boolean): number {
    if (isFront) {
      // 前部使用原有逻辑
      const baseDepth = this.BASE_DEPTH.OBJECT_FRONT;
      const layerDepth = baseDepth + (2 - targetLayer) * this.LAYER_INCREMENT;
      const crossLayerOffset = 1; // 小幅提升确保移动中的对象显示在目标层级的上方
      return layerDepth + crossLayerOffset;
    } else {
      // 简化修复：跨层移动对象后部使用目标层级静态图片深度-1
      const targetLayerStaticDepth = this.getStaticImageDepth(targetLayer);
      const safeDepth = targetLayerStaticDepth - 1;
      return safeDepth;
    }
  }

  /**
   * 验证深度值是否合理
   * @param depth 深度值
   * @param objectType 对象类型
   * @returns 是否合理
   */
  public static validateDepth(depth: number, objectType: string): boolean {
    const isValid = typeof depth === 'number' &&
                   !isNaN(depth) &&
                   isFinite(depth) &&
                   depth >= this.BASE_DEPTH.BACKGROUND &&
                   depth <= this.BASE_DEPTH.UI + 100;
    
    return isValid;
  }
  
  /**
   * 调试输出深度信息
   * @param objectType 对象类型
   * @param layer 层级
   * @param position 位置
   * @param isFront 是否前部
   * @param depth 计算出的深度值
   */
  public static logDepthInfo(
    objectType: string,
    layer: number,
    position: number = -1,
    isFront: boolean = true,
    depth: number
  ): void {
    const positionStr = position >= 0 ? `, 位置:${position}` : '';
    const frontStr = isFront ? '前部' : '后部';
    
    console.log(`[深度管理] ${objectType} - 层级:${layer}${positionStr}, ${frontStr}, 深度:${depth}`);
    
    // 如果是子对象后部，额外检查与静态图片的关系
    if (objectType.includes('子对象') && !isFront && layer >= 0) {
      const staticDepth = this.getStaticImageDepth(layer);
      const isCorrect = depth < staticDepth;
      const status = isCorrect ? '✅' : '❌';
      
      console.log(`[深度验证] ${status} 子对象后部深度(${depth}) vs 静态图片深度(${staticDepth})`);
    }
  }

  /**
   * 调试方法：详细分析深度计算过程
   * @param layer 层级
   * @param position 位置（可选）
   * @param isFront 是否前部（可选）
   */
  public static debugDepthCalculation(layer: number, position?: number, isFront?: boolean): void {
    console.group(`[深度调试] 层级 ${layer} 深度计算分析`);
    
    // 基础常量
    console.log('基础深度配置:', this.BASE_DEPTH);
    console.log('层级增量:', this.LAYER_INCREMENT);
    console.log('位置增量:', this.POSITION_INCREMENT);
    console.log('内部偏移:', this.INTERNAL_OFFSET);
    
    // 对象深度计算
    const objectFrontDepth = this.getObjectDepth(layer, true);
    const objectBackDepth = this.getObjectDepth(layer, false);
    const staticDepth = this.getStaticImageDepth(layer);
    const spineDepth = this.getSpineDepth(layer);
    
    console.log(`对象前部深度: ${objectFrontDepth}`);
    console.log(`对象后部深度: ${objectBackDepth}`);
    console.log(`静态图片深度: ${staticDepth}`);
    console.log(`Spine对象深度: ${spineDepth}`);
    
    // 子对象深度计算（如果提供了position参数）
    if (position !== undefined) {
      const childFrontDepth = this.getChildObjectDepth(layer, position, true);
      const childBackDepth = this.getChildObjectDepth(layer, position, false);
      const childBackSafeDepth = this.getChildObjectBackDepthSafe(layer, position);
      
      console.log(`子对象前部深度: ${childFrontDepth}`);
      console.log(`子对象后部深度: ${childBackDepth}`);
      console.log(`子对象后部安全深度: ${childBackSafeDepth}`);
    }
    
    // 浮动对象深度计算
    const floatingFrontDepth = this.getFloatingObjectDepth(true, layer);
    const floatingBackDepth = this.getFloatingObjectDepth(false, layer);
    
    console.log(`浮动对象前部深度: ${floatingFrontDepth}`);
    console.log(`浮动对象后部深度: ${floatingBackDepth}`);
    
    // 深度关系验证
    if (position !== undefined) {
      const childBackDepth = this.getChildObjectDepth(layer, position, false);
      
      // 简化验证：只检查子对象后部与当前层静态图片的关系
      const currentLayerStatic = this.getStaticImageDepth(layer);
      const isCorrect = childBackDepth < currentLayerStatic;
      
      console.log(`深度关系验证: 子对象后部(${childBackDepth}) < 静态图片(${currentLayerStatic}) = ${isCorrect ? '✅' : '❌'}`);
    }
    
    console.groupEnd();
  }

  /**
   * 获取层级范围内的所有深度值
   * @param maxLayer 最大层级数
   * @returns 深度值映射表
   */
  public static getDepthMap(maxLayer: number = 2): Record<string, number> {
    const depthMap: Record<string, number> = {};
    
    depthMap.background = this.getBackgroundDepth();
    depthMap.ui = this.getUIDepth();
    
    for (let layer = 0; layer <= maxLayer; layer++) {
      depthMap[`object_front_layer_${layer}`] = this.getObjectDepth(layer, true);
      depthMap[`object_back_layer_${layer}`] = this.getObjectDepth(layer, false);
      depthMap[`static_image_layer_${layer}`] = this.getStaticImageDepth(layer);
      depthMap[`spine_object_layer_${layer}`] = this.getSpineDepth(layer);
      depthMap[`floating_front_layer_${layer}`] = this.getFloatingObjectDepth(true, layer);
      depthMap[`floating_back_layer_${layer}`] = this.getFloatingObjectDepth(false, layer);
    }
    
    return depthMap;
  }

  /**
   * 重置深度管理器（如果需要的话）
   */
  public static reset(): void {
    // 目前深度管理器是无状态的，不需要重置
    console.log('[深度管理] 深度管理器已重置');
  }
}