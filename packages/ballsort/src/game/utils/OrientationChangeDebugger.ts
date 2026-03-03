/**
 * 方向变化调试器
 * 
 * 专门用于诊断横竖屏切换时的间距和位置计算问题
 * 提供详细的调试信息和分析功能
 * 
 * @author 开发者
 * @date 2025-06-23
 */

import { ScreenOrientation } from './ResponsiveBackgroundManager';

/**
 * 方向调试信息接口
 */
export interface OrientationDebugInfo {
  /** 屏幕尺寸 */
  screenSize: { width: number; height: number };
  /** 屏幕比例 */
  screenRatio: number;
  /** 识别的方向类型 */
  orientationType: string;
  /** 断点索引 */
  breakpointIndex: number;
  /** 间距缩放参数 */
  spacingScale: number;
  /** 最终间距 */
  finalSpacing: { horizontal: number; vertical: number };
  /** 时间戳 */
  timestamp: number;
  /** 额外调试数据 */
  extraData?: Record<string, any>;
}

/**
 * 方向变化调试器类
 */
export class OrientationChangeDebugger {
  private static instance: OrientationChangeDebugger;
  private debugHistory: OrientationDebugInfo[] = [];
  private maxHistorySize = 10;
  private debugEnabled = false;

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): OrientationChangeDebugger {
    if (!OrientationChangeDebugger.instance) {
      OrientationChangeDebugger.instance = new OrientationChangeDebugger();
    }
    return OrientationChangeDebugger.instance;
  }

  /**
   * 启用/禁用调试
   */
  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
    if (enabled) {
      console.log('[OrientationDebugger] 调试模式已启用');
    }
  }

  /**
   * 检查调试是否启用
   */
  isDebugEnabled(): boolean {
    return this.debugEnabled;
  }

  /**
   * 记录方向变化调试信息
   */
  recordOrientationChange(debugInfo: OrientationDebugInfo): void {
    if (!this.debugEnabled) return;

    console.log('[OrientationDebugger] 记录方向变化:', {
      尺寸: `${debugInfo.screenSize.width}x${debugInfo.screenSize.height}`,
      比例: debugInfo.screenRatio.toFixed(3),
      方向: debugInfo.orientationType,
      断点: debugInfo.breakpointIndex,
      间距缩放: debugInfo.spacingScale,
      最终间距: debugInfo.finalSpacing
    });
    
    // 添加到历史记录
    this.debugHistory.push(debugInfo);
    
    // 保持历史记录大小
    if (this.debugHistory.length > this.maxHistorySize) {
      this.debugHistory.shift();
    }
    
    // 如果有历史记录，进行对比分析
    if (this.debugHistory.length > 1) {
      this.compareWithPrevious();
    }
  }

  /**
   * 与上一次记录进行对比分析
   */
  private compareWithPrevious(): void {
    const current = this.debugHistory[this.debugHistory.length - 1];
    const previous = this.debugHistory[this.debugHistory.length - 2];
    
    console.log('[OrientationDebugger] 对比分析:');
    
    // 屏幕尺寸变化
    const sizeChanged = current.screenSize.width !== previous.screenSize.width || 
                       current.screenSize.height !== previous.screenSize.height;
    if (sizeChanged) {
      console.log(`  屏幕尺寸变化: ${previous.screenSize.width}x${previous.screenSize.height} -> ${current.screenSize.width}x${current.screenSize.height}`);
    }
    
    // 方向类型变化
    if (current.orientationType !== previous.orientationType) {
      console.log(`  方向变化: ${previous.orientationType} -> ${current.orientationType}`);
    }
    
    // 间距缩放变化
    if (current.spacingScale !== previous.spacingScale) {
      console.log(`  间距缩放变化: ${previous.spacingScale} -> ${current.spacingScale}`);
      
      // 检查是否应该保持一致
      if (this.shouldSpacingBeConsistent(current, previous)) {
        console.warn(`⚠️ 警告: 竖屏和横屏的间距缩放应该保持一致！`);
        console.warn(`   当前: ${current.orientationType} spacingScale=${current.spacingScale}`);
        console.warn(`   之前: ${previous.orientationType} spacingScale=${previous.spacingScale}`);
      }
    }
    
    // 最终间距变化
    const horizontalChange = current.finalSpacing.horizontal - previous.finalSpacing.horizontal;
    const verticalChange = current.finalSpacing.vertical - previous.finalSpacing.vertical;
    
    if (Math.abs(horizontalChange) > 1 || Math.abs(verticalChange) > 1) {
      console.log(`  间距变化: 水平${horizontalChange > 0 ? '+' : ''}${horizontalChange.toFixed(1)}, 垂直${verticalChange > 0 ? '+' : ''}${verticalChange.toFixed(1)}`);
      
      // 检查间距变化是否合理
      this.analyzeSpacingChange(current, previous, horizontalChange, verticalChange);
    }
  }

  /**
   * 检查间距是否应该保持一致
   */
  private shouldSpacingBeConsistent(current: OrientationDebugInfo, previous: OrientationDebugInfo): boolean {
    const isPortraitToLandscape = (current.orientationType === '竖屏' && previous.orientationType === '横屏') ||
                                 (current.orientationType === '横屏' && previous.orientationType === '竖屏');
    
    const spacingDiff = Math.abs(current.spacingScale - previous.spacingScale);
    
    // 如果是竖屏到横屏的切换，且竖屏spacingScale为1.25左右，这是预期的
    if (isPortraitToLandscape) {
      const portraitScale = current.orientationType === '竖屏' ? current.spacingScale : previous.spacingScale;
      const landscapeScale = current.orientationType === '横屏' ? current.spacingScale : previous.spacingScale;
      
      // 竖屏使用1.25，横屏使用1.0是预期的配置
      if (Math.abs(portraitScale - 1.25) < 0.1 && Math.abs(landscapeScale - 1.0) < 0.1) {
        return false; // 这是正常的配置，不需要警告
      }
    }
    
    return isPortraitToLandscape && spacingDiff > 0.5; // 只有差异过大时才警告
  }

  /**
   * 分析间距变化的合理性
   */
  private analyzeSpacingChange(
    current: OrientationDebugInfo, 
    previous: OrientationDebugInfo, 
    horizontalChange: number, 
    verticalChange: number
  ): void {
    // 计算变化百分比
    const horizontalChangePercent = (horizontalChange / previous.finalSpacing.horizontal) * 100;
    const verticalChangePercent = (verticalChange / previous.finalSpacing.vertical) * 100;
    
    console.log(`    变化百分比: 水平${horizontalChangePercent.toFixed(1)}%, 垂直${verticalChangePercent.toFixed(1)}%`);
    
    // 检查是否有异常的间距变化
    const significantChange = Math.abs(horizontalChangePercent) > 20 || Math.abs(verticalChangePercent) > 20;
    
    if (significantChange) {
      console.warn(`⚠️ 检测到显著的间距变化 (>20%)！`);
      console.warn(`   这可能导致用户体验不一致`);
      
      // 提供可能的原因分析
      if (current.spacingScale !== previous.spacingScale) {
        console.warn(`🔍 可能原因: spacingScale不一致 (${previous.spacingScale} -> ${current.spacingScale})`);
      }
      
      if (Math.abs(current.screenRatio - previous.screenRatio) > 0.5) {
        console.warn(`🔍 可能原因: 屏幕比例变化较大 (${previous.screenRatio.toFixed(3)} -> ${current.screenRatio.toFixed(3)})`);
      }
    } else {
      console.log(`✅ 间距变化在合理范围内`);
    }
  }

  /**
   * 获取调试历史记录
   */
  getDebugHistory(): OrientationDebugInfo[] {
    return [...this.debugHistory];
  }

  /**
   * 清空调试历史记录
   */
  clearHistory(): void {
    this.debugHistory = [];
    if (this.debugEnabled) {
      console.log('[OrientationDebugger] 调试历史已清空');
    }
  }

  /**
   * 打印完整的调试报告
   */
  printDebugReport(): void {
    if (!this.debugEnabled) {
      console.log('[OrientationDebugger] 调试未启用，请先调用setDebugEnabled(true)');
      return;
    }

    console.log('=== 方向变化调试报告 ===');
    
    if (this.debugHistory.length === 0) {
      console.log('暂无调试数据');
      return;
    }
    
    console.log(`历史记录数量: ${this.debugHistory.length}`);
    this.debugHistory.forEach((info, index) => {
      const time = new Date(info.timestamp).toLocaleTimeString();
      console.log(`${index + 1}. [${time}] ${info.orientationType} ${info.screenSize.width}x${info.screenSize.height} 缩放:${info.spacingScale}`);
    });
    
    // 分析间距一致性
    this.analyzeSpacingConsistency();
  }

  /**
   * 分析间距一致性
   */
  private analyzeSpacingConsistency(): void {
    if (this.debugHistory.length < 2) return;
    
    console.log('\n=== 间距一致性分析 ===');
    
    const portraitRecords = this.debugHistory.filter(info => info.orientationType === '竖屏');
    const landscapeRecords = this.debugHistory.filter(info => info.orientationType === '横屏');
    
    console.log(`竖屏记录: ${portraitRecords.length}条, 横屏记录: ${landscapeRecords.length}条`);
    
    if (portraitRecords.length > 0 && landscapeRecords.length > 0) {
      const portraitSpacingScale = portraitRecords[portraitRecords.length - 1].spacingScale;
      const landscapeSpacingScale = landscapeRecords[landscapeRecords.length - 1].spacingScale;
      
      console.log(`最新间距缩放: 竖屏=${portraitSpacingScale}, 横屏=${landscapeSpacingScale}`);
      
      if (portraitSpacingScale !== landscapeSpacingScale) {
        // 检查是否是预期的配置（竖屏1.25，横屏1.0）
        const isExpectedConfig = Math.abs(portraitSpacingScale - 1.25) < 0.1 && Math.abs(landscapeSpacingScale - 1.0) < 0.1;
        
        if (isExpectedConfig) {
          console.log('✅ 间距缩放配置符合预期（竖屏1.25，横屏1.0）');
        } else {
          console.warn(`⚠️ 间距缩放不一致！这可能导致横竖屏切换时间距变化`);
          console.warn(`💡 建议: 竖屏spacingScale设置为1.25，横屏设置为1.0（当前配置：竖屏=${portraitSpacingScale}, 横屏=${landscapeSpacingScale}）`);
        }
      } else {
        console.log('✅ 间距缩放保持一致');
      }
    }
  }

  /**
   * 创建调试信息对象
   */
  createDebugInfo(
    screenSize: { width: number; height: number },
    orientationType: string,
    spacingScale: number,
    finalSpacing: { horizontal: number; vertical: number },
    extraData?: Record<string, any>
  ): OrientationDebugInfo {
    return {
      screenSize,
      screenRatio: screenSize.width / screenSize.height,
      orientationType,
      breakpointIndex: this.calculateBreakpointIndex(screenSize.width / screenSize.height),
      spacingScale,
      finalSpacing,
      timestamp: Date.now(),
      extraData
    };
  }

  /**
   * 计算断点索引
   */
  private calculateBreakpointIndex(ratio: number): number {
    if (ratio < 0.8) return 0; // 竖屏
    if (ratio < 1.2) return 1; // 接近正方形
    return 2; // 横屏
  }

  /**
   * 设置最大历史记录大小
   */
  setMaxHistorySize(size: number): void {
    this.maxHistorySize = Math.max(1, size);
    
    // 如果当前历史记录超过新的大小限制，裁剪它
    while (this.debugHistory.length > this.maxHistorySize) {
      this.debugHistory.shift();
    }
  }

  /**
   * 获取最大历史记录大小
   */
  getMaxHistorySize(): number {
    return this.maxHistorySize;
  }
}

/**
 * 获取方向变化调试器实例
 */
export function getOrientationDebugger(): OrientationChangeDebugger {
  return OrientationChangeDebugger.getInstance();
}

/**
 * 设置全局调试命令
 * 在浏览器控制台中可以使用这些命令进行调试
 */
export function setupGlobalDebugCommands(): void {
  // 确保在浏览器环境中
  if (typeof window !== 'undefined') {
    // 添加全局调试命令
    (window as any).orientationDebug = {
      // 启用调试
      enable: () => {
        getOrientationDebugger().setDebugEnabled(true);
        console.log('方向变化调试已启用');
      },
      
      // 禁用调试
      disable: () => {
        getOrientationDebugger().setDebugEnabled(false);
        console.log('方向变化调试已禁用');
      },
      
      // 打印间距诊断报告
      printReport: () => {
        getOrientationDebugger().printDebugReport();
      },
      
      // 清空调试历史
      clearHistory: () => {
        getOrientationDebugger().clearHistory();
      },
      
      // 获取调试历史
      getHistory: () => {
        const history = getOrientationDebugger().getDebugHistory();
        console.table(history);
        return history;
      },
      
      // 模拟方向变化（用于测试）
      simulate: (width: number, height: number) => {
        const orientationDebugger = getOrientationDebugger();
        const ratio = width / height;
        const orientationType = ratio < 0.8 ? '竖屏' : ratio < 1.2 ? '接近正方形' : '横屏';
        
        const debugInfo = orientationDebugger.createDebugInfo(
          { width, height },
          orientationType,
          orientationType === '竖屏' ? 1.25 : 1.0, // 模拟预期的缩放值
          { horizontal: 225 * 0.5, vertical: 77 * 0.5 } // 模拟间距值
        );
        
        orientationDebugger.recordOrientationChange(debugInfo);
      },
      
      // 帮助信息
      help: () => {
        console.log(`
🎮 方向变化调试命令帮助:

orientationDebug.enable()                    - 启用调试模式
orientationDebug.disable()                   - 禁用调试模式
orientationDebug.printReport()               - 打印完整的调试报告
orientationDebug.clearHistory()              - 清空调试历史记录
orientationDebug.getHistory()                - 获取调试历史记录
orientationDebug.simulate(width, height)     - 模拟方向变化
orientationDebug.help()                      - 显示此帮助信息

使用示例:
orientationDebug.enable()
orientationDebug.simulate(1080, 1920)  // 模拟竖屏
orientationDebug.simulate(1920, 1080)  // 模拟横屏
orientationDebug.printReport()
        `);
      }
    };
    
    console.log('[OrientationDebugger] 全局调试命令已设置，输入 orientationDebug.help() 查看帮助');
  }
}