// 棋盘组件

import { Scene } from 'phaser';
import { LevelConfig, LevelData, ArrowRuntime, OccupancyMap } from '../types/Board';
import { Arrow } from './Arrow';
import {
  createArrowRuntime,
  buildOccupancyMap,
  canArrowExit,
  rowColToIndex,
  findNearestOccupiedCellInRadius
} from '../utils/BoardUtils';

export class Board {
  private scene: Scene;
  private config: LevelConfig;
  private arrows: ArrowRuntime[] = [];
  private arrowComponents: Map<string, Arrow> = new Map();
  private occupancy: OccupancyMap = new Map();
  
  // 渲染参数
  private cellSizeX: number;
  private cellSizeY: number;
  private offsetX: number;
  private offsetY: number;

  /** 横屏缩放时棋盘所在的父容器，用于将世界坐标转换为容器本地坐标 */
  private parentContainer: Phaser.GameObjects.Container | null = null;

  /** 箭头飞出动画固定时长（毫秒），与箭头长度无关 */
  private static readonly FLY_OUT_DURATION_MS = 500;

  // 回调函数
  private onArrowClickCallback?: (arrowId: string) => void;
  private onWinCallback?: () => void;
  private onArrowExitCallback?: (arrowId: string) => void;

  // 统一点击处理（按格子判定），用于移除监听
  private boundPointerDown?: (pointer: Phaser.Input.Pointer) => void;

  constructor(
    scene: Scene,
    levelData: LevelData,
    cellSizeX: number = 50,
    cellSizeY: number = 50,
    offsetX: number = 0,
    offsetY: number = 0,
    parentContainer?: Phaser.GameObjects.Container
  ) {
    this.scene = scene;
    this.config = levelData.config;
    this.cellSizeX = cellSizeX;
    this.cellSizeY = cellSizeY;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    this.parentContainer = parentContainer ?? null;
    
    // 使用父容器时箭头坐标以 (0,0) 为原点
    const arrowOffsetX = this.parentContainer ? 0 : offsetX;
    const arrowOffsetY = this.parentContainer ? 0 : offsetY;
    
    // 创建箭头
    levelData.arrows.forEach(arrowData => {
      const arrowRuntime = createArrowRuntime(
        arrowData,
        this.config,
        this.cellSizeX,
        this.cellSizeY,
        arrowOffsetX,
        arrowOffsetY
      );
      this.arrows.push(arrowRuntime);
      
      const arrowComponent = new Arrow(
        scene,
        arrowRuntime,
        this.cellSizeX,
        this.cellSizeY,
        this.parentContainer ?? undefined
      );
      this.arrowComponents.set(arrowRuntime.id, arrowComponent);
    });

    // 统一按“点击格子”判定箭头
    this.boundPointerDown = (pointer: Phaser.Input.Pointer) => {
      let worldX = pointer.x;
      let worldY = pointer.y;
      if (this.parentContainer) {
        const c = this.parentContainer;
        worldX = (pointer.x - c.x) / c.scaleX;
        worldY = (pointer.y - c.y) / c.scaleY;
      }
      const gridPos = this.worldToGrid(worldX, worldY);

      if (!gridPos) return;

      let resolvedIndex = rowColToIndex(gridPos.row, gridPos.col, this.config.width);
      let arrowsOnCell: string[] = [];
      this.arrows.forEach(a => {
        if (!a.isEliminated && !a.isAnimating && a.gridIndices.includes(resolvedIndex)) {
          arrowsOnCell.push(a.id);
        }
      });

      // 点击到空格子时，在 2 格以内找最近的有箭头的格子作为判定目标
      if (arrowsOnCell.length === 0) {
        const nearestIndex = findNearestOccupiedCellInRadius(
          gridPos.row,
          gridPos.col,
          this.config.width,
          this.config.height,
          this.arrows,
          2
        );
        if (nearestIndex !== null) {
          resolvedIndex = nearestIndex;
          arrowsOnCell = [];
          this.arrows.forEach(a => {
            if (!a.isEliminated && !a.isAnimating && a.gridIndices.includes(resolvedIndex)) {
              arrowsOnCell.push(a.id);
            }
          });
        }
      }

      const headAtCell = arrowsOnCell.find(id => {
        const a = this.arrows.find(r => r.id === id);
        return a && a.gridIndices.length > 0 && a.gridIndices[a.gridIndices.length - 1] === resolvedIndex;
      });
      const selectedId = headAtCell ?? arrowsOnCell[0] ?? null;
      if (selectedId) this.handleArrowClick(selectedId);
    };
    this.scene.input.on('pointerdown', this.boundPointerDown);

    // 构建占用表
    this.updateOccupancy();
  }

  /**
   * 世界坐标转格子（棋盘内为 col/row，棋盘外返回 null）
   */
  private worldToGrid(worldX: number, worldY: number): { col: number; row: number } | null {
    const col = Math.floor((worldX - this.offsetX) / this.cellSizeX);
    const row = Math.floor((worldY - this.offsetY) / this.cellSizeY);
    if (col >= 0 && col < this.config.width && row >= 0 && row < this.config.height) {
      return { col, row };
    }
    return null;
  }

  /**
   * 更新占用表
   */
  private updateOccupancy(): void {
    this.occupancy = buildOccupancyMap(this.arrows);
  }

  /**
   * 处理箭头点击
   */
  public handleArrowClick(arrowId: string): void {
    const arrow = this.arrows.find(a => a.id === arrowId);
    if (!arrow || arrow.isEliminated || arrow.isAnimating) {
      return;
    }
    
    const arrowComponent = this.arrowComponents.get(arrowId);
    if (!arrowComponent) {
      return;
    }
    
    // 检查是否可以退出
    const exitCheck = canArrowExit(arrow, this.config, this.occupancy);
    
    if (this.onArrowClickCallback) {
      this.onArrowClickCallback(arrowId);
    }
    
    // 设置动画状态
    arrow.isAnimating = true;
    arrowComponent.setAnimating(true);
    
    if (exitCheck.canExit) {
      this.playExitAnimation(arrow, arrowComponent, exitCheck.steps);
    } else {
      this.playBounceAnimation(arrow, arrowComponent, exitCheck.steps, exitCheck.obstacleIdx);
    }
  }

  /**
   * 播放飞出动画（成功）
   */
  private playExitAnimation(
    arrow: ArrowRuntime,
    arrowComponent: Arrow,
    steps: number
  ): void {
    const arrowLength = arrow.gridIndices.length;
    // 计算目标 offsetRate（额外多飞一段，确保完全飞出屏幕）
    const n = steps + arrowLength + 10;
    const duration = Board.FLY_OUT_DURATION_MS; // 固定时长，与箭头长度无关
    
    // 创建一个临时对象用于 tween
    const tweenTarget = { offsetRate: 0 };
    
    // 创建 tween
    this.scene.tweens.add({
      targets: tweenTarget,
      offsetRate: n,
      duration: duration,
      ease: 'Quad.easeIn', // quadIn（加速）
      onUpdate: () => {
        arrowComponent.setOffsetRate(tweenTarget.offsetRate);
      },
      onComplete: () => {
        // 箭头飞出棋盘时播放正确音效
        if (this.scene.cache.audio.exists('correct')) {
          this.scene.sound.play('correct');
        }
        // 动画完成，移除箭头
        this.removeArrow(arrow.id);
        
        // 触发成功飞出回调
        if (this.onArrowExitCallback) {
          this.onArrowExitCallback(arrow.id);
        }
        
        // 检查胜利
        if (this.checkWin() && this.onWinCallback) {
          this.onWinCallback();
        }
      }
    });
  }

  /**
   * 播放回弹动画（碰撞）
   */
  private playBounceAnimation(
    arrow: ArrowRuntime,
    arrowComponent: Arrow,
    steps: number,
    obstacleIdx: number | null
  ): void {
    const duration = Board.FLY_OUT_DURATION_MS; // 固定时长
    
    // 找到障碍箭头
    let obstacleArrowComponent: Arrow | undefined;
    if (obstacleIdx !== null) {
      const obstacleArrowId = this.occupancy.get(obstacleIdx);
      if (obstacleArrowId) {
        obstacleArrowComponent = this.arrowComponents.get(obstacleArrowId);
      }
    }
    
    // 创建临时对象用于 tween
    const tweenTarget = { offsetRate: 0 };
    
    // 第一段：前冲
    this.scene.tweens.add({
      targets: tweenTarget,
      offsetRate: steps,
      duration: duration,
      ease: 'Quad.easeIn', // quadIn（加速）
      onUpdate: () => {
        arrowComponent.setOffsetRate(tweenTarget.offsetRate);
      },
      onComplete: () => {
        // 撞上箭头时播放错误音效
        if (this.scene.cache.audio.exists('error')) {
          this.scene.sound.play('error');
        }
        // 碰撞反馈：闪红
        arrowComponent.shineRed();
        if (obstacleArrowComponent) {
          obstacleArrowComponent.shineRed();
        }
        
        // 第二段：回弹
        this.scene.tweens.add({
          targets: tweenTarget,
          offsetRate: 0,
          duration: duration,
          ease: 'Quad.easeOut', // quadOut（减速回弹）
          onUpdate: () => {
            arrowComponent.setOffsetRate(tweenTarget.offsetRate);
          },
          onComplete: () => {
            // 动画完成，恢复状态
            arrow.isAnimating = false;
            arrowComponent.setAnimating(false);
          }
        });
      }
    });
  }

  /**
   * 移除箭头
   */
  private removeArrow(arrowId: string): void {
    const arrow = this.arrows.find(a => a.id === arrowId);
    if (arrow) {
      arrow.isEliminated = true;
      arrow.isAnimating = false;
    }
    
    const arrowComponent = this.arrowComponents.get(arrowId);
    if (arrowComponent) {
      arrowComponent.destroy();
      this.arrowComponents.delete(arrowId);
    }
    
    // 更新占用表
    this.updateOccupancy();
  }

  /**
   * 设置箭头点击回调
   */
  public onArrowClick(callback: (arrowId: string) => void): void {
    this.onArrowClickCallback = callback;
  }

  /**
   * 程序化触发箭头点击（用于引导等场景）
   */
  public triggerArrowClick(arrowId: string): void {
    this.handleArrowClick(arrowId);
  }

  /**
   * 设置胜利回调
   */
  public onWin(callback: () => void): void {
    this.onWinCallback = callback;
  }

  /**
   * 设置箭头成功飞出回调
   */
  public onArrowExit(callback: (arrowId: string) => void): void {
    this.onArrowExitCallback = callback;
  }

  /**
   * 获取箭头
   */
  public getArrow(arrowId: string): ArrowRuntime | undefined {
    return this.arrows.find(a => a.id === arrowId);
  }

  /**
   * 获取所有箭头
   */
  public getAllArrows(): ArrowRuntime[] {
    return this.arrows.filter(a => !a.isEliminated);
  }

  /**
   * 获取占用表
   */
  public getOccupancy(): OccupancyMap {
    return this.occupancy;
  }

  /**
   * 设置箭头高亮（用于引导时高亮被引导的箭头）
   */
  public setArrowHighlight(arrowId: string, highlight: boolean): void {
    const arrowComponent = this.arrowComponents.get(arrowId);
    if (arrowComponent) {
      arrowComponent.setHighlight(highlight);
    }
  }

  /**
   * 检查是否胜利
   */
  public checkWin(): boolean {
    const isWin = this.arrows.filter(a => !a.isEliminated).length === 0;
    if (isWin && this.onWinCallback) {
      this.onWinCallback();
    }
    return isWin;
  }

  /**
   * 获取已消除的箭头ID列表（用于保存状态）
   */
  public getEliminatedArrowIds(): string[] {
    return this.arrows
      .filter(a => a.isEliminated)
      .map(a => a.id);
  }

  /**
   * 恢复箭头状态（标记已消除的箭头）
   */
  public restoreArrowStates(eliminatedArrowIds: string[]): void {
    eliminatedArrowIds.forEach(arrowId => {
      const arrow = this.arrows.find(a => a.id === arrowId);
      if (arrow) {
        arrow.isEliminated = true;
        arrow.isAnimating = false;
        
        // 销毁对应的箭头组件（隐藏视觉）
        const arrowComponent = this.arrowComponents.get(arrowId);
        if (arrowComponent) {
          arrowComponent.destroy();
          this.arrowComponents.delete(arrowId);
        }
      }
    });
    
    // 更新占用表
    this.updateOccupancy();
    
    // 检查胜利状态
    this.checkWin();
  }

  /**
   * 销毁
   */
  public destroy(): void {
    if (this.boundPointerDown) {
      this.scene.input.off('pointerdown', this.boundPointerDown);
      this.boundPointerDown = undefined;
    }
    this.arrowComponents.forEach(arrow => arrow.destroy());
    this.arrowComponents.clear();

    this.arrows = [];
    this.occupancy.clear();
  }
}
