/**
 * CV 集成模块：封装完整 CV 逻辑（连接、截帧、S/R 键）。
 * 新项目只需提供 getRootRenderable、getStaticTintables 等回调即可接入。
 * getColorMapIds 可选：根实现 getCvChildren 时由 collectAllCvIds 自动推导。
 */

import type { ColorMap } from '../render/ObjectIdPipeline';
import type { CvTintable, ICvRenderable, ICvTraversable } from '../render/CvColorCode';
import { generateColorMap, extractValidPixels } from '../render/ObjectIdPipeline';
import { applyCvTintables, collectAllCvIds } from '../render/CvColorCode';
import type { CVResponse } from '../cv-bridge/CVBridge';
import { isCVModeEnabled, getCVBridge, destroyCVBridge } from '../cv-bridge/CVBridge';
import { getOutputConfigValue } from '../../utils/outputConfigLoader';

const ID_BACKGROUND = 9999;
const CV_DOWNSAMPLE = 4;

export interface CvIntegrationOptions {
  /** 所有参与 CV 的对象 ID（不含背景，Integration 自动加 9999）。可选：当 getRootRenderable 返回 ICvTraversable 且提供 getStaticCvIds 时可自动推导 */
  getColorMapIds?: () => number[];
  /** 静态 ID（hand、icon、download、liquid、expression 等），用于 getColorMapIds 自动推导 */
  getStaticCvIds?: () => number[];
  /** 根 ICvRenderable（如 Board） */
  getRootRenderable: () => ICvRenderable;
  /** 静态 tintables（背景、按钮等） */
  getStaticTintables: () => CvTintable[];
  /** 截帧时需隐藏的对象（cvStepText 由 Integration 自动加入） */
  getElementsToHide?: () => Phaser.GameObjects.GameObject[];
  /** 当前帧活跃 ID，供 CV 服务过滤 */
  getActiveIds?: () => number[];
  /** 根据 response 生成 step 文案后缀 */
  formatStepSuffix?: (response: CVResponse) => string;
}

/**
 * 初始化 CV 模式：连接 WebSocket、显示状态文案、注册 S/R 键、实现完整截帧逻辑。
 * 在场景 create() 中调用，若 URL 无 ?cv=1 则直接返回。
 * 会在 scene 上挂载 captureColorCodedFrame，供 CVBridge / App 的 cv-capture-frame 使用。
 */
export function initCvIntegration(scene: Phaser.Scene, options: CvIntegrationOptions): void {
  if (!isCVModeEnabled()) return;

  const {
    getColorMapIds: providedGetColorMapIds,
    getStaticCvIds = () => [],
    getRootRenderable,
    getStaticTintables,
    getElementsToHide = () => [],
    getActiveIds = () => [],
    formatStepSuffix = () => ''
  } = options;

  const getColorMapIds = (): number[] => {
    if (providedGetColorMapIds) return providedGetColorMapIds();
    const root = getRootRenderable();
    if ('getCvChildren' in root && typeof (root as ICvTraversable).getCvChildren === 'function') {
      return collectAllCvIds(root as ICvTraversable, getStaticCvIds());
    }
    throw new Error('[CV] getColorMapIds required when root does not implement getCvChildren');
  };

  const bridge = getCVBridge(scene.game);

  const cvStepText = scene.add.text(scene.scale.width / 2, 60, 'CV: Connecting...', {
    fontFamily: 'monospace',
    fontSize: '20px',
    color: '#00ff88',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: { x: 12, y: 8 }
  });
  cvStepText.setOrigin(0.5, 0);
  cvStepText.setDepth(20001);
  cvStepText.setScrollFactor(0);

  let waitingForCV = true;
  let cvStepCount = 0;
  const urlParams = new URLSearchParams(window.location.search);
  const autoMode = urlParams.get('auto') === '1';

  // 颜色映射缓存
  let colorMapCache: ColorMap | null = null;
  let idToColorCache: Map<number, number> | null = null;

  const ensureColorMap = (): { colorMap: ColorMap; idToColor: Map<number, number> } => {
    if (colorMapCache && idToColorCache) {
      return { colorMap: colorMapCache, idToColor: idToColorCache };
    }
    const allIds = [...getColorMapIds(), ID_BACKGROUND];
    const result = generateColorMap(allIds);
    colorMapCache = result.colorMap;
    idToColorCache = result.idToColor;
    return result;
  };

  const captureColorCodedFrame = (): {
    pixels: string;
    width: number;
    height: number;
    colorMap: ColorMap;
  } => {
    const { colorMap, idToColor } = ensureColorMap();
    const root = getRootRenderable();
    const boardResult = root.prepareCvRender(idToColor);
    const allTintables = [...getStaticTintables(), ...boardResult.tintables];
    const restoreTint = applyCvTintables(allTintables, idToColor);

    const elementsToHide = [cvStepText, ...getElementsToHide()];
    const savedVisibility = elementsToHide.map((el) => (el as any)?.visible ?? false);
    elementsToHide.forEach((el) => {
      if (el && typeof (el as any).setVisible === 'function') (el as any).setVisible(false);
    });

    const renderer = scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    renderer.preRender();
    scene.children.depthSort();
    (scene.cameras as any).render(renderer, scene.children, 1);
    renderer.postRender();

    const keepBlended = getOutputConfigValue<boolean>('cv.keepBlendedPixels', false);
    const pixels = extractValidPixels(scene.game.canvas, colorMap, CV_DOWNSAMPLE, {
      keepBlendedPixels: keepBlended
    });

    restoreTint();
    boardResult.restore();
    elementsToHide.forEach((el, i) => {
      if (el && typeof (el as any).setVisible === 'function') (el as any).setVisible(savedVisibility[i]);
    });

    renderer.preRender();
    scene.children.depthSort();
    (scene.cameras as any).render(renderer, scene.children, 1);
    renderer.postRender();

    const w = Math.round(scene.game.canvas.width / CV_DOWNSAMPLE);
    const h = Math.round(scene.game.canvas.height / CV_DOWNSAMPLE);
    return { pixels, width: w, height: h, colorMap };
  };

  // 挂载到 scene，供 CVBridge / App 的 cv-capture-frame 使用
  (scene as any).captureColorCodedFrame = captureColorCodedFrame;

  const stepOneFrame = async () => {
    if (!bridge.isConnected()) {
      console.log('[CV] stepOneFrame skipped: bridge not connected');
      return;
    }
    if (autoMode && waitingForCV) return;
    waitingForCV = true;
    cvStepText.setText('CV: Processing...');

    try {
      const frame = captureColorCodedFrame();
      const activeIds = getActiveIds();
      const response = await bridge.sendFrameAndWait(
        { pixels: frame.pixels, width: frame.width, height: frame.height },
        frame.colorMap,
        activeIds.length > 0 ? activeIds : undefined
      );
      cvStepCount++;
      const suffix = formatStepSuffix(response);
      cvStepText.setText(
        autoMode
          ? `CV: Step ${cvStepCount}${suffix}`
          : `CV: Step ${cvStepCount}${suffix} - Press S`
      );
      if (!autoMode) {
        scene.scene.resume();
        scene.events.once('postupdate', () => scene.scene.pause());
      }
    } catch (err) {
      console.error('[CV] error:', err);
      cvStepText.setText('CV: Error - Press S');
    } finally {
      if (autoMode) waitingForCV = false;
    }
  };

  bridge.connect().then(() => {
    cvStepText.setText(autoMode ? 'CV: R恢复 S截帧' : 'CV: R恢复 S截帧');
    const handler = (e: KeyboardEvent) => {
      if (e.key === 's' || e.key === 'S') stepOneFrame();
      else if (e.key === 'r' || e.key === 'R') {
        scene.scene.resume();
        cvStepText.setText('CV: 运行中 - 点击试管后按 S 截帧');
      }
    };
    document.addEventListener('keydown', handler);
    scene.events.once('shutdown', () => document.removeEventListener('keydown', handler));
    scene.scene.pause();
  }).catch((err) => {
    console.error('[CV] Failed to connect', err);
    cvStepText.setText('CV: Connection failed');
  });

  scene.events.once('shutdown', () => {
    destroyCVBridge();
    cvStepText.destroy();
    delete (scene as any).captureColorCodedFrame;
  });
}
