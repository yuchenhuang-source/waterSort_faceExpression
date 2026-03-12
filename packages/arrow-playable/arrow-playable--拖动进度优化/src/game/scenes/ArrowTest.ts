import { Scene } from 'phaser';
import { ArrowData, ArrowAnimation, GridPos, Direction } from '../types/Arrow';
import { createLShapeArrow, calculateSlidePath, isWithinBounds, moveInDirection } from '../utils/ArrowUtils';
import { ArrowSprite } from '../components/ArrowSprite';

export class ArrowTest extends Scene {
  private gridSize: number = 8;
  private cellSize: number = 80;
  private gridOffsetX: number = 0;
  private gridOffsetY: number = 0;
  private arrows: ArrowData[] = [];
  private arrowSprites: Map<string, ArrowSprite> = new Map();
  private animations: Map<string, ArrowAnimation> = new Map();
  private graphics: Phaser.GameObjects.Graphics | null = null;

  constructor() {
    super('ArrowTest');
  }

  create() {
    // 设置游戏尺寸
    this.scale.setGameSize(1080, 1920);

    // 设置背景色
    this.cameras.main.setBackgroundColor('#f0f0f0');

    // 计算网格偏移（居中）
    this.gridOffsetX = (this.scale.width - this.gridSize * this.cellSize) / 2;
    this.gridOffsetY = (this.scale.height - this.gridSize * this.cellSize) / 2;

    // 绘制网格背景
    this.drawGrid();

    // 创建测试箭头（L形，颜色从 output-config 的 arrow.defaultColor 读取）
    const testArrow = createLShapeArrow('arrow1', { x: 2, y: 2 });
    this.arrows.push(testArrow);

    // 创建箭头精灵
    const sprite = new ArrowSprite(
      this,
      testArrow,
      this.gridSize,
      this.cellSize,
      this.gridOffsetX,
      this.gridOffsetY
    );
    this.arrowSprites.set(testArrow.id, sprite);

    // 添加点击事件
    this.setupClickHandlers(sprite);

    // 添加说明文字
    this.add.text(
      this.scale.width / 2,
      100,
      '点击箭头测试滑行效果',
      {
        fontSize: '32px',
        color: '#000000',
        align: 'center'
      }
    ).setOrigin(0.5);

    // 添加调试信息
    this.add.text(
      50,
      200,
      `箭头位置: (${testArrow.segments[0].position.x}, ${testArrow.segments[0].position.y})\n` +
      `箭头方向: ${testArrow.headDirection}\n` +
      `箭头长度: ${testArrow.length}`,
      {
        fontSize: '24px',
        color: '#000000'
      }
    );
  }

  private drawGrid(): void {
    this.graphics = this.add.graphics();
    this.graphics.lineStyle(2, 0xcccccc, 0.5);

    // 绘制网格线
    for (let i = 0; i <= this.gridSize; i++) {
      // 垂直线
      this.graphics.moveTo(
        this.gridOffsetX + i * this.cellSize,
        this.gridOffsetY
      );
      this.graphics.lineTo(
        this.gridOffsetX + i * this.cellSize,
        this.gridOffsetY + this.gridSize * this.cellSize
      );

      // 水平线
      this.graphics.moveTo(
        this.gridOffsetX,
        this.gridOffsetY + i * this.cellSize
      );
      this.graphics.lineTo(
        this.gridOffsetX + this.gridSize * this.cellSize,
        this.gridOffsetY + i * this.cellSize
      );
    }

    this.graphics.strokePath();
  }

  private setupClickHandlers(sprite: ArrowSprite): void {
    sprite.getSegmentSprites().forEach(segmentSprite => {
      segmentSprite.on('pointerdown', () => {
        const arrowId = segmentSprite.getData('arrowId');
        this.handleArrowClick(arrowId);
      });

      // 添加悬停效果
      segmentSprite.on('pointerover', () => {
        sprite.setHighlight(true);
      });

      segmentSprite.on('pointerout', () => {
        sprite.setHighlight(false);
      });
    });
  }

  private handleArrowClick(arrowId: string): void {
    const arrow = this.arrows.find(a => a.id === arrowId);
    if (!arrow || arrow.isAnimating || arrow.isEliminated) {
      return;
    }

    // 计算滑行路径
    const slidePath = calculateSlidePath(arrow, this.gridSize);

    // 检查碰撞（简化版：只检查路径上是否有其他箭头）
    const hasCollision = this.checkCollision(arrow, slidePath);
    if (hasCollision) {
      // 反弹效果
      this.playBounceEffect(arrow);
      return;
    }

    // 开始滑行动画
    this.startSlideAnimation(arrow, slidePath);
  }

  private checkCollision(arrow: ArrowData, slidePath: GridPos[]): boolean {
    for (const pos of slidePath) {
      // 检查该位置是否被其他箭头占据
      for (const otherArrow of this.arrows) {
        if (otherArrow.id === arrow.id || otherArrow.isEliminated) {
          continue;
        }

        for (const segment of otherArrow.segments) {
          if (segment.position.x === pos.x && segment.position.y === pos.y) {
            return true; // 有碰撞
          }
        }
      }
    }
    return false;
  }

  private playBounceEffect(arrow: ArrowData): void {
    const sprite = this.arrowSprites.get(arrow.id);
    if (!sprite) return;

    // 红色闪烁效果
    sprite.getSegmentSprites().forEach(seg => {
      this.tweens.add({
        targets: seg,
        alpha: 0.3,
        duration: 100,
        yoyo: true,
        repeat: 1,
        onComplete: () => {
          seg.setAlpha(1);
        }
      });
    });

    // 播放反弹音效（如果有）
    console.log('反弹！');
  }

  private startSlideAnimation(arrow: ArrowData, slidePath: GridPos[]): void {
    arrow.isAnimating = true;

    // 扩展路径到棋盘外（用于飞出效果）
    const extendedPath = [...slidePath];
    let lastPos = slidePath[slidePath.length - 1];
    const slideDirection = arrow.headDirection;
    
    // 添加棋盘外的路径点（用于直线飞出）
    for (let i = 0; i < 10; i++) {
      const nextPos = moveInDirection(lastPos, slideDirection);
      extendedPath.push(nextPos);
      lastPos = nextPos;
    }

    const animation: ArrowAnimation = {
      arrow,
      targetPath: extendedPath,
      currentProgress: 0,
      segmentOffsets: arrow.segments.map(() => ({ x: 0, y: 0 })),
      startTime: this.time.now
    };

    this.animations.set(arrow.id, animation);
  }

  private updateAnimation(arrowId: string): void {
    const animation = this.animations.get(arrowId);
    if (!animation) return;

    const arrow = animation.arrow;
    const sprite = this.arrowSprites.get(arrowId);
    if (!sprite) return;

    const elapsedTime = this.time.now - animation.startTime;
    const slideSpeed = 0.3; // 格子/秒
    const segmentDelay = 120; // 段之间的延迟（毫秒）
    const cellSize = this.cellSize;

    // 更新每个段的位置（蛇形展开效果）
    let allSegmentsComplete = true;
    
    arrow.segments.forEach((segment, index) => {
      // 计算该段的延迟时间
      const delayTime = index * segmentDelay;
      const segmentElapsedTime = Math.max(0, elapsedTime - delayTime);
      
      // 计算该段应该移动的距离（格子数）
      const distance = (segmentElapsedTime / 1000) * slideSpeed;
      
      if (distance > 0) {
        allSegmentsComplete = false;
        
        // 计算目标路径索引
        const pathIndex = Math.min(
          Math.floor(distance),
          animation.targetPath.length - 1
        );
        const nextPathIndex = Math.min(pathIndex + 1, animation.targetPath.length - 1);
        
        const currentPathPos = animation.targetPath[pathIndex];
        const nextPathPos = animation.targetPath[nextPathIndex];
        
        // 线性插值
        const t = distance - pathIndex;
        const interpolatedPos: GridPos = {
          x: currentPathPos.x + (nextPathPos.x - currentPathPos.x) * t,
          y: currentPathPos.y + (nextPathPos.y - currentPathPos.y) * t
        };

        // 转换为世界坐标
        const worldPos = this.gridToWorld(interpolatedPos);

        // 直接更新位置
        const segSprite = sprite.getSegmentSprites()[index];
        if (segSprite) {
          segSprite.x = worldPos.x;
          segSprite.y = worldPos.y;
        }
      }
    });

    // 检查是否所有段都完成（头部已飞出足够远）
    const headDistance = (elapsedTime / 1000) * slideSpeed;
    if (headDistance >= animation.targetPath.length + arrow.length) {
      // 箭头完全飞出，完成动画
      this.completeAnimation(arrowId);
    }
  }

  private completeAnimation(arrowId: string): void {
    const animation = this.animations.get(arrowId);
    const arrow = animation?.arrow;
    if (!arrow) return;

    // 移除动画
    this.animations.delete(arrowId);

    // 标记为已消除
    arrow.isEliminated = true;
    arrow.isAnimating = false;

    // 销毁精灵（飞出效果）
    const sprite = this.arrowSprites.get(arrowId);
    if (sprite) {
      // 飞出动画：继续向右移动并淡出
      sprite.getSegmentSprites().forEach((seg, index) => {
        this.tweens.add({
          targets: seg,
          x: seg.x + 500,
          alpha: 0,
          duration: 500,
          delay: index * 50,
          ease: 'Power2',
          onComplete: () => {
            seg.destroy();
          }
        });
      });

      // 延迟销毁
      this.time.delayedCall(1000, () => {
        sprite.destroy();
        this.arrowSprites.delete(arrowId);
        console.log('箭头已消除！');
      });
    }
  }

  private gridToWorld(gridPos: GridPos): GridPos {
    return {
      x: this.gridOffsetX + gridPos.x * this.cellSize + this.cellSize / 2,
      y: this.gridOffsetY + gridPos.y * this.cellSize + this.cellSize / 2
    };
  }

  update() {
    // 更新所有动画
    this.animations.forEach((animation, arrowId) => {
      this.updateAnimation(arrowId);
    });
  }
}
