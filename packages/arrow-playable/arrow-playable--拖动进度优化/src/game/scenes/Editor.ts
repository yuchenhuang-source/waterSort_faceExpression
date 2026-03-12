// 编辑器场景 - 允许用户编辑网格和箭头

import { Scene } from 'phaser';
import { LevelConfig, LevelData, ArrowData, ArrowRuntime } from '../types/Board';
import { Board } from '../components/Board';
import { Arrow } from '../components/Arrow';
import { createArrowRuntime, rowColToIndex, indexToRowCol } from '../utils/BoardUtils';
import { EventBus, EVENT_NAMES } from '../EventBus';
import { getArrowConfigSync, hexToPhaserColor } from '../config/arrow-config';
import { getLevelDataAsync } from '../config/level-config';
import { getOutputConfigAsync } from '../../utils/outputConfigLoader';

export class Editor extends Scene {
  private board: Board | null = null;
  private editorArrows: Map<string, ArrowRuntime> = new Map();
  private arrowComponents: Map<string, Arrow> = new Map();
  
  // 编辑器状态
  private gridWidth: number = 10;
  private gridHeight: number = 10;
  private cellSizeX: number = 50;
  private cellSizeY: number = 50;
  private offsetX: number = 0;
  private offsetY: number = 0;
  
  // 当前选中的箭头
  private selectedArrowId: string | null = null;
  
  // 拖拽状态
  private isDragging: boolean = false;
  private dragTarget: 'head' | 'body' | null = null;
  private dragArrowId: string | null = null;
  private dragStartPoint: { x: number; y: number } | null = null;
  private dragStartGridIndex: number | null = null; // 拖拽开始时的最后一个网格索引
  private lastDragGridPos: { col: number; row: number } | null = null; // 上一次拖拽的网格位置
  
  // 当前颜色（在 create() 中从 output-config 的 arrow.defaultColor 覆盖）
  private currentColor: number = 0xff0000;
  
  // 网格图形
  private gridGraphics: Phaser.GameObjects.Graphics | null = null;
  
  // 相机缩放和平移
  private cameraZoom: number = 1;
  private minZoom: number = 0.1;
  private maxZoom: number = 10;
  private isPanning: boolean = false;
  private panStart: { x: number; y: number } | null = null;
  private isSceneShutdown: boolean = false;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasdKeys?: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  private boundKeyDownForArrowMove: (e: KeyboardEvent) => void = () => {};
  private panSpeed: number = 800;
  private miniMapUpdateElapsed: number = 0;
  private miniMapUpdateIntervalMs: number = 50;

  constructor() {
    super('Editor');
  }

  create() {
    this.isSceneShutdown = false;
    this.miniMapUpdateElapsed = 0;
    this.currentColor = hexToPhaserColor(getArrowConfigSync().defaultColor);
    this.events.once('shutdown', this.onShutdown, this);
    this.events.once('destroy', this.onShutdown, this);

    // 使用自适应尺寸，不固定竖屏
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.scale.setGameSize(width, height);
    this.cameras.main.setBackgroundColor('#f0f0f0');
    
    // 设置相机初始缩放
    this.cameras.main.setZoom(this.cameraZoom);
    
    // 监听窗口大小变化
    this.scale.on('resize', this.onResize, this);
    
    // 设置 EventBus 事件监听（必须在场景完全初始化后）
    this.setupEventListeners();
    
    // 异步加载当前配置
    this.loadCurrentConfigAsync().then(() => {
      // 配置加载完成后，计算网格偏移（居中）
      this.updateGridOffset();
      
      // 创建初始网格
      this.createGrid();
      
      // 发送初始状态给 React UI
      this.sendStateUpdate();
      this.emitMiniMapUpdate();
    }).catch((error) => {
      console.warn('配置加载失败，使用默认值:', error);
      // 即使配置加载失败，也使用默认值初始化
      this.updateGridOffset();
      this.createGrid();
      this.sendStateUpdate();
      this.emitMiniMapUpdate();
    });
    
    // 设置交互
    this.setupInteraction();
    
    // 设置缩放和平移
    this.setupCameraControls();
    this.setupKeyboardControls();
    
    // Ctrl+方向键 箭头平移（用 window 监听，确保能收到按键）
    this.boundKeyDownForArrowMove = this.onWindowKeyDownForArrowMove.bind(this);
    window.addEventListener('keydown', this.boundKeyDownForArrowMove);
    
    // 通知场景就绪
    EventBus.emit('current-scene-ready', this);
  }

  /**
   * 异步加载当前配置作为初始值
   */
  private async loadCurrentConfigAsync(): Promise<void> {
    try {
      // 异步加载level配置
      const levelData = await getLevelDataAsync();
      
      // 从配置中获取网格尺寸
      if (levelData.config) {
        this.gridWidth = levelData.config.width || this.gridWidth;
        this.gridHeight = levelData.config.height || this.gridHeight;
      }
      
      // 从output-config中获取cellSizeX和cellSizeY（如果存在）
      const outputConfig = await getOutputConfigAsync();
      const levelConfig = outputConfig?.level;
      if (levelConfig && typeof levelConfig === 'object') {
        if (typeof levelConfig.cellSizeX === 'number') {
          this.cellSizeX = levelConfig.cellSizeX;
        }
        if (typeof levelConfig.cellSizeY === 'number') {
          this.cellSizeY = levelConfig.cellSizeY;
        }
      }
      
      // 加载箭头数据
      if (levelData.arrows && Array.isArray(levelData.arrows) && levelData.arrows.length > 0) {
        this.loadArrowsFromConfig(levelData.arrows, levelData.config);
      }
    } catch (error) {
      console.warn('加载配置失败，使用默认值:', error);
      throw error; // 重新抛出错误，让调用者知道加载失败
    }
  }

  /**
   * 应用图片导入结果：清空当前箭头，设置网格与格子尺寸，加载导入的箭头
   * 批量清除箭头并只发一次选择事件，避免逐个 deleteArrow 导致栈溢出或事件风暴
   */
  public applyImportResult(result: import('../../utils/imageImport').ImageImportResult): void {
    this.arrowComponents.forEach((arrow) => arrow.destroy());
    this.arrowComponents.clear();
    this.editorArrows.clear();
    this.selectedArrowId = null;
    this.sendArrowSelected(null);

    this.gridWidth = result.config.width;
    this.gridHeight = result.config.height;
    this.cellSizeX = result.cellSizeX;
    this.cellSizeY = result.cellSizeY;
    const config: LevelConfig = { width: result.config.width, height: result.config.height };
    const arrows: ArrowData[] = result.arrows.map((a) => ({
      id: a.id,
      indices: a.indices,
      style: a.style ? { color: a.style.color } : undefined
    }));
    this.loadArrowsFromConfig(arrows, config);
    this.updateGridOffset();
    this.createGrid();
    this.sendStateUpdate();
    this.emitMiniMapUpdate();
  }

  /**
   * 从配置加载箭头
   */
  private loadArrowsFromConfig(arrows: ArrowData[], config: LevelConfig): void {
    arrows.forEach(arrowData => {
      if (!arrowData.indices || arrowData.indices.length < 2) {
        return; // 跳过无效的箭头数据
      }
      
      // 使用临时offset值创建ArrowRuntime（offset会在createGrid()中重新计算）
      // 这里先创建基本的ArrowRuntime，redrawAllArrows()会使用正确的offset重新创建
      const arrowRuntime = createArrowRuntime(
        arrowData,
        config,
        this.cellSizeX,
        this.cellSizeY,
        0, // 临时offsetX，会在redrawAllArrows()中更新
        0  // 临时offsetY，会在redrawAllArrows()中更新
      );
      
      // 设置颜色
      if (arrowData.style?.color) {
        arrowRuntime.color = hexToPhaserColor(arrowData.style.color);
      }
      
      this.editorArrows.set(arrowRuntime.id, arrowRuntime);
      
      // 注意：Arrow组件会在createGrid()中的redrawAllArrows()中创建
    });
  }

  /**
   * 窗口大小变化处理
   */
  private onResize = (): void => {
    this.updateGridOffset();
    this.createGrid();
    this.emitMiniMapUpdate();
  };

  /**
   * 设置相机控制（缩放和平移）
   */
  private setupCameraControls(): void {
    // 鼠标滚轮缩放
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, gameObjects: Phaser.GameObjects.GameObject[], deltaX: number, deltaY: number, deltaZ: number) => {
      if (this.isDragging) return; // 如果正在拖拽箭头，不处理缩放
      
      const zoomDelta = deltaY > 0 ? -0.1 : 0.1;
      this.setZoom(this.cameraZoom + zoomDelta);
    });

    // 右键拖拽平移（或中键）
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // 右键或中键开始平移（且不在拖拽箭头时）
      if ((pointer.rightButtonDown() || pointer.middleButtonDown()) && !this.isDragging) {
        this.isPanning = true;
        this.panStart = { x: pointer.x, y: pointer.y };
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      // 如果正在拖拽箭头，不处理平移
      if (this.isDragging) return;
      
      if (this.isPanning && this.panStart) {
        const dx = (pointer.x - this.panStart.x) / this.cameraZoom;
        const dy = (pointer.y - this.panStart.y) / this.cameraZoom;
        this.cameras.main.scrollX -= dx;
        this.cameras.main.scrollY -= dy;
        this.panStart = { x: pointer.x, y: pointer.y };
      }
    });

    this.input.on('pointerup', () => {
      if (!this.isDragging) {
        this.isPanning = false;
        this.panStart = null;
      }
    });
  }

  /**
   * 设置键盘控制（方向键/WASD平移）
   */
  private setupKeyboardControls(): void {
    if (!this.input.keyboard) {
      return;
    }

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasdKeys = this.input.keyboard.addKeys('W,A,S,D') as {
      W: Phaser.Input.Keyboard.Key;
      A: Phaser.Input.Keyboard.Key;
      S: Phaser.Input.Keyboard.Key;
      D: Phaser.Input.Keyboard.Key;
    };
  }

  /**
   * Window keydown：Ctrl+方向键/WASD 时平移选中箭头（不依赖游戏焦点）
   */
  private onWindowKeyDownForArrowMove(e: KeyboardEvent): void {
    if (this.isSceneShutdown || !this.selectedArrowId || !e.ctrlKey || e.repeat) {
      return;
    }
    let moveDx = 0;
    let moveDy = 0;
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        moveDx = -1;
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        moveDx = 1;
        break;
      case 'ArrowUp':
      case 'w':
      case 'W':
        moveDy = -1;
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        moveDy = 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    this.moveSelectedArrow(moveDx, moveDy);
    this.sendStateUpdate();
    this.emitMiniMapUpdate();
  }

  /**
   * 设置缩放
   */
  private setZoom(zoom: number): void {
    this.cameraZoom = Phaser.Math.Clamp(zoom, this.minZoom, this.maxZoom);
    this.cameras.main.setZoom(this.cameraZoom);
    EventBus.emit(EVENT_NAMES.EDITOR_ZOOM_CHANGE, this.cameraZoom);
    this.emitMiniMapUpdate();
  }

  /**
   * 设置 EventBus 事件监听
   */
  private setupEventListeners(): void {
    // 保存场景引用，确保在回调中可以访问
    const scene = this;
    
    // 网格宽度变化 - 使用保存的场景引用
    EventBus.on(EVENT_NAMES.EDITOR_GRID_WIDTH_CHANGE, (width: number) => {
      scene.gridWidth = width;
      scene.updateGrid();
      scene.sendStateUpdate();
    });

    // 网格高度变化 - 使用保存的场景引用
    EventBus.on(EVENT_NAMES.EDITOR_GRID_HEIGHT_CHANGE, (height: number) => {
      scene.gridHeight = height;
      scene.updateGrid();
      scene.sendStateUpdate();
    });

    EventBus.on(EVENT_NAMES.EDITOR_CELL_WIDTH_CHANGE, (cellWidth: number) => {
      scene.cellSizeX = Math.max(1, cellWidth);
      scene.updateGrid();
      scene.sendStateUpdate();
    });

    EventBus.on(EVENT_NAMES.EDITOR_CELL_HEIGHT_CHANGE, (cellHeight: number) => {
      scene.cellSizeY = Math.max(1, cellHeight);
      scene.updateGrid();
      scene.sendStateUpdate();
    });

    // 添加箭头
    EventBus.on(EVENT_NAMES.EDITOR_ADD_ARROW, () => {
      scene.setAddArrowMode();
    });

    // 颜色变化
    EventBus.on(EVENT_NAMES.EDITOR_COLOR_CHANGE, (color: number) => {
      scene.currentColor = color;
      if (scene.selectedArrowId) {
        scene.updateArrowColor(scene.selectedArrowId, color);
      }
    });

    // 删除箭头
    EventBus.on(EVENT_NAMES.EDITOR_DELETE_ARROW, (arrowId: string) => {
      scene.deleteArrow(arrowId);
    });

    // 箭头对调（参数可为 string 或 { arrowId: string }，兼容不同 emit 方式）
    EventBus.on(EVENT_NAMES.EDITOR_FLIP_ARROW, (payload?: string | { arrowId?: string } | null) => {
      const id = typeof payload === 'string' ? payload : payload?.arrowId ?? scene.selectedArrowId;
      scene.flipArrow(id);
    });

    // 导出（下载）
    EventBus.on(EVENT_NAMES.EDITOR_EXPORT, () => {
      scene.exportLevel();
    });

    // 复制 output-config 到剪贴板
    EventBus.on(EVENT_NAMES.EDITOR_COPY_CONFIG, () => {
      scene.copyConfigToClipboard();
    });

    // 缩放变化
    EventBus.on(EVENT_NAMES.EDITOR_ZOOM_IN, () => {
      scene.setZoom(scene.cameraZoom + 0.2);
    });

    EventBus.on(EVENT_NAMES.EDITOR_ZOOM_OUT, () => {
      scene.setZoom(scene.cameraZoom - 0.2);
    });

    EventBus.on(EVENT_NAMES.EDITOR_ZOOM_RESET, () => {
      scene.setZoom(1);
      scene.updateGridOffset();
    });

    // 小地图导航
    EventBus.on(EVENT_NAMES.EDITOR_MINIMAP_PAN, (payload: { normalizedX: number; normalizedY: number }) => {
      const nx = Phaser.Math.Clamp(payload.normalizedX, 0, 1);
      const ny = Phaser.Math.Clamp(payload.normalizedY, 0, 1);
      const worldX = scene.offsetX + nx * scene.gridWidth * scene.cellSizeX;
      const worldY = scene.offsetY + ny * scene.gridHeight * scene.cellSizeY;
      scene.cameras.main.centerOn(worldX, worldY);
      scene.emitMiniMapUpdate();
    });

    // 应用图片导入结果（替换当前关卡）
    EventBus.on(EVENT_NAMES.EDITOR_APPLY_IMPORT, (result: import('../../utils/imageImport').ImageImportResult) => {
      scene.applyImportResult(result);
    });
  }

  /**
   * 发送状态更新给 React UI
   */
  private sendStateUpdate(): void {
    EventBus.emit(EVENT_NAMES.EDITOR_STATE_UPDATE, {
      gridWidth: this.gridWidth,
      gridHeight: this.gridHeight,
      cellSizeX: this.cellSizeX,
      cellSizeY: this.cellSizeY
    });
  }

  private emitMiniMapUpdate(): void {
    if (!this.cameras?.main) {
      return;
    }

    const cam = this.cameras.main;
    EventBus.emit(EVENT_NAMES.EDITOR_MINIMAP_UPDATE, {
      gridWidth: this.gridWidth,
      gridHeight: this.gridHeight,
      cellSizeX: this.cellSizeX,
      cellSizeY: this.cellSizeY,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
      visible: this.gridWidth * this.gridHeight >= 2500,
      camera: {
        scrollX: cam.scrollX,
        scrollY: cam.scrollY,
        width: cam.width,
        height: cam.height,
        zoom: cam.zoom
      }
    });
  }

  /**
   * 更新网格偏移（居中显示）
   */
  private updateGridOffset(): void {
    const totalWidth = this.gridWidth * this.cellSizeX;
    const totalHeight = this.gridHeight * this.cellSizeY;
    
    // 获取画布尺寸（优先使用相机，如果不可用则使用 scale）
    let canvasWidth: number;
    let canvasHeight: number;
    
    if (this.cameras && this.cameras.main) {
      canvasWidth = this.cameras.main.width;
      canvasHeight = this.cameras.main.height;
    } else {
      // 如果相机还没准备好，使用 scale 或窗口尺寸
      canvasWidth = this.scale.width || window.innerWidth;
      canvasHeight = this.scale.height || window.innerHeight;
    }
    
    this.offsetX = (canvasWidth - totalWidth) / 2;
    this.offsetY = (canvasHeight - totalHeight) / 2;
    
    // 重置相机位置到网格中心（如果相机可用）
    if (this.cameras && this.cameras.main) {
      this.cameras.main.centerOn(this.offsetX + totalWidth / 2, this.offsetY + totalHeight / 2);
    }
  }

  /**
   * 创建网格
   */
  private createGrid(): void {
    if (!this.canRender()) {
      return;
    }

    if (this.gridGraphics) {
      this.gridGraphics.destroy();
      this.gridGraphics = null;
    }
    
    this.gridGraphics = this.add.graphics();
    this.gridGraphics.setDepth(0);

    const radius = Math.max(1, Math.min(4, Math.round(Math.min(this.cellSizeX, this.cellSizeY) * 0.08)));
    this.gridGraphics.fillStyle(0x888888, 0.9);

    for (let row = 0; row < this.gridHeight; row++) {
      for (let col = 0; col < this.gridWidth; col++) {
        const x = this.offsetX + col * this.cellSizeX + this.cellSizeX / 2;
        const y = this.offsetY + row * this.cellSizeY + this.cellSizeY / 2;
        this.gridGraphics.fillCircle(x, y, radius);
      }
    }

    // 重新绘制所有箭头
    this.redrawAllArrows();
  }

  /**
   * 更新网格
   */
  private updateGrid(): void {
    if (!this.canRender()) {
      return;
    }

    this.updateGridOffset();
    this.createGrid();
    
    // 移除超出边界的箭头
    this.removeOutOfBoundsArrows();
    this.emitMiniMapUpdate();
  }

  /**
   * 移除超出边界的箭头
   */
  private removeOutOfBoundsArrows(): void {
    const arrowsToRemove: string[] = [];
    
    this.editorArrows.forEach((arrow, id) => {
      const outOfBounds = arrow.gridIndices.some(index => {
        const pos = indexToRowCol(index, this.gridWidth);
        return pos.row < 0 || pos.row >= this.gridHeight || 
               pos.col < 0 || pos.col >= this.gridWidth;
      });
      
      if (outOfBounds) {
        arrowsToRemove.push(id);
      }
    });
    
    arrowsToRemove.forEach(id => this.deleteArrow(id));
  }

  /**
   * 设置添加箭头模式
   */
  private setAddArrowMode(): void {
    const placement = this.findAvailableArrowPlacement();
    if (!placement) {
      return;
    }

    const created = this.createNewArrow(placement.startCol, placement.startRow);
    if (created) {
      // createNewArrow 会自动选中
    }
  }

  /**
   * 创建新箭头
   */
  private createNewArrow(startCol: number, startRow: number): boolean {
    const startIndex = rowColToIndex(startRow, startCol, this.gridWidth);

    if (this.isGridIndexOccupied(startIndex)) {
      return false;
    }

    const directions = [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 }
    ];

    let endCol = startCol;
    let endRow = startRow;
    let endIndex: number | null = null;

    for (const dir of directions) {
      const nextCol = startCol + dir.x;
      const nextRow = startRow + dir.y;
      if (nextCol < 0 || nextCol >= this.gridWidth || nextRow < 0 || nextRow >= this.gridHeight) {
        continue;
      }

      const nextIndex = rowColToIndex(nextRow, nextCol, this.gridWidth);
      if (!this.isGridIndexOccupied(nextIndex)) {
        endCol = nextCol;
        endRow = nextRow;
        endIndex = nextIndex;
        break;
      }
    }

    if (endIndex === null) {
      return false;
    }

    // 创建简单的初始箭头（长度为2）
    const arrowData: ArrowData = {
      id: `arrow_${Date.now()}_${Math.random()}`,
      indices: [startIndex, endIndex],
      style: {
        color: `#${this.currentColor.toString(16).padStart(6, '0')}`
      }
    };
    
    const config: LevelConfig = {
      width: this.gridWidth,
      height: this.gridHeight
    };
    
    const arrowRuntime = createArrowRuntime(
      arrowData,
      config,
      this.cellSizeX,
      this.cellSizeY,
      this.offsetX,
      this.offsetY
    );
    
    // 更新为至少两个点（起点和终点）
    arrowRuntime.gridIndices = [startIndex, endIndex];
    arrowRuntime.keyPoints = [
      {
        x: this.offsetX + startCol * this.cellSizeX + this.cellSizeX / 2,
        y: this.offsetY + startRow * this.cellSizeY + this.cellSizeY / 2
      },
      {
        x: this.offsetX + endCol * this.cellSizeX + this.cellSizeX / 2,
        y: this.offsetY + endRow * this.cellSizeY + this.cellSizeY / 2
      }
    ];
    arrowRuntime.direction = { x: endCol - startCol, y: endRow - startRow };
    
    this.editorArrows.set(arrowRuntime.id, arrowRuntime);
    
    const arrowComponent = new Arrow(this, arrowRuntime, this.cellSizeX, this.cellSizeY);
    this.arrowComponents.set(arrowRuntime.id, arrowComponent);
    
    // 设置交互
    this.setupArrowInteraction(arrowRuntime.id, arrowComponent);
    
    // 选中新箭头
    this.selectArrow(arrowRuntime.id);

    return true;
  }

  private findAvailableArrowPlacement(): { startCol: number; startRow: number } | null {
    for (let row = 0; row < this.gridHeight; row++) {
      for (let col = 0; col < this.gridWidth; col++) {
        const startIndex = rowColToIndex(row, col, this.gridWidth);
        if (this.isGridIndexOccupied(startIndex)) {
          continue;
        }

        const directions = [
          { x: 1, y: 0 },
          { x: 0, y: 1 },
          { x: -1, y: 0 },
          { x: 0, y: -1 }
        ];

        for (const dir of directions) {
          const nextCol = col + dir.x;
          const nextRow = row + dir.y;
          if (nextCol < 0 || nextCol >= this.gridWidth || nextRow < 0 || nextRow >= this.gridHeight) {
            continue;
          }

          const nextIndex = rowColToIndex(nextRow, nextCol, this.gridWidth);
          if (!this.isGridIndexOccupied(nextIndex)) {
            return { startCol: col, startRow: row };
          }
        }
      }
    }

    return null;
  }

  private isGridIndexOccupied(index: number): boolean {
    for (const arrow of this.editorArrows.values()) {
      if (arrow.gridIndices.includes(index)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 设置箭头交互（仅移除旧监听；点击判定由 setupInteraction 统一按“点击格子所属箭头”处理）
   */
  private setupArrowInteraction(arrowId: string, arrowComponent: Arrow): void {
    const hitArea = arrowComponent.getHitArea();
    if (!hitArea) return;
    hitArea.removeAllListeners('pointerdown');
  }

  /**
   * 开始拖拽箭头头部
   */
  private startDragHead(arrowId: string, startX: number, startY: number): void {
    // 确保箭头被选中
    if (this.selectedArrowId !== arrowId) {
      this.selectArrow(arrowId);
    }
    
    this.isDragging = true;
    this.dragTarget = 'head';
    this.dragArrowId = arrowId;
    this.dragStartPoint = { x: startX, y: startY };
    this.lastDragGridPos = null;
    
    // 记录拖拽开始时的最后一个网格索引（当前路径的最后一个点）
    const arrowData = this.editorArrows.get(arrowId);
    if (arrowData && arrowData.gridIndices.length > 0) {
      this.dragStartGridIndex = arrowData.gridIndices[arrowData.gridIndices.length - 1];
    } else {
      this.dragStartGridIndex = null;
    }
    
    // 使用全局输入事件，而不是hitArea的事件
    this.input.on('pointermove', this.onDragMove, this);
    this.input.once('pointerup', this.onDragEnd, this);
  }

  /**
   * 拖拽移动
   */
  private onDragMove = (pointer: Phaser.Input.Pointer): void => {
    if (!this.isDragging || !this.dragArrowId || !this.dragTarget) return;
    
    const arrowData = this.editorArrows.get(this.dragArrowId);
    if (!arrowData) return;
    
    if (this.dragTarget === 'head') {
      // 将屏幕坐标转换为世界坐标
      const worldX = this.cameras.main.getWorldPoint(pointer.x, pointer.y).x;
      const worldY = this.cameras.main.getWorldPoint(pointer.x, pointer.y).y;
      
      // 将拖动位置映射到最近的网格点
      let gridPos: { col: number; row: number } | null = this.worldToGrid(worldX, worldY);
      
      if (!gridPos) {
        // 如果超出边界，使用边界位置
        const clampedCol = Phaser.Math.Clamp(
          Math.floor((worldX - this.offsetX) / this.cellSizeX),
          0,
          this.gridWidth - 1
        );
        const clampedRow = Phaser.Math.Clamp(
          Math.floor((worldY - this.offsetY) / this.cellSizeY),
          0,
          this.gridHeight - 1
        );
        gridPos = { col: clampedCol, row: clampedRow };
      }
      
      // 只有当网格位置改变时才更新
      if (!this.lastDragGridPos || 
          this.lastDragGridPos.col !== gridPos.col || 
          this.lastDragGridPos.row !== gridPos.row) {
        this.updateArrowHead(this.dragArrowId, gridPos.col, gridPos.row);
        this.lastDragGridPos = { ...gridPos };
      }
    }
  };

  /**
   * 拖拽结束
   */
  private onDragEnd = (): void => {
    // 结束拖拽状态，但保持箭头选中
    this.isDragging = false;
    this.dragTarget = null;
    this.dragStartPoint = null;
    this.dragStartGridIndex = null;
    this.lastDragGridPos = null;
    
    // 注意：保持 selectedArrowId 和 dragArrowId，这样箭头保持选中，可以继续拖拽
    // dragArrowId 会在下次拖拽开始时重新设置，所以这里可以不清除
    
    this.input.off('pointermove', this.onDragMove, this);
  };

  /**
   * 更新箭头头部位置
   */
  private updateArrowHead(arrowId: string, targetCol: number, targetRow: number): void {
    const arrowData = this.editorArrows.get(arrowId);
    if (!arrowData || arrowData.gridIndices.length === 0) return;
    
    const targetIndex = rowColToIndex(targetRow, targetCol, this.gridWidth);
    const startIndex = arrowData.gridIndices[0];
    
    // 如果目标点和起点相同，不更新
    if (targetIndex === startIndex) return;
    
    // 获取当前路径的最后一个点（头部位置）
    const currentHeadIndex = arrowData.gridIndices[arrowData.gridIndices.length - 1];
    
    // 如果目标点和当前头部相同，不更新
    if (targetIndex === currentHeadIndex) return;
    
    // 检查目标点是否在当前路径中（向后拖动的情况）
    const targetPosInPath = arrowData.gridIndices.indexOf(targetIndex);
    
    let newPath: number[];
    
    if (targetPosInPath >= 0) {
      // 目标点在路径中：缩短路径（向后拖动）
      // 保留到目标点的路径（包含目标点）
      newPath = [...arrowData.gridIndices.slice(0, targetPosInPath + 1)];
    } else {
      // 目标点不在路径中：延长路径（向前或侧向拖动）
      // 计算从当前头部到目标点的路径
      const path = this.calculatePath(currentHeadIndex, targetIndex);
      
      if (path.length >= 2) {
        // 合并路径（去掉重复的起点）
        newPath = [...arrowData.gridIndices];
        newPath.push(...path.slice(1));
      } else {
        // 路径计算失败，不更新
        return;
      }
    }
    
    // 确保路径至少有两个点
    if (newPath.length < 2) {
      // 如果路径太短，至少保留起点和目标点
      newPath = [startIndex, targetIndex];
    }
    
    // 重新计算关键点和方向
    const config: LevelConfig = {
      width: this.gridWidth,
      height: this.gridHeight
    };
    
    const newArrowRuntime = createArrowRuntime(
      {
        id: arrowId,
        indices: newPath,
        style: { color: `#${arrowData.color.toString(16).padStart(6, '0')}` }
      },
      config,
      this.cellSizeX,
      this.cellSizeY,
      this.offsetX,
      this.offsetY
    );
    
    // 保留颜色
    newArrowRuntime.color = arrowData.color;
    
    this.editorArrows.set(arrowId, newArrowRuntime);
    
    const arrowComponent = this.arrowComponents.get(arrowId);
    if (arrowComponent) {
      arrowComponent.updateArrowData(newArrowRuntime);
      // 重新设置交互（因为箭头数据已更新）
      this.setupArrowInteraction(arrowId, arrowComponent);
    }
    
    // 更新拖拽开始时的网格索引为新的最后一个点，以便继续拖拽
    if (this.isDragging && this.dragArrowId === arrowId) {
      this.dragStartGridIndex = newPath[newPath.length - 1];
    }
  }

  /**
   * 计算两点之间的路径（使用 A* 或简单路径）
   */
  private calculatePath(startIndex: number, endIndex: number): number[] {
    const start = indexToRowCol(startIndex, this.gridWidth);
    const end = indexToRowCol(endIndex, this.gridWidth);
    
    // 简单实现：先水平后垂直
    const path: number[] = [startIndex];
    
    let currentRow = start.row;
    let currentCol = start.col;
    
    // 先移动到目标列
    while (currentCol !== end.col) {
      currentCol += currentCol < end.col ? 1 : -1;
      path.push(rowColToIndex(currentRow, currentCol, this.gridWidth));
    }
    
    // 再移动到目标行
    while (currentRow !== end.row) {
      currentRow += currentRow < end.row ? 1 : -1;
      path.push(rowColToIndex(currentRow, currentCol, this.gridWidth));
    }
    
    return path;
  }

  /**
   * 添加路径点（已弃用，现在通过拖拽头部来修改路径）
   */
  private addPathPoint(arrowId: string, col: number, row: number): void {
    // 这个方法保留用于未来可能的扩展，但现在主要通过拖拽头部来修改路径
    const arrowData = this.editorArrows.get(arrowId);
    if (!arrowData) return;
    
    const newIndex = rowColToIndex(row, col, this.gridWidth);
    const lastIndex = arrowData.gridIndices[arrowData.gridIndices.length - 1];
    
    // 如果新点和最后一个点相同，不添加
    if (newIndex === lastIndex) return;
    
    // 计算从最后一个点到新点的路径
    const path = this.calculatePath(lastIndex, newIndex);
    
    // 合并路径（去掉重复的起点）
    const newPath = [...arrowData.gridIndices];
    if (path.length > 1) {
      newPath.push(...path.slice(1));
    }
    
    arrowData.gridIndices = newPath;
    
    // 重新计算关键点和方向
    const config: LevelConfig = {
      width: this.gridWidth,
      height: this.gridHeight
    };
    
    const newArrowRuntime = createArrowRuntime(
      {
        id: arrowId,
        indices: newPath,
        style: { color: `#${arrowData.color.toString(16).padStart(6, '0')}` }
      },
      config,
      this.cellSizeX,
      this.cellSizeY,
      this.offsetX,
      this.offsetY
    );
    
    newArrowRuntime.color = arrowData.color;
    
    this.editorArrows.set(arrowId, newArrowRuntime);
    
    const arrowComponent = this.arrowComponents.get(arrowId);
    if (arrowComponent) {
      arrowComponent.updateArrowData(newArrowRuntime);
      this.setupArrowInteraction(arrowId, arrowComponent);
    }
  }

  /**
   * 选择箭头
   */
  private selectArrow(arrowId: string): void {
    // 如果已经选中这个箭头，不重复处理
    if (this.selectedArrowId === arrowId) {
      return;
    }
    
    // 取消之前的选择
    if (this.selectedArrowId) {
      const prevArrow = this.arrowComponents.get(this.selectedArrowId);
      if (prevArrow) {
        prevArrow.setHighlight(false);
      }
    }
    
    this.selectedArrowId = arrowId;
    // 设置新箭头的高亮
    const arrow = this.arrowComponents.get(arrowId);
    if (arrow) {
      arrow.setHighlight(true);
    }
    
    // 发送选择事件给 React UI
    const arrowData = this.editorArrows.get(arrowId);
    if (arrowData) {
      this.currentColor = arrowData.color;
      this.sendArrowSelected(arrowId, arrowData.color);
    }
  }

  /**
   * 发送箭头选择事件给 React UI
   */
  private sendArrowSelected(arrowId: string | null, color?: number): void {
    EventBus.emit(EVENT_NAMES.EDITOR_ARROW_SELECTED, arrowId, color);
  }

  /**
   * 更新箭头颜色
   */
  private updateArrowColor(arrowId: string, color: number): void {
    const arrowData = this.editorArrows.get(arrowId);
    if (!arrowData) return;
    
    arrowData.color = color;
    
    const arrowComponent = this.arrowComponents.get(arrowId);
    if (arrowComponent) {
      arrowComponent.updateArrowData(arrowData);
    }
  }

  /**
   * 删除箭头
   */
  private deleteArrow(arrowId: string): void {
    const arrowComponent = this.arrowComponents.get(arrowId);
    if (arrowComponent) {
      arrowComponent.destroy();
    }
    
    this.arrowComponents.delete(arrowId);
    this.editorArrows.delete(arrowId);
    
    if (this.selectedArrowId === arrowId) {
      this.selectedArrowId = null;
      this.sendArrowSelected(null);
    }
  }

  /**
   * 箭头平移：将选中的箭头整体向 (dx, dy) 方向移动一格
   * @param dx -1=左, 1=右, 0=不水平移动
   * @param dy -1=上, 1=下, 0=不垂直移动
   */
  private moveSelectedArrow(dx: number, dy: number): void {
    if (!this.selectedArrowId || (dx === 0 && dy === 0)) return;
    
    const arrowData = this.editorArrows.get(this.selectedArrowId);
    if (!arrowData || arrowData.gridIndices.length < 2) return;
    
    const newIndices: number[] = [];
    for (const index of arrowData.gridIndices) {
      const { row, col } = indexToRowCol(index, this.gridWidth);
      const newCol = Phaser.Math.Clamp(col + dx, 0, this.gridWidth - 1);
      const newRow = Phaser.Math.Clamp(row + dy, 0, this.gridHeight - 1);
      newIndices.push(rowColToIndex(newRow, newCol, this.gridWidth));
    }
    
    const config: LevelConfig = {
      width: this.gridWidth,
      height: this.gridHeight
    };
    
    const newArrowRuntime = createArrowRuntime(
      {
        id: arrowData.id,
        indices: newIndices,
        style: { color: `#${arrowData.color.toString(16).padStart(6, '0')}` }
      },
      config,
      this.cellSizeX,
      this.cellSizeY,
      this.offsetX,
      this.offsetY
    );
    
    newArrowRuntime.color = arrowData.color;
    this.editorArrows.set(arrowData.id, newArrowRuntime);
    
    const arrowComponent = this.arrowComponents.get(arrowData.id);
    if (arrowComponent) {
      arrowComponent.updateArrowData(newArrowRuntime);
      this.setupArrowInteraction(arrowData.id, arrowComponent);
    }
    
    this.sendStateUpdate();
    this.emitMiniMapUpdate();
  }

  /**
   * 箭头对调：将指定箭头路径反转（头尾互换）。
   * 不销毁组件，只更新数据并 updateArrowData，避免第二次对调失效。
   */
  private flipArrow(arrowId: string | null | undefined): void {
    let id = arrowId ?? this.selectedArrowId;
    if (!id) return;
    if (!this.editorArrows.has(id)) {
      id = this.selectedArrowId ?? '';
    }
    if (!id) return;
    const arrowData = this.editorArrows.get(id);
    if (!arrowData || arrowData.gridIndices.length < 2) return;
    
    const newIndices = [...arrowData.gridIndices].reverse();
    const config: LevelConfig = {
      width: this.gridWidth,
      height: this.gridHeight
    };
    
    const newArrowRuntime = createArrowRuntime(
      {
        id: arrowData.id,
        indices: newIndices,
        style: { color: `#${arrowData.color.toString(16).padStart(6, '0')}` }
      },
      config,
      this.cellSizeX,
      this.cellSizeY,
      this.offsetX,
      this.offsetY
    );
    newArrowRuntime.color = arrowData.color;
    
    this.editorArrows.set(id, newArrowRuntime);
    
    const arrowComponent = this.arrowComponents.get(id);
    if (arrowComponent) {
      arrowComponent.updateArrowData(newArrowRuntime);
      this.setupArrowInteraction(id, arrowComponent);
    } else {
      const newComponent = new Arrow(this, newArrowRuntime, this.cellSizeX, this.cellSizeY);
      this.arrowComponents.set(id, newComponent);
      this.setupArrowInteraction(id, newComponent);
      if (this.selectedArrowId === id) {
        newComponent.setHighlight(true);
      }
    }
    
    this.sendStateUpdate();
    this.emitMiniMapUpdate();
  }

  /**
   * 重新绘制所有箭头
   */
  private redrawAllArrows(): void {
    // 清除所有箭头组件
    this.arrowComponents.forEach(arrow => arrow.destroy());
    this.arrowComponents.clear();
    
    // 重新创建所有箭头
    const config: LevelConfig = {
      width: this.gridWidth,
      height: this.gridHeight
    };
    
    this.editorArrows.forEach((arrowData, id) => {
      // 重新计算关键点
      const newArrowRuntime = createArrowRuntime(
        {
          id,
          indices: arrowData.gridIndices,
          style: { color: `#${arrowData.color.toString(16).padStart(6, '0')}` }
        },
        config,
      this.cellSizeX,
      this.cellSizeY,
        this.offsetX,
        this.offsetY
      );
      
      newArrowRuntime.color = arrowData.color;
      this.editorArrows.set(id, newArrowRuntime);
      
      const arrowComponent = new Arrow(this, newArrowRuntime, this.cellSizeX, this.cellSizeY);
      this.arrowComponents.set(id, arrowComponent);
      
      this.setupArrowInteraction(id, arrowComponent);
      
      if (this.selectedArrowId === id) {
        arrowComponent.setHighlight(true);
      }
    });
  }

  /**
   * 世界坐标转网格坐标
   */
  private worldToGrid(worldX: number, worldY: number): { col: number; row: number } | null {
    const col = Math.floor((worldX - this.offsetX) / this.cellSizeX);
    const row = Math.floor((worldY - this.offsetY) / this.cellSizeY);
    
    if (col >= 0 && col < this.gridWidth && row >= 0 && row < this.gridHeight) {
      return { col, row };
    }
    
    return null;
  }

  /**
   * 设置交互
   */
  private setupInteraction(): void {
    // 点击空白处取消选择或添加箭头
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // 日志：任意点击都先打一条（便于确认是否进入该 handler）
      console.warn('[Editor 点击] pointerdown', { x: pointer.x, y: pointer.y });

      // 如果正在拖拽箭头，不处理空白点击
      if (this.isDragging) return;

      // 如果正在平移，不处理点击
      if (pointer.rightButtonDown() || pointer.middleButtonDown()) {
        return;
      }

      // 检查是否点击在 UI 区域（React UI 在顶部，高度约 100px）
      if (pointer.y < 120) {
        return; // 点击在 UI 区域，不处理
      }

      // 将屏幕坐标转换为世界坐标，再转为格子
      const worldX = this.cameras.main.getWorldPoint(pointer.x, pointer.y).x;
      const worldY = this.cameras.main.getWorldPoint(pointer.x, pointer.y).y;
      const gridPos = this.worldToGrid(worldX, worldY);

      // 日志：点击位置与格子（便于排查判定与视觉不一致）
      console.warn('[Editor 点击] 位置与格子', {
        屏幕坐标: { x: pointer.x, y: pointer.y },
        世界坐标: { x: worldX, y: worldY },
        格子: gridPos ? { col: gridPos.col, row: gridPos.row } : null,
        格子索引: gridPos ? rowColToIndex(gridPos.row, gridPos.col, this.gridWidth) : null
      });

      if (!gridPos) {
        // 点击在棋盘外，取消选择
        if (this.selectedArrowId && !this.isDragging) {
          const arrow = this.arrowComponents.get(this.selectedArrowId);
          if (arrow) arrow.setHighlight(false);
          this.selectedArrowId = null;
          this.dragArrowId = null;
          this.sendArrowSelected(null);
        }
        return;
      }

      // 只判定点击格子所属的箭头：路径包含该格子索引的箭头
      const clickedIndex = rowColToIndex(gridPos.row, gridPos.col, this.gridWidth);
      const arrowsOnCell: string[] = [];
      this.editorArrows.forEach((arrowData, id) => {
        if (arrowData.gridIndices.includes(clickedIndex)) arrowsOnCell.push(id);
      });

      // 若该格子上有多条箭头（路径交叉），优先选以该格子为头部的箭头，否则选第一条
      let bestArrowId: string | null = null;
      if (arrowsOnCell.length > 0) {
        const headAtCell = arrowsOnCell.find(id => {
          const data = this.editorArrows.get(id);
          return data && data.gridIndices.length > 0 && data.gridIndices[data.gridIndices.length - 1] === clickedIndex;
        });
        bestArrowId = headAtCell ?? arrowsOnCell[0];
      }

      console.warn('[Editor 点击] 判定结果', {
        格子索引: clickedIndex,
        该格上的箭头: arrowsOnCell,
        选中的箭头: bestArrowId
      });

      if (bestArrowId !== null) {
        this.selectArrow(bestArrowId);
        const arrowData = this.editorArrows.get(bestArrowId);
        if (arrowData && arrowData.keyPoints.length >= 2) {
          const headPoint = arrowData.keyPoints[arrowData.keyPoints.length - 1];
          const headRadius = Math.min(this.cellSizeX, this.cellSizeY) * 0.5;
          const distToHead = Phaser.Math.Distance.Between(worldX, worldY, headPoint.x, headPoint.y);
          if (distToHead < headRadius) {
            this.startDragHead(bestArrowId, worldX, worldY);
          }
        }
      } else {
        // 点击空白处：取消选择（但不清除拖拽状态，因为拖拽可能还在进行）
        if (this.selectedArrowId && !this.isDragging) {
          const arrow = this.arrowComponents.get(this.selectedArrowId);
          if (arrow) {
            arrow.setHighlight(false);
          }
          this.selectedArrowId = null;
          this.dragArrowId = null; // 清除拖拽箭头ID
          this.sendArrowSelected(null);
        }
      }
    });
  }

  /**
   * 生成当前编辑结果对应的 output-config.json 字符串（与下载/复制内容一致）
   */
  private async getOutputConfigJson(): Promise<string> {
    const arrows: ArrowData[] = [];
    this.editorArrows.forEach(arrowData => {
      arrows.push({
        id: arrowData.id,
        indices: arrowData.gridIndices,
        style: {
          color: `#${arrowData.color.toString(16).padStart(6, '0')}`
        }
      });
    });
    const updatedLevel = {
      config: { width: this.gridWidth, height: this.gridHeight },
      cellSizeX: this.cellSizeX,
      cellSizeY: this.cellSizeY,
      arrows
    };
    const outputConfig = await getOutputConfigAsync();
    const existingLevel = outputConfig?.level && typeof outputConfig.level === 'object' ? outputConfig.level : {};
    const mergedLevel = {
      ...existingLevel,
      ...updatedLevel,
      config: updatedLevel.config,
      arrows: updatedLevel.arrows
    };
    const finalConfig = { ...outputConfig, level: mergedLevel };
    return JSON.stringify(finalConfig, null, 2);
  }

  /**
   * 导出为修改后的 output-config.json 并下载
   */
  private async exportLevel(): Promise<void> {
    try {
      const json = await this.getOutputConfigJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'output-config.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('导出失败:', e);
      alert('导出失败，请查看控制台');
    }
  }

  /**
   * 将 output-config.json 内容复制到剪贴板（与下载内容一致）
   */
  private async copyConfigToClipboard(): Promise<void> {
    try {
      const json = await this.getOutputConfigJson();
      await navigator.clipboard.writeText(json);
      alert('已复制到剪贴板');
    } catch (e) {
      console.error('复制失败:', e);
      alert('复制失败，请查看控制台');
    }
  }

  update(time: number, delta: number): void {
    if (this.isSceneShutdown) {
      return;
    }
    if (this.isDragging) {
      this.miniMapUpdateElapsed += delta;
      if (this.miniMapUpdateElapsed >= this.miniMapUpdateIntervalMs) {
        this.miniMapUpdateElapsed = 0;
        this.emitMiniMapUpdate();
      }
      return;
    }

    // 方向键/WASD 平移相机（箭头平移由 window keydown Ctrl+方向键 处理）
    let dx = 0;
    let dy = 0;
    if (this.cursors?.left?.isDown || this.wasdKeys?.A?.isDown) {
      dx -= 1;
    }
    if (this.cursors?.right?.isDown || this.wasdKeys?.D?.isDown) {
      dx += 1;
    }
    if (this.cursors?.up?.isDown || this.wasdKeys?.W?.isDown) {
      dy -= 1;
    }
    if (this.cursors?.down?.isDown || this.wasdKeys?.S?.isDown) {
      dy += 1;
    }
    if (dx !== 0 || dy !== 0) {
      const speed = this.panSpeed * (delta / 1000) / this.cameraZoom;
      this.cameras.main.scrollX += dx * speed;
      this.cameras.main.scrollY += dy * speed;
    }

    this.miniMapUpdateElapsed += delta;
    if (this.miniMapUpdateElapsed >= this.miniMapUpdateIntervalMs) {
      this.miniMapUpdateElapsed = 0;
      this.emitMiniMapUpdate();
    }
  }

  /**
   * 场景销毁时清理事件监听
   */
  private onShutdown(): void {
    this.teardown();
  }

  private teardown(): void {
    if (this.isSceneShutdown) {
      return;
    }

    this.isSceneShutdown = true;

    // 移除所有事件监听器（移除所有该事件的监听器）
    EventBus.off(EVENT_NAMES.EDITOR_GRID_WIDTH_CHANGE);
    EventBus.off(EVENT_NAMES.EDITOR_GRID_HEIGHT_CHANGE);
    EventBus.off(EVENT_NAMES.EDITOR_CELL_WIDTH_CHANGE);
    EventBus.off(EVENT_NAMES.EDITOR_CELL_HEIGHT_CHANGE);
    EventBus.off(EVENT_NAMES.EDITOR_ADD_ARROW);
    EventBus.off(EVENT_NAMES.EDITOR_COLOR_CHANGE);
    EventBus.off(EVENT_NAMES.EDITOR_DELETE_ARROW);
    EventBus.off(EVENT_NAMES.EDITOR_FLIP_ARROW);
    EventBus.off(EVENT_NAMES.EDITOR_EXPORT);
    EventBus.off(EVENT_NAMES.EDITOR_COPY_CONFIG);
    EventBus.off(EVENT_NAMES.EDITOR_ZOOM_IN);
    EventBus.off(EVENT_NAMES.EDITOR_ZOOM_OUT);
    EventBus.off(EVENT_NAMES.EDITOR_ZOOM_RESET);
    EventBus.off(EVENT_NAMES.EDITOR_MINIMAP_PAN);
    
    // 移除窗口大小变化监听
    this.scale.off('resize', this.onResize, this);
    
    // 移除 Ctrl+方向键 监听
    window.removeEventListener('keydown', this.boundKeyDownForArrowMove);
    
    // 清理箭头组件
    this.arrowComponents.forEach(arrow => arrow.destroy());
    this.arrowComponents.clear();
    this.editorArrows.clear();
    
    // 清理网格图形
    if (this.gridGraphics) {
      this.gridGraphics.destroy();
      this.gridGraphics = null;
    }

  }

  private canRender(): boolean {
    return !this.isSceneShutdown && !!this.sys?.displayList;
  }

  destroy(): void {
    this.teardown();
    super.destroy();
  }
}
