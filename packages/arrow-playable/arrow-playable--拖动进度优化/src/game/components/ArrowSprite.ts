import { Scene } from 'phaser';
import { ArrowData, ArrowSegment, GridPos } from '../types/Arrow';

// 箭头精灵组，用于渲染箭头
export class ArrowSprite {
  private scene: Scene;
  private arrowData: ArrowData;
  private segmentSprites: Phaser.GameObjects.Rectangle[] = [];
  private gridSize: number;
  private cellSize: number;
  private gridOffsetX: number;
  private gridOffsetY: number;

  constructor(
    scene: Scene,
    arrowData: ArrowData,
    gridSize: number,
    cellSize: number,
    gridOffsetX: number,
    gridOffsetY: number
  ) {
    this.scene = scene;
    this.arrowData = arrowData;
    this.gridSize = gridSize;
    this.cellSize = cellSize;
    this.gridOffsetX = gridOffsetX;
    this.gridOffsetY = gridOffsetY;

    this.createSprites();
  }

  private createSprites(): void {
    // 为每个段创建精灵
    this.arrowData.segments.forEach((segment, index) => {
      const worldPos = this.gridToWorld(segment.position);
      const sprite = this.scene.add.rectangle(
        worldPos.x,
        worldPos.y,
        this.cellSize * 0.8,
        this.cellSize * 0.8,
        this.arrowData.color,
        0.8
      );

      // 添加方向指示（头部更明显）
      if (index === 0) {
        // 头部：添加三角形指示方向
        sprite.setFillStyle(this.arrowData.color, 1);
        this.addDirectionIndicator(worldPos, segment.direction, sprite);
      } else {
        // 身体：稍微透明
        sprite.setFillStyle(this.arrowData.color, 0.6);
      }

      sprite.setInteractive();
      sprite.setData('arrowId', this.arrowData.id);
      sprite.setData('segmentIndex', index);

      this.segmentSprites.push(sprite);
    });
  }

  private addDirectionIndicator(
    pos: GridPos,
    direction: string,
    parent: Phaser.GameObjects.Rectangle
  ): void {
    const size = this.cellSize * 0.25;
    const triangle = this.scene.add.triangle(
      pos.x,
      pos.y,
      0, -size,
      -size / 2, size / 2,
      size / 2, size / 2,
      0xffffff,
      1
    );

    // 根据方向旋转三角形
    let rotation = 0;
    switch (direction) {
      case 'RIGHT':
        rotation = 0;
        break;
      case 'LEFT':
        rotation = Math.PI;
        break;
      case 'UP':
        rotation = -Math.PI / 2;
        break;
      case 'DOWN':
        rotation = Math.PI / 2;
        break;
    }
    triangle.setRotation(rotation);
    triangle.setDepth(parent.depth + 1);
  }

  private gridToWorld(gridPos: GridPos): GridPos {
    return {
      x: this.gridOffsetX + gridPos.x * this.cellSize + this.cellSize / 2,
      y: this.gridOffsetY + gridPos.y * this.cellSize + this.cellSize / 2
    };
  }

  public updatePosition(segmentIndex: number, worldPos: GridPos): void {
    // 位置更新现在直接在updateAnimation中处理
    // 这个方法保留用于未来可能的平滑插值
  }

  public setHighlight(highlight: boolean): void {
    this.segmentSprites.forEach(sprite => {
      if (highlight) {
        sprite.setStrokeStyle(3, 0xffff00);
      } else {
        sprite.setStrokeStyle(0);
      }
    });
  }

  public destroy(): void {
    this.segmentSprites.forEach(sprite => sprite.destroy());
    this.segmentSprites = [];
  }

  public getArrowId(): string {
    return this.arrowData.id;
  }

  public getSegmentSprites(): Phaser.GameObjects.Rectangle[] {
    return this.segmentSprites;
  }
}
