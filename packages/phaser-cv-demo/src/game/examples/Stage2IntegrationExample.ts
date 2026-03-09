/**
 * 阶段二集成功能示例
 * 
 * 展示阶段二新集成的核心功能模块：
 * 1. 响应式背景管理系统
 * 2. 音频管理系统
 * 3. 视口管理系统
 * 4. 交互反馈系统
 * 5. 方向变化调试器
 * 
 * @author 开发者
 * @date 2025-06-23
 */

import { Scene } from 'phaser';
import { SpineManager } from '../../utils/SpineManager';
import { DepthManager } from '../utils/DepthManager';
import { GameAreaManager, ScreenOrientation } from '../utils/GameAreaManager';
import { ResponsiveBackgroundManager } from '../utils/ResponsiveBackgroundManager';
import { InteractionFeedback } from '../utils/InteractionFeedback';
import { getOrientationDebugger } from '../utils/OrientationChangeDebugger';
import { getAudioManager } from '../../utils/AudioManager';
import { getViewportManager } from '../../utils/ViewportManager';
import { DEFAULT_AUDIO_CONFIG } from '../config/audio-config';
import { EventBus } from '../EventBus';

/**
 * 阶段二集成示例场景
 */
export class Stage2IntegrationExample extends Scene {
  private spineManager!: SpineManager;
  private depthManager!: DepthManager;
  private gameAreaManager!: GameAreaManager;
  private responsiveBackgroundManager!: ResponsiveBackgroundManager;
  private interactionFeedback!: InteractionFeedback;
  private exampleGameObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: 'Stage2IntegrationExample' });
  }

  /**
   * 预加载资源
   */
  preload(): void {
    console.log('[Stage2IntegrationExample] 开始预加载资源');
    
    // 创建一个简单的背景纹理用于演示
    this.load.image('demo-background', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
  }

  /**
   * 创建场景
   */
  create(): void {
    console.log('[Stage2IntegrationExample] 创建阶段二集成示例场景');
    
    // 1. 初始化管理器
    this.initializeManagers();
    
    // 2. 创建示例内容
    this.createExampleContent();
    
    // 3. 设置事件监听
    this.setupEventListeners();
    
    // 4. 演示各种功能
    this.demonstrateFeatures();
  }

  /**
   * 初始化各种管理器
   */
  private initializeManagers(): void {
    console.log('[Stage2IntegrationExample] 初始化阶段二管理器');
    
    // 初始化基础管理器
    this.spineManager = SpineManager.getInstance(this);
    this.depthManager = new DepthManager();
    this.gameAreaManager = new GameAreaManager(this);
    this.gameAreaManager.initialize();
    
    // 初始化响应式背景管理器
    this.responsiveBackgroundManager = new ResponsiveBackgroundManager(this);
    
    // 初始化交互反馈系统
    this.interactionFeedback = new InteractionFeedback(this);
    
    // 初始化音频管理器
    const audioManager = getAudioManager();
    audioManager.initializeAudio(DEFAULT_AUDIO_CONFIG).catch(error => {
      console.error('[Stage2IntegrationExample] 音频初始化失败:', error);
    });
    
    // 初始化视口管理器
    const viewportManager = getViewportManager();
    viewportManager.initialize();
    
    // 启用方向变化调试器
    const orientationDebugger = getOrientationDebugger();
    orientationDebugger.setDebugEnabled(true);
    
    console.log('[Stage2IntegrationExample] 所有阶段二管理器初始化完成');
  }

  /**
   * 创建示例内容
   */
  private createExampleContent(): void {
    console.log('[Stage2IntegrationExample] 创建示例内容');
    
    // 创建响应式背景
    try {
      this.responsiveBackgroundManager.createBackground('demo-background');
      console.log('[Stage2IntegrationExample] 响应式背景创建成功');
    } catch (error) {
      console.warn('[Stage2IntegrationExample] 背景创建失败，使用默认背景:', error);
      // 创建默认背景
      const background = this.add.rectangle(
        this.cameras.main.width / 2,
        this.cameras.main.height / 2,
        this.cameras.main.width,
        this.cameras.main.height,
        0x2c3e50
      );
      this.exampleGameObjects.push(background);
      const backgroundDepth = DepthManager.getBackgroundDepth();
      background.setDepth(backgroundDepth);
    }
    
    // 创建示例文本
    const titleText = this.add.text(
      this.cameras.main.width / 2,
      100,
      '阶段二集成功能示例',
      {
        fontSize: '32px',
        color: '#ffffff',
        fontStyle: 'bold'
      }
    );
    titleText.setOrigin(0.5);
    this.exampleGameObjects.push(titleText);
    
    // 设置文本深度
    const uiDepth = DepthManager.getUIDepth();
    titleText.setDepth(uiDepth);
    
    // 创建功能说明文本
    const infoText = this.add.text(
      this.cameras.main.width / 2,
      200,
      '新集成功能：\n• 响应式背景管理\n• 音频系统管理\n• 视口状态管理\n• 交互反馈系统\n• 方向变化调试器\n• 构建优化工具',
      {
        fontSize: '18px',
        color: '#ecf0f1',
        align: 'center',
        lineSpacing: 10
      }
    );
    infoText.setOrigin(0.5);
    this.exampleGameObjects.push(infoText);
    infoText.setDepth(uiDepth);
    
    // 创建交互示例按钮
    this.createInteractionExamples();
    
    // 将游戏对象添加到游戏区域管理器
    this.gameAreaManager.addManagedObjects(this.exampleGameObjects);
    
    // 创建状态显示
    this.createStatusDisplay();
  }

  /**
   * 创建交互示例
   */
  private createInteractionExamples(): void {
    const uiDepth = DepthManager.getUIDepth();
    
    // 创建点击反馈示例按钮
    const clickButton = this.add.rectangle(200, 400, 150, 50, 0x3498db);
    const clickButtonText = this.add.text(200, 400, '点击反馈', {
      fontSize: '16px',
      color: '#ffffff'
    });
    clickButtonText.setOrigin(0.5);
    
    clickButton.setInteractive();
    clickButton.on('pointerdown', () => {
      // 发送点击反馈事件
      EventBus.emit('interaction:click-feedback', {
        position: { x: 200, y: 400 }
      });
    });
    
    clickButton.setDepth(uiDepth);
    clickButtonText.setDepth(uiDepth + 1);
    this.exampleGameObjects.push(clickButton, clickButtonText);
    
    // 创建成功操作示例按钮
    const successButton = this.add.rectangle(400, 400, 150, 50, 0x2ecc71);
    const successButtonText = this.add.text(400, 400, '成功反馈', {
      fontSize: '16px',
      color: '#ffffff'
    });
    successButtonText.setOrigin(0.5);
    
    successButton.setInteractive();
    successButton.on('pointerdown', () => {
      // 发送成功操作事件
      EventBus.emit('interaction:success-operation', {
        position: { x: 400, y: 400 }
      });
    });
    
    successButton.setDepth(uiDepth);
    successButtonText.setDepth(uiDepth + 1);
    this.exampleGameObjects.push(successButton, successButtonText);
    
    // 创建音频控制按钮
    const audioButton = this.add.rectangle(600, 400, 150, 50, 0xe74c3c);
    const audioButtonText = this.add.text(600, 400, '音频控制', {
      fontSize: '16px',
      color: '#ffffff'
    });
    audioButtonText.setOrigin(0.5);
    
    audioButton.setInteractive();
    audioButton.on('pointerdown', () => {
      // 切换音频状态
      EventBus.emit('audio:toggle');
      
      // 显示点击反馈
      EventBus.emit('interaction:click-feedback', {
        position: { x: 600, y: 400 }
      });
    });
    
    audioButton.setDepth(uiDepth);
    audioButtonText.setDepth(uiDepth + 1);
    this.exampleGameObjects.push(audioButton, audioButtonText);

    // 创建引导提示按钮
    const guideButton = this.add.rectangle(800, 400, 150, 50, 0xf39c12);
    const guideButtonText = this.add.text(800, 400, '引导提示', {
      fontSize: '16px',
      color: '#ffffff'
    });
    guideButtonText.setOrigin(0.5);
    
    guideButton.setInteractive();
    guideButton.on('pointerdown', () => {
      // 显示引导反馈
      this.interactionFeedback.showGuideFeedback({ x: 800, y: 400 });
      
      // 3秒后隐藏
      this.time.delayedCall(3000, () => {
        this.interactionFeedback.hideGuideFeedback();
      });
    });
    
    guideButton.setDepth(uiDepth);
    guideButtonText.setDepth(uiDepth + 1);
    this.exampleGameObjects.push(guideButton, guideButtonText);
  }

  /**
   * 创建状态显示
   */
  private createStatusDisplay(): void {
    const uiDepth = DepthManager.getUIDepth();
    
    // 创建状态信息文本
    const statusText = this.add.text(
      50,
      500,
      '系统状态：\n• 响应式背景：已启用\n• 音频系统：已初始化\n• 视口管理：已启用\n• 交互反馈：已启用\n• 调试器：已启用',
      {
        fontSize: '14px',
        color: '#95a5a6',
        lineSpacing: 5
      }
    );
    statusText.setDepth(uiDepth);
    this.exampleGameObjects.push(statusText);
    
    // 创建控制台提示
    const consoleText = this.add.text(
      50,
      this.cameras.main.height - 100,
      '控制台命令：\n• orientationDebug.help() - 查看调试命令\n• orientationDebug.enable() - 启用调试\n• orientationDebug.printReport() - 打印报告',
      {
        fontSize: '12px',
        color: '#7f8c8d',
        lineSpacing: 3
      }
    );
    consoleText.setDepth(uiDepth);
    this.exampleGameObjects.push(consoleText);
  }

  /**
   * 设置事件监听
   */
  private setupEventListeners(): void {
    console.log('[Stage2IntegrationExample] 设置事件监听');
    
    // 监听屏幕方向变化
    EventBus.on('screen:orientation-changed', (data: { orientation: ScreenOrientation }) => {
      console.log('[Stage2IntegrationExample] 屏幕方向变化:', data.orientation);
    });
    
    // 监听游戏区域变化
    EventBus.on('game-area:position-changed', (data: any) => {
      console.log('[Stage2IntegrationExample] 游戏区域位置变化:', data);
    });
    
    // 监听响应式背景变化
    EventBus.on('responsive:background-changed', (data: any) => {
      console.log('[Stage2IntegrationExample] 响应式背景变化:', data);
    });
    
    // 监听音频状态变化
    EventBus.on('audio:status-changed', (data: { enabled: boolean }) => {
      console.log('[Stage2IntegrationExample] 音频状态变化:', data.enabled ? '启用' : '禁用');
    });
    
    // 监听视口状态变化
    EventBus.on('viewport:visibility-changed', (data: any) => {
      console.log('[Stage2IntegrationExample] 视口可见性变化:', data);
    });
  }

  /**
   * 演示各种功能
   */
  private demonstrateFeatures(): void {
    // 演示音频功能
    this.demonstrateAudioFeatures();
    
    // 演示响应式功能
    this.demonstrateResponsiveFeatures();
    
    // 演示视口功能
    this.demonstrateViewportFeatures();
    
    // 演示调试功能
    this.demonstrateDebugFeatures();
  }

  /**
   * 演示音频功能
   */
  private demonstrateAudioFeatures(): void {
    console.log('[Stage2IntegrationExample] 演示音频功能');
    
    // 获取音频状态
    const audioManager = getAudioManager();
    const audioStatus = audioManager.getAudioStatus();
    
    console.log('[Stage2IntegrationExample] 音频状态:', audioStatus);
  }

  /**
   * 演示响应式功能
   */
  private demonstrateResponsiveFeatures(): void {
    console.log('[Stage2IntegrationExample] 演示响应式功能');
    
    // 获取当前画布信息
    const canvasInfo = this.responsiveBackgroundManager.getCurrentCanvasSize();
    console.log('[Stage2IntegrationExample] 当前画布信息:', canvasInfo);
    
    // 验证画布尺寸
    const validation = this.responsiveBackgroundManager.validateCanvasSize();
    console.log('[Stage2IntegrationExample] 画布尺寸验证:', validation);
    
    // 获取背景信息
    const backgroundInfo = this.responsiveBackgroundManager.getCurrentBackgroundInfo();
    console.log('[Stage2IntegrationExample] 背景信息:', backgroundInfo);
  }

  /**
   * 演示视口功能
   */
  private demonstrateViewportFeatures(): void {
    console.log('[Stage2IntegrationExample] 演示视口功能');
    
    // 获取视口状态
    const viewportManager = getViewportManager();
    const viewportState = viewportManager.getCurrentState();
    
    console.log('[Stage2IntegrationExample] 视口状态:', viewportState);
  }

  /**
   * 演示调试功能
   */
  private demonstrateDebugFeatures(): void {
    console.log('[Stage2IntegrationExample] 演示调试功能');
    
    // 获取方向调试器
    const orientationDebugger = getOrientationDebugger();
    
    // 模拟一些调试数据
    const debugInfo = orientationDebugger.createDebugInfo(
      { width: this.cameras.main.width, height: this.cameras.main.height },
      this.cameras.main.width > this.cameras.main.height ? '横屏' : '竖屏',
      1.0,
      { horizontal: 200, vertical: 100 }
    );
    
    orientationDebugger.recordOrientationChange(debugInfo);
    
    console.log('[Stage2IntegrationExample] 调试信息已记录');
  }

  /**
   * 场景更新
   */
  update(): void {
    // 这里可以添加每帧更新的逻辑
  }

  /**
   * 场景销毁
   */
  destroy(): void {
    console.log('[Stage2IntegrationExample] 销毁阶段二集成示例场景');
    
    // 清理管理器
    if (this.gameAreaManager) {
      this.gameAreaManager.destroy();
    }
    
    if (this.spineManager) {
      SpineManager.destroy();
    }
    
    if (this.responsiveBackgroundManager) {
      this.responsiveBackgroundManager.destroy();
    }
    
    if (this.interactionFeedback) {
      this.interactionFeedback.destroy();
    }
    
    // 移除事件监听
    EventBus.off('screen:orientation-changed');
    EventBus.off('game-area:position-changed');
    EventBus.off('responsive:background-changed');
    EventBus.off('audio:status-changed');
    EventBus.off('viewport:visibility-changed');
    
    // 清理游戏对象
    this.exampleGameObjects = [];
  }
}