/**
 * CV 颜色编码统一接口
 * - Tintable：纹理对象（Image/Sprite）用 setTintFill
 * - Graphics Drawer：无纹理对象用 fillStyle + fillRect
 * - ICvTintableProvider / ICvRenderable：脚本对象实现接口参与 CV 渲染
 */

// ── Tintable（纹理对象：Image / Sprite）──

export interface CvTintable {
    obj: Phaser.GameObjects.GameObject;
    id: number;
    /** 可选，默认 clearTint */
    restore?: () => void;
}

/**
 * 对 tintables 应用 ID 颜色（方案 B：仅对 obj.visible 的对象 tint）。
 * 返回 restore 函数，用于截帧后恢复。
 */
export function applyCvTintables(
    tintables: CvTintable[],
    idToColor: Map<number, number>,
): () => void {
    const toRestore: CvTintable[] = [];
    for (const t of tintables) {
        if (!(t.obj as any)?.visible) continue;
        const setTint = (t.obj as any).setTintFill;
        if (typeof setTint !== 'function') continue;
        setTint.call(t.obj, idToColor.get(t.id) ?? 0x888888);
        toRestore.push(t);
    }
    return () => {
        for (const t of toRestore) {
            if (t.restore) t.restore();
            else {
                const clearTint = (t.obj as any).clearTint;
                if (typeof clearTint === 'function') clearTint.call(t.obj);
            }
        }
    };
}

// ── Graphics Drawer（无纹理对象：fillStyle + fillRect）──

/** Graphics 绘制：用 idToColor 绘制，返回 restore。用于无纹理的 fillStyle + fillRect。 */
export type CvGraphicsDrawer<T = unknown> = (
    idToColor: Map<number, number>,
) => { restore: () => void; data?: T };

/** 多 drawer 场景：依次执行各 drawer，返回组合 restore。 */
export function applyCvGraphicsDrawers(
    drawers: CvGraphicsDrawer[],
    idToColor: Map<number, number>,
): () => void {
    const restores = drawers.map((d) => d(idToColor).restore);
    return () => restores.forEach((r) => r());
}

// ── 遍历与 ID 收集（供 getColorMapIds 抽象）──

/** 可提供 cvId 的对象（Ball、Tube 等）。 */
export interface ICvIdProvider {
  cvId: number;
}

/** 可遍历子对象的容器（Board、Tube 等）。 */
export interface ICvTraversable {
  getCvChildren(): Array<ICvIdProvider | ICvTraversable>;
}

/**
 * 从根节点递归收集所有 cvId，合并 staticIds。
 * 用于 getColorMapIds 的通用实现。
 */
export function collectAllCvIds(
  root: ICvTraversable,
  staticIds: number[] = []
): number[] {
  const ids = new Set<number>(staticIds);

  function visit(node: ICvIdProvider | ICvTraversable): void {
    if ('cvId' in node) ids.add(node.cvId);
    if ('getCvChildren' in node) {
      for (const child of (node as ICvTraversable).getCvChildren()) {
        visit(child);
      }
    }
  }
  visit(root);
  return Array.from(ids);
}

// ── 对象接口（供脚本 implement）──

/** 叶子对象，如 Ball，提供 getCvTintables。 */
export interface ICvTintableProvider {
    getCvTintables(): CvTintable[];
}

/** 组合对象，如 Tube、Board，提供 prepareCvRender。 */
export interface ICvRenderable {
    prepareCvRender(idToColor: Map<number, number>): { tintables: CvTintable[]; restore: () => void };
}
