/**
 * 为 CV 返回的 objects 数组附加 label 字段。
 * 用于将 cvId 映射为可读对象名（tube1, ball_108, hand 等）。
 */
export function attachLabels<T extends { id: number }>(
    objects: T[],
    idToLabel: Map<number, string>
): (T & { label: string })[] {
    return objects.map((o) => ({ ...o, label: idToLabel.get(o.id) ?? `id${o.id}` }));
}
