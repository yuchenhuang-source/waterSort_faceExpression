// 箭头组件（基于设计文档）

import { Scene } from 'phaser';
import { ArrowRuntime, Point, Direction } from '../types/Board';
import { generateDisplayPoints } from '../utils/ArrowAnimation';

export class Arrow {
  private scene: Scene;
  private arrowData: ArrowRuntime;
  private graphics: Phaser.GameObjects.Graphics;
  private highlightGraphics: Phaser.GameObjects.Graphics | null = null;
  private hitArea: Phaser.GameObjects.Zone | null = null;
  
  // 样式参数（相对于cellSize）
  private thickness: number; // 主体厚度
  private headLen: number; // 箭头头部长度
  private headWidth: number; // 箭头头部底边宽
  private cellSizeX: number;
  private cellSizeY: number;
  
  // 动画参数
  private offsetRate: number = 0; // 推进量（格为单位）
  private gridUnit: number = 50; // 网格单位（像素/格）
  private isAnimating: boolean = false;
  
  constructor(
    scene: Scene,
    arrowData: ArrowRuntime,
    cellSizeX: number,
    cellSizeY: number,
    parentContainer?: Phaser.GameObjects.Container
  ) {
    this.scene = scene;
    this.arrowData = arrowData;
    this.cellSizeX = cellSizeX;
    this.cellSizeY = cellSizeY;
    const unit = Math.min(cellSizeX, cellSizeY);
    this.gridUnit = unit; // 使用较小边作为网格单位
    
    // 计算样式参数（线条细一点，头部缩小到 80%）
    this.thickness = unit * 0.26; // 箭头主体（线条）厚度
    this.headLen = unit * 0.72; // 箭头头部长度（原 0.9 的 80%）
    this.headWidth = unit * 0.9; // 箭头头部底边宽（原 1.125 的 80%）
    
    // 创建图形对象
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(10);
    
    // 创建高亮图形对象（初始隐藏）
    this.highlightGraphics = scene.add.graphics();
    this.highlightGraphics.setDepth(100);
    this.highlightGraphics.setVisible(false);
    
    // 创建命中区域
    this.createHitArea(unit);
    
    // 若提供父容器（横屏缩放用），将显示对象加入容器
    if (parentContainer) {
      parentContainer.add([this.graphics, this.highlightGraphics!, this.hitArea!]);
    }
    
    // 绘制箭头
    this.draw();
  }

  /**
   * 创建命中区域（略大于视觉）
   */
  private createHitArea(cellSize: number): void {
    const hitPadding = cellSize * 0.1; // 外扩10%
    
    // 计算边界框
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    this.arrowData.keyPoints.forEach(point => {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });
    
    const width = maxX - minX + hitPadding * 2;
    const height = maxY - minY + hitPadding * 2;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    this.hitArea = this.scene.add.zone(centerX, centerY, width, height);
    this.hitArea.setInteractive();
    this.hitArea.setData('arrowId', this.arrowData.id);
    this.hitArea.setDepth(20); // 在图形之上
  }

  /**
   * 绘制箭头
   */
  private draw(): void {
    this.drawWithColor(this.arrowData.color);
  }

  /**
   * 使用指定颜色绘制箭头
   */
  private drawWithColor(color: number): void {
    this.graphics.clear();
    
    if (this.arrowData.keyPoints.length < 2) {
      return;
    }
    
    // 根据 offsetRate 生成显示点
    const displayPoints = generateDisplayPoints(
      this.arrowData,
      this.offsetRate,
      this.gridUnit
    );
    
    // 绘制折线路径
    this.drawPolylineWithColor(displayPoints, color);
    
    // 绘制箭头头部
    this.drawArrowHeadWithColor(displayPoints, color);
  }

  /**
   * 绘制折线路径（粗圆角管道）
   */
  private drawPolyline(displayPoints: Point[]): void {
    this.drawPolylineWithColor(displayPoints, this.arrowData.color);
  }

  /**
   * 使用指定颜色绘制折线路径（真正圆角：用填充胶囊段实现）
   */
  private drawPolylineWithColor(displayPoints: Point[], color: number): void {
    // 起点要圆帽，终点（接头部）不要圆帽
    this.drawRoundedPipe(this.graphics, displayPoints, color, 1, true, false);
  }

  /**
   * 绘制圆角管道（胶囊段 + 拐角圆）
   * @param capStart 起点是否画圆帽
   * @param capEnd 终点是否画圆帽（连接头部时为false）
   */
  private drawRoundedPipe(
    g: Phaser.GameObjects.Graphics,
    pts: Point[],
    color: number,
    alpha: number,
    capStart: boolean = true,
    capEnd: boolean = false
  ): void {
    if (pts.length < 2) return;

    const r = this.thickness / 2;
    // overlap 用来让主体伸进箭头头部一点，防止抗锯齿缝隙
    const overlap = Math.max(1, Math.floor(r * 0.6));
    
    g.fillStyle(color, alpha);

    const lastIndex = pts.length - 1;

    // 逐段画"胶囊段"
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const isLastSegment = (i + 1) === lastIndex;

      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;

      // 只支持水平/垂直（网格路径）
      if (dx === 0 && dy === 0) continue;

      if (Math.abs(dx) >= Math.abs(dy)) {
        // 水平段
        const dir = Math.sign(dx) || 1;
        const x0 = Math.min(p0.x, p1.x);
        const w0 = Math.abs(dx);

        // 如果是最后一段，沿前进方向多画 overlap
        const x = (dir > 0) ? x0 : (x0 - overlap);
        const w = w0 + (isLastSegment && !capEnd ? overlap : 0);

        g.fillRect(x, p0.y - r, w, this.thickness);

        // 起点圆帽（如果是第一段且需要圆帽）
        if (i === 0 && capStart) {
          g.fillCircle(p0.x, p0.y, r);
        }

        // 终点如果接箭头头部：不要圆帽
        if (!isLastSegment || capEnd) {
          g.fillCircle(p1.x, p1.y, r);
        }
      } else {
        // 垂直段
        const dir = Math.sign(dy) || 1;
        const y0 = Math.min(p0.y, p1.y);
        const h0 = Math.abs(dy);

        const y = (dir > 0) ? y0 : (y0 - overlap);
        const h = h0 + (isLastSegment && !capEnd ? overlap : 0);

        g.fillRect(p0.x - r, y, this.thickness, h);

        // 起点圆帽（如果是第一段且需要圆帽）
        if (i === 0 && capStart) {
          g.fillCircle(p0.x, p0.y, r);
        }

        // 终点如果接箭头头部：不要圆帽
        if (!isLastSegment || capEnd) {
          g.fillCircle(p1.x, p1.y, r);
        }
      }
    }

    // 中间点补圆角，但最后点（接头部）不要补
    for (let i = 0; i < pts.length; i++) {
      if (i === lastIndex && !capEnd) continue; // 关键：不在终点补圆（如果不需要圆帽）
      if (i === 0 && !capStart) continue; // 起点如果不需要圆帽也不补
      const p = pts[i];
      g.fillCircle(p.x, p.y, r);
    }
  }

  /**
   * 绘制箭头头部（三角形）
   */
  private drawArrowHead(displayPoints: Point[]): void {
    this.drawArrowHeadWithColor(displayPoints, this.arrowData.color);
  }

  /**
   * 使用指定颜色绘制箭头头部（三角形）
   */
  private drawArrowHeadWithColor(displayPoints: Point[], color: number): void {
    if (displayPoints.length < 2) return;
    
    const lastPoint = displayPoints[displayPoints.length - 1];
    const dir = this.arrowData.direction;
    
    // 计算箭头头部的三个顶点
    // 顶点：沿方向延伸 headLen
    const tipX = lastPoint.x + dir.x * this.headLen;
    const tipY = lastPoint.y + dir.y * this.headLen;
    
    // 底边中心点稍微往回挪一点点，让三角形更多覆盖主体（防止缝隙）
    const r = this.thickness / 2;
    const baseCenterX = lastPoint.x - dir.x * Math.max(1, Math.floor(r * 0.3));
    const baseCenterY = lastPoint.y - dir.y * Math.max(1, Math.floor(r * 0.3));
    
    // 底边两个点：垂直于方向，距离 headWidth/2
    let perpX = -dir.y; // 垂直向量
    let perpY = dir.x;
    
    const halfWidth = this.headWidth / 2;
    const baseX1 = baseCenterX + perpX * halfWidth;
    const baseY1 = baseCenterY + perpY * halfWidth;
    const baseX2 = baseCenterX - perpX * halfWidth;
    const baseY2 = baseCenterY - perpY * halfWidth;
    
    // 先绘制一个稍大的背景三角形作为描边效果，突出头部
    const outlineWidth = Math.max(2, this.gridUnit * 0.05); // 描边宽度
    const outlineOffset = outlineWidth * 0.5;
    
    // 计算外层三角形的顶点（稍微外扩）
    const outlineTipX = tipX + dir.x * outlineOffset;
    const outlineTipY = tipY + dir.y * outlineOffset;
    const outlineBaseX1 = baseX1 - perpX * outlineOffset;
    const outlineBaseY1 = baseY1 - perpY * outlineOffset;
    const outlineBaseX2 = baseX2 + perpX * outlineOffset;
    const outlineBaseY2 = baseY2 + perpY * outlineOffset;
    
    // 绘制外层描边三角形（使用深色或白色描边）
    const outlineColor = 0x000000; // 黑色描边
    const outlineAlpha = 0.6; // 60% 透明度
    this.graphics.fillStyle(outlineColor, outlineAlpha);
    this.graphics.beginPath();
    this.graphics.moveTo(outlineTipX, outlineTipY);
    this.graphics.lineTo(outlineBaseX1, outlineBaseY1);
    this.graphics.lineTo(outlineBaseX2, outlineBaseY2);
    this.graphics.closePath();
    this.graphics.fillPath();
    
    // 绘制主三角形（覆盖在描边上）
    this.graphics.fillStyle(color, 1);
    this.graphics.beginPath();
    this.graphics.moveTo(tipX, tipY);
    this.graphics.lineTo(baseX1, baseY1);
    this.graphics.lineTo(baseX2, baseY2);
    this.graphics.closePath();
    this.graphics.fillPath();
  }


  /**
   * 设置高亮
   */
  public setHighlight(highlight: boolean): void {
    if (!this.highlightGraphics) return;
    
    if (highlight) {
      // 直接按照箭头的绘制方式重新绘制一个黄色箭头
      this.drawHighlightArrow(0xffff00, 0.7); // 黄色，70% 透明度
      this.highlightGraphics.setDepth(100);
      this.highlightGraphics.setVisible(true);
    } else {
      this.highlightGraphics.setVisible(false);
    }
  }

  /**
   * 在高亮图形上绘制箭头（使用指定颜色）
   */
  private drawHighlightArrow(color: number, alpha: number = 1): void {
    if (!this.highlightGraphics) return;
    
    this.highlightGraphics.clear();
    
    if (this.arrowData.keyPoints.length < 2) {
      return;
    }
    
    // 根据 offsetRate 生成显示点（与箭头绘制完全相同）
    const displayPoints = generateDisplayPoints(
      this.arrowData,
      this.offsetRate,
      this.gridUnit
    );
    
    // 绘制折线路径（使用指定颜色，带圆角）
    if (displayPoints.length >= 2) {
      // 使用相同的圆角管道绘制逻辑，终点不画圆帽
      this.drawRoundedPipe(this.highlightGraphics, displayPoints, color, alpha, true, false);
    }
    
    // 绘制箭头头部（使用指定颜色，与主体绘制逻辑一致）
    if (displayPoints.length >= 2) {
      const lastPoint = displayPoints[displayPoints.length - 1];
      const dir = this.arrowData.direction;
      
      const tipX = lastPoint.x + dir.x * this.headLen;
      const tipY = lastPoint.y + dir.y * this.headLen;
      
      // 底边中心点稍微往回挪一点点，让三角形更多覆盖主体（防止缝隙）
      const r = this.thickness / 2;
      const baseCenterX = lastPoint.x - dir.x * Math.max(1, Math.floor(r * 0.3));
      const baseCenterY = lastPoint.y - dir.y * Math.max(1, Math.floor(r * 0.3));
      
      let perpX = -dir.y;
      let perpY = dir.x;
      
      const halfWidth = this.headWidth / 2;
      const baseX1 = baseCenterX + perpX * halfWidth;
      const baseY1 = baseCenterY + perpY * halfWidth;
      const baseX2 = baseCenterX - perpX * halfWidth;
      const baseY2 = baseCenterY - perpY * halfWidth;
      
      // 高亮时也添加描边效果，使用白色或黄色描边
      const outlineWidth = Math.max(2, this.gridUnit * 0.05);
      const outlineOffset = outlineWidth * 0.5;
      const outlineColor = 0xffffff; // 白色描边（高亮时更明显）
      const outlineAlpha = alpha * 0.8;
      
      const outlineTipX = tipX + dir.x * outlineOffset;
      const outlineTipY = tipY + dir.y * outlineOffset;
      const outlineBaseX1 = baseX1 - perpX * outlineOffset;
      const outlineBaseY1 = baseY1 - perpY * outlineOffset;
      const outlineBaseX2 = baseX2 + perpX * outlineOffset;
      const outlineBaseY2 = baseY2 + perpY * outlineOffset;
      
      // 绘制外层描边三角形
      this.highlightGraphics.fillStyle(outlineColor, outlineAlpha);
      this.highlightGraphics.beginPath();
      this.highlightGraphics.moveTo(outlineTipX, outlineTipY);
      this.highlightGraphics.lineTo(outlineBaseX1, outlineBaseY1);
      this.highlightGraphics.lineTo(outlineBaseX2, outlineBaseY2);
      this.highlightGraphics.closePath();
      this.highlightGraphics.fillPath();
      
      // 绘制主三角形
      this.highlightGraphics.fillStyle(color, alpha);
      this.highlightGraphics.beginPath();
      this.highlightGraphics.moveTo(tipX, tipY);
      this.highlightGraphics.lineTo(baseX1, baseY1);
      this.highlightGraphics.lineTo(baseX2, baseY2);
      this.highlightGraphics.closePath();
      this.highlightGraphics.fillPath();
    }
  }

  /**
   * 设置红色闪烁（碰撞反馈）
   */
  public shineRed(): void {
    if (!this.highlightGraphics) return;
    
    // 直接按照箭头的绘制方式重新绘制一个红色箭头
    this.drawHighlightArrow(0xff0000, 0.8); // 红色，80% 透明度
    this.highlightGraphics.setVisible(true);
    
    // 闪烁动画
    this.scene.tweens.add({
      targets: this.highlightGraphics,
      alpha: { from: 0.8, to: 0.3 },
      duration: 100,
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        if (this.highlightGraphics) {
          this.highlightGraphics.setVisible(false);
          this.highlightGraphics.setAlpha(1);
        }
      }
    });
  }

  /**
   * 获取箭头ID
   */
  public getId(): string {
    return this.arrowData.id;
  }

  /**
   * 获取命中区域
   */
  public getHitArea(): Phaser.GameObjects.Zone | null {
    return this.hitArea;
  }

  /**
   * 获取箭头数据
   */
  public getArrowData(): ArrowRuntime {
    return this.arrowData;
  }

  /**
   * 设置 offsetRate（用于动画）
   */
  public setOffsetRate(offsetRate: number): void {
    this.offsetRate = offsetRate;
    this.draw();
    // 如果高亮可见，需要更新高亮效果
    if (this.highlightGraphics && this.highlightGraphics.visible) {
      this.drawHighlightArrow(0xffff00, 0.7);
    }
  }

  /**
   * 获取 offsetRate
   */
  public getOffsetRate(): number {
    return this.offsetRate;
  }

  /**
   * 设置动画状态
   */
  public setAnimating(animating: boolean): void {
    this.isAnimating = animating;
    // 动画期间禁用交互
    if (this.hitArea) {
      this.hitArea.setInteractive(!animating);
    }
  }

  /**
   * 获取动画状态
   */
  public getAnimating(): boolean {
    return this.isAnimating;
  }

  /**
   * 更新箭头数据（用于动画）
   */
  public updateArrowData(arrowData: ArrowRuntime): void {
    this.arrowData = arrowData;
    this.draw();
    
    // 更新 hitArea 的位置和大小（因为路径可能改变了）
    this.updateHitArea();
    
    // 如果高亮图形可见，需要更新它
    if (this.highlightGraphics && this.highlightGraphics.visible) {
      this.setHighlight(true);
    }
  }

  /**
   * 更新命中区域的位置和大小
   */
  private updateHitArea(): void {
    if (!this.hitArea || this.arrowData.keyPoints.length < 2) return;
    
    const hitPadding = Math.min(this.cellSizeX, this.cellSizeY) * 0.1; // 外扩10%
    
    
    // 计算边界框
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    this.arrowData.keyPoints.forEach(point => {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });
    
    const width = maxX - minX + hitPadding * 2;
    const height = maxY - minY + hitPadding * 2;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    // 更新 hitArea 的位置和大小
    this.hitArea.setPosition(centerX, centerY);
    this.hitArea.setSize(width, height);
  }

  /**
   * 销毁
   */
  public destroy(): void {
    this.graphics.destroy();
    if (this.highlightGraphics) {
      this.highlightGraphics.destroy();
    }
    if (this.hitArea) {
      this.hitArea.destroy();
    }
  }
}
