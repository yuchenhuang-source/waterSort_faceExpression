// 棋盘测试场景 - 关卡数据从 output-config.json 的 level 节点读取
// 自动根据屏幕尺寸和谜题大小计算格子大小，确保棋盘完整显示

import { Scene } from 'phaser';
import { Board } from '../components/Board';
import { LevelData } from '../types/Board';
import { EventBus } from '../EventBus';
import { getLevelDataAsync } from '../config/level-config';

/** 布局常量 */
const LAYOUT = {
  /** 设计分辨率 */
  DESIGN_WIDTH: 1080,
  DESIGN_HEIGHT: 1920,

  /** 左右两侧边距 */
  PADDING_X: 40,
  /** 棋盘上方预留空间（放标题 + 说明文字） */
  PADDING_TOP: 160,
  /** 棋盘下方预留空间（放调试信息等） */
  PADDING_BOTTOM: 140,

  /** 格子最大尺寸（避免小谜题格子过大） */
  MAX_CELL_SIZE: 100,
  /** 格子最小尺寸（保证可点击） */
  MIN_CELL_SIZE: 16,
};

export class BoardTest extends Scene {
  private board: Board | null = null;

  constructor() {
    super('BoardTest');
  }

  async create() {
    // ── 1. 设置画布分辨率 ──
    this.scale.setGameSize(LAYOUT.DESIGN_WIDTH, LAYOUT.DESIGN_HEIGHT);
    this.cameras.main.setBackgroundColor('#f0f0f0');

    // ── 2. 加载关卡数据 ──
    const levelData: LevelData = await getLevelDataAsync();

    const gridW = levelData.config.width;
    const gridH = levelData.config.height;

    // ── 3. 根据屏幕和谜题尺寸动态计算 cellSize ──
    const screenW = this.scale.width;
    const screenH = this.scale.height;

    const availW = screenW - LAYOUT.PADDING_X * 2;
    const availH = screenH - LAYOUT.PADDING_TOP - LAYOUT.PADDING_BOTTOM;

    // 保持正方形格子：取 X/Y 方向可容纳的最小值
    let cellSize = Math.floor(Math.min(availW / gridW, availH / gridH));
    cellSize = Math.max(LAYOUT.MIN_CELL_SIZE, Math.min(LAYOUT.MAX_CELL_SIZE, cellSize));

    const cellSizeX = cellSize;
    const cellSizeY = cellSize;

    // ── 4. 计算棋盘在屏幕中的位置（水平 + 垂直居中） ──
    const boardWidth = gridW * cellSizeX;
    const boardHeight = gridH * cellSizeY;
    const offsetX = Math.round((screenW - boardWidth) / 2);
    const offsetY = Math.round(
      LAYOUT.PADDING_TOP + (availH - boardHeight) / 2
    );

    // ── 5. 创建棋盘 ──
    this.board = new Board(
      this,
      levelData,
      cellSizeX,
      cellSizeY,
      offsetX,
      offsetY
    );

    // ── 6. 箭头点击回调 ──
    this.board.onArrowClick((arrowId) => {
      console.log(`点击了箭头: ${arrowId}`);
      const arrow = this.board!.getArrow(arrowId);
      if (arrow) {
        console.log(`箭头路径: [${arrow.gridIndices.join(', ')}]`);
        console.log(`箭头朝向: (${arrow.direction.x}, ${arrow.direction.y})`);
      }
    });

    // ── 7. 胜利回调 ──
    this.board.onWin(() => {
      this.showWinMessage();
    });

    // ── 8. 绘制 UI ──
    this.drawUI(levelData, cellSizeX, cellSizeY, boardWidth, boardHeight, offsetX, offsetY);

    // 暴露场景给 React
    EventBus.emit('current-scene-ready', this);
  }

  /**
   * 绘制标题、说明文字和调试信息
   */
  private drawUI(
    levelData: LevelData,
    cellSizeX: number,
    cellSizeY: number,
    boardWidth: number,
    boardHeight: number,
    offsetX: number,
    offsetY: number
  ): void {
    const centerX = this.scale.width / 2;

    // 标题
    this.add
      .text(centerX, 50, 'ArrowPuzzle 棋盘测试', {
        fontSize: '36px',
        color: '#000000',
        align: 'center',
        fontFamily: 'Arial',
      })
      .setOrigin(0.5);

    // 说明
    this.add
      .text(centerX, offsetY - 24, '点击箭头测试交互', {
        fontSize: '24px',
        color: '#666666',
        align: 'center',
        fontFamily: 'Arial',
      })
      .setOrigin(0.5);

    // 调试信息（棋盘下方）
    const debugY = offsetY + boardHeight + 16;
    this.add.text(
      offsetX,
      debugY,
      `棋盘: ${levelData.config.width}×${levelData.config.height}` +
        `  格子: ${cellSizeX}×${cellSizeY}px` +
        `  箭头: ${levelData.arrows.length}`,
      {
        fontSize: '20px',
        color: '#999999',
        fontFamily: 'Arial',
      }
    );
  }

  /**
   * 显示胜利消息
   */
  private showWinMessage(): void {
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    // 半透明遮罩
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.4);
    overlay.fillRect(0, 0, this.scale.width, this.scale.height);
    overlay.setDepth(200);

    // 胜利文本
    this.add
      .text(centerX, centerY, 'Congratulations!', {
        fontSize: '64px',
        color: '#FFD700',
        align: 'center',
        fontFamily: 'Arial',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(201);
  }

  update() {
    // 预留给后续动画/逻辑
  }

  destroy() {
    if (this.board) {
      this.board.destroy();
      this.board = null;
    }
    super.destroy();
  }
}
