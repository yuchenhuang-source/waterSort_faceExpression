/**
 * 游戏资源虚拟模块类型声明
 */
declare module 'virtual:game-assets' {
  /**
   * 资源对象类型
   */
  interface Asset {
    /** 资源的完整URL或data URI */
    url: string;
    /** 资源类型 */
    type: string;
  }

  /**
   * 所有可用资源的映射
   */
  const assets: Record<string, Asset>;
  
  /**
   * 在Phaser场景中加载所有资源
   * @param scene Phaser场景对象
   */
  export function loadAllAssets(scene: Phaser.Scene): void;

  /**
   * 按分组在Phaser场景中加载资源（如 'audio'）
   * @param scene Phaser场景对象
   * @param groupName 分组名称
   */
  export function loadAssetGroup(scene: Phaser.Scene, groupName: string): void;

  /**
   * 获取指定资源的URL
   * @param key 资源键名
   * @returns 资源URL或null（如果资源不存在）
   */
  export function getAsset(key: string): string | null;

  export function getAssetGroup(groupName: string): Record<string, Asset>;

  export default assets;
}