/**
 * 集成功能使用示例
 * 
 * 展示如何使用从nutssort-playable迁移过来的核心功能：
 * 1. Spine动画系统
 * 2. 配置嵌入系统
 * 3. 深度管理系统
 * 4. 游戏区域管理系统
 * 5. 事件总线系统
 * 
 * @author 开发者
 * @date 2025-06-23
 */

import { Scene } from 'phaser';
import { SpineManager, SpineObjectConfig } from '../../utils/SpineManager';
import { EXAMPLE_RESOURCE_LOADER } from '../assets/spine-resources';
import { DepthManager } from '../utils/DepthManager';
import { GameAreaManager, DEFAULT_GAME_AREA_POSITION, ScreenOrientation } from '../utils/GameAreaManager';
import { EventBus, EventBusUtils, EVENT_NAMES } from '../EventBus';
import { getOutputConfigAsync, getOutputConfigValue } from '../../utils/outputConfigLoader';

/**
 * 集成示例场景
 */
export class IntegrationExampleScene extends Scene {
  private spineManager?: SpineManager;
  private gameAreaManager?: GameAreaManager;
  private exampleObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: 'IntegrationExample' });
  }

  /**
   * 预加载资源
   */
  preload(): void {
    console.log('[IntegrationExample] 开始预加载资源');
    
    // 这里可以加载实际的Spine资源
    // this.load.image('example-texture', 'assets/spine/example.png');
    // this.load.json('example-skeleton', 'assets/spine/example.json');
    // this.load.text('example-atlas', 'assets/spine/example.atlas');
  }

  /**
   * 创建场景
   */
  async create(): Promise<void> {
    console.log('[IntegrationExample] 开始创建场景');

    // 1. 初始化配置系统
    await this.initializeConfigSystem();

    // 2. 初始化Spine动画系统
    await this.initializeSpineSystem();

    // 3. 初始化深度管理系统
    this.initializeDepthSystem();

    // 4. 初始化游戏区域管理系统
    this.initializeGameAreaSystem();

    // 5. 初始化事件总线系统
    this.initializeEventBusSystem();

    // 6. 创建示例对象
    this.createExampleObjects();

    console.log('[IntegrationExample] 场景创建完成');
  }

  /**
   * 初始化配置系统
   */
  private async initializeConfigSystem(): Promise<void> {
    console.log('[IntegrationExample] 初始化配置系统');

    try {
      // 异步加载配置
      const config = await getOutputConfigAsync();
      console.log('[IntegrationExample] 配置加载成功:', config);

      // 获取特定配置值
      const gameTitle = getOutputConfigValue('game.title', 'Default Game');
      const enableSpine = getOutputConfigValue('spine.enableSpineAnimations', true);
      const enableDepth = getOutputConfigValue('features.enableDepthManagement', true);

      console.log(`[IntegrationExample] 游戏标题: ${gameTitle}`);
      console.log(`[IntegrationExample] Spine动画: ${enableSpine ? '启用' : '禁用'}`);
      console.log(`[IntegrationExample] 深度管理: ${enableDepth ? '启用' : '禁用'}`);

    } catch (error) {
      console.warn('[IntegrationExample] 配置加载失败:', error);
    }
  }

  /**
   * 初始化Spine动画系统
   */
  private async initializeSpineSystem(): Promise<void> {
    console.log('[IntegrationExample] 初始化Spine动画系统');

    try {
      // 获取SpineManager实例
      this.spineManager = SpineManager.getInstance(this, true);

      // 验证资源加载器
      if (EXAMPLE_RESOURCE_LOADER.validate()) {
        console.log('[IntegrationExample] Spine资源验证通过');

        // 加载Spine资源
        const success = await this.spineManager.loadSpineResources(
          EXAMPLE_RESOURCE_LOADER.config,
          EXAMPLE_RESOURCE_LOADER.skeletonData,
          EXAMPLE_RESOURCE_LOADER.atlasText,
          EXAMPLE_RESOURCE_LOADER.texturesMap
        );

        if (success) {
          console.log('[IntegrationExample] Spine资源加载成功');
        } else {
          console.warn('[IntegrationExample] Spine资源加载失败');
        }
      } else {
        console.warn('[IntegrationExample] Spine资源验证失败');
      }

    } catch (error) {
      console.error('[IntegrationExample] Spine系统初始化失败:', error);
    }
  }

  /**
   * 初始化深度管理系统
   */
  private initializeDepthSystem(): void {
    console.log('[IntegrationExample] 初始化深度管理系统');

    // 获取深度映射表
    const depthMap = DepthManager.getDepthMap(2);
    console.log('[IntegrationExample] 深度映射表:', depthMap);

    // 调试深度计算
    DepthManager.debugDepthCalculation(0, 1, true);
    DepthManager.debugDepthCalculation(1, 2, false);
  }

  /**
   * 初始化游戏区域管理系统
   */
  private initializeGameAreaSystem(): void {
    console.log('[IntegrationExample] 初始化游戏区域管理系统');

    // 创建游戏区域管理器
    this.gameAreaManager = new GameAreaManager(this, DEFAULT_GAME_AREA_POSITION);

    // 初始化管理器
    this.gameAreaManager.initialize();

    // 获取调试信息
    const debugInfo = this.gameAreaManager.getDebugInfo();
    console.log('[IntegrationExample] 游戏区域管理器调试信息:', debugInfo);
  }

  /**
   * 初始化事件总线系统
   */
  private initializeEventBusSystem(): void {
    console.log('[IntegrationExample] 初始化事件总线系统');

    // 监听游戏状态变化事件
    EventBus.on(EVENT_NAMES.GAME_STATE_CHANGE, (state: string) => {
      console.log(`[IntegrationExample] 游戏状态变化: ${state}`);
    });

    // 监听屏幕方向变化事件
    EventBus.on(EVENT_NAMES.ORIENTATION_CHANGE, (orientation: string) => {
      console.log(`[IntegrationExample] 屏幕方向变化: ${orientation}`);
    });

    // 监听分数更新事件
    EventBus.on(EVENT_NAMES.SCORE_UPDATE, (score: number) => {
      console.log(`[IntegrationExample] 分数更新: ${score}`);
    });

    // 发送初始化完成事件
    EventBusUtils.emitGameStateChange('initialized');
  }

  /**
   * 创建示例对象
   */
  private createExampleObjects(): void {
    console.log('[IntegrationExample] 创建示例对象');

    // 创建背景
    const background = this.add.rectangle(
      this.cameras.main.centerX,
      this.cameras.main.centerY,
      this.cameras.main.width,
      this.cameras.main.height,
      0x2c3e50
    );
    background.setDepth(DepthManager.getBackgroundDepth());
    this.exampleObjects.push(background);

    // 创建示例游戏对象（使用深度管理）
    for (let layer = 0; layer < 3; layer++) {
      const rect = this.add.rectangle(
        this.cameras.main.centerX + (layer - 1) * 100,
        this.cameras.main.centerY,
        80,
        80,
        0x3498db + layer * 0x111111
      );
      
      // 设置深度
      rect.setDepth(DepthManager.getObjectDepth(layer, true));
      
      // 添加到游戏区域管理器
      this.gameAreaManager?.addManagedObject(rect);
      
      this.exampleObjects.push(rect);
    }

    // 创建Spine对象示例（如果资源已加载）
    if (this.spineManager?.isResourceReady()) {
      this.createSpineExample();
    }

    // 创建UI元素
    this.createUIElements();
  }

  /**
   * 创建Spine动画示例
   */
  private createSpineExample(): void {
    if (!this.spineManager) return;

    console.log('[IntegrationExample] 创建Spine动画示例');

    try {
      const spineConfig: SpineObjectConfig = {
        x: this.cameras.main.centerX,
        y: this.cameras.main.centerY - 100,
        key: 'example_spine',
        animation: 'idle',
        loop: true,
        scale: 1.0,
        depth: DepthManager.getSpineDepth(0)
      };

      const spineObject = this.spineManager.createSpineObject(spineConfig);
      
      if (spineObject) {
        console.log('[IntegrationExample] Spine对象创建成功');
        
        // 获取动画列表
        const animations = this.spineManager.getAnimationList(spineObject);
        console.log('[IntegrationExample] 可用动画:', animations);
        
        // 添加到游戏区域管理器
        this.gameAreaManager?.addManagedObject(spineObject);
        this.exampleObjects.push(spineObject);
      } else {
        console.warn('[IntegrationExample] Spine对象创建失败');
      }

    } catch (error) {
      console.error('[IntegrationExample] Spine示例创建失败:', error);
    }
  }

  /**
   * 创建UI元素
   */
  private createUIElements(): void {
    console.log('[IntegrationExample] 创建UI元素');

    // 创建标题文本
    const titleText = this.add.text(
      this.cameras.main.centerX,
      50,
      'Integration Example',
      {
        fontSize: '32px',
        color: '#ffffff',
        fontFamily: 'Arial'
      }
    );
    titleText.setOrigin(0.5);
    titleText.setDepth(DepthManager.getUIDepth());

    // 添加到游戏区域管理器（UI元素）
    this.gameAreaManager?.addManagedUIObject(titleText, {
      anchor: 'center',
      offsetX: 0,
      offsetY: -200,
      responsive: true
    });

    // 创建信息文本
    const infoText = this.add.text(
      20,
      this.cameras.main.height - 100,
      'Features:\n• Spine Animation System\n• Config Embedding\n• Depth Management\n• Game Area Management\n• Event Bus System',
      {
        fontSize: '16px',
        color: '#ecf0f1',
        fontFamily: 'Arial'
      }
    );
    infoText.setDepth(DepthManager.getUIDepth());

    this.exampleObjects.push(titleText, infoText);
  }

  /**
   * 更新循环
   */
  update(): void {
    // 这里可以添加更新逻辑
  }

  /**
   * 销毁场景时的清理工作
   */
  shutdown(): void {
    console.log('[IntegrationExample] 销毁场景');

    // 清理游戏区域管理器
    this.gameAreaManager?.destroy();

    // 清理事件监听器
    EventBus.removeAllListeners();

    // 销毁Spine管理器
    SpineManager.destroy();

    // 清理示例对象
    this.exampleObjects.forEach(obj => {
      if (obj && obj.destroy) {
        obj.destroy();
      }
    });
    this.exampleObjects = [];
  }
}

/**
 * 使用示例函数
 * 展示如何在其他场景中使用这些功能
 */
export class IntegrationUsageExample {
  /**
   * Spine动画使用示例
   */
  static async useSpineAnimation(scene: Scene): Promise<void> {
    // 1. 获取SpineManager实例
    const spineManager = SpineManager.getInstance(scene);

    // 2. 加载资源（在实际项目中，需要提供真实的资源）
    const success = await spineManager.loadSpineResources(
      EXAMPLE_RESOURCE_LOADER.config,
      EXAMPLE_RESOURCE_LOADER.skeletonData,
      EXAMPLE_RESOURCE_LOADER.atlasText,
      EXAMPLE_RESOURCE_LOADER.texturesMap
    );

    if (success) {
      // 3. 创建Spine对象
      const spineObject = spineManager.createSpineObject({
        x: 400,
        y: 300,
        key: 'example',
        animation: 'idle',
        loop: true,
        scale: 1.0
      });

      if (spineObject) {
        // 4. 播放动画
        spineManager.playAnimation(spineObject, 'walk', true);
        
        // 5. 获取动画列表
        const animations = spineManager.getAnimationList(spineObject);
        console.log('可用动画:', animations);
      }
    }
  }

  /**
   * 深度管理使用示例
   */
  static useDepthManagement(): void {
    // 1. 获取不同层级的深度值
    const layer0Depth = DepthManager.getObjectDepth(0, true);
    const layer1Depth = DepthManager.getObjectDepth(1, true);
    const layer2Depth = DepthManager.getObjectDepth(2, true);

    console.log('层级深度:', { layer0Depth, layer1Depth, layer2Depth });

    // 2. 获取浮动对象深度
    const floatingDepth = DepthManager.getFloatingObjectDepth(true, 0);
    console.log('浮动对象深度:', floatingDepth);

    // 3. 验证深度值
    const isValid = DepthManager.validateDepth(layer0Depth, 'example-object');
    console.log('深度值有效性:', isValid);
  }

  /**
   * 游戏区域管理使用示例
   */
  static useGameAreaManagement(scene: Scene): GameAreaManager {
    // 1. 创建游戏区域管理器
    const gameAreaManager = new GameAreaManager(scene);

    // 2. 初始化
    gameAreaManager.initialize();

    // 3. 添加需要管理的对象
    const gameObject = scene.add.rectangle(100, 100, 50, 50, 0xff0000);
    gameAreaManager.addManagedObject(gameObject);

    // 4. 添加UI元素
    const uiElement = scene.add.text(10, 10, 'UI Element', { fontSize: '16px' });
    gameAreaManager.addManagedUIObject(uiElement, {
      anchor: 'top-left',
      offsetX: 10,
      offsetY: 10,
      responsive: true
    });

    return gameAreaManager;
  }

  /**
   * 事件总线使用示例
   */
  static useEventBus(): void {
    // 1. 监听事件
    EventBus.on(EVENT_NAMES.GAME_STATE_CHANGE, (state: string) => {
      console.log('游戏状态变化:', state);
    });

    // 2. 发送事件
    EventBusUtils.emitGameStateChange('playing');
    EventBusUtils.emitScoreUpdate(1000);
    EventBusUtils.emitPlaySound('coin-collect', 0.8);

    // 3. 获取监听器数量
    const listenerCount = EventBusUtils.getListenerCount(EVENT_NAMES.GAME_STATE_CHANGE);
    console.log('监听器数量:', listenerCount);
  }

  /**
   * 配置系统使用示例
   */
  static async useConfigSystem(): Promise<void> {
    // 1. 异步加载配置
    const config = await getOutputConfigAsync();
    console.log('完整配置:', config);

    // 2. 获取特定配置值
    const gameTitle = getOutputConfigValue('game.title', 'Default Title');
    const soundVolume = getOutputConfigValue('audio.soundVolume', 1.0);
    const primaryColor = getOutputConfigValue('ui.theme.primaryColor', '#000000');

    console.log('配置值:', { gameTitle, soundVolume, primaryColor });
  }
}