/**
 * CV 自动 init 插件。当场景实现 getCvAdapter 时，在 create 后自动调用 initCvIntegration。
 */

import type { ICvSceneAdapter } from './CvSceneAdapter.js';
import { isCVModeEnabled } from '../cv-bridge/CVBridge.js';
import { initCvIntegration } from './CvIntegration.js';

export class CvAutoInitPlugin extends Phaser.Plugins.ScenePlugin {
  boot(): void {
    this.scene?.events.once('create', this.tryAutoInit, this);
  }

  private tryAutoInit(): void {
    const cvEnabled = isCVModeEnabled();
    // #region agent log
    if (typeof fetch !== 'undefined') {
      const search = typeof window !== 'undefined' ? window.location?.search : '';
      fetch('http://127.0.0.1:7727/ingest/2104fe52-dda1-4f44-a485-b3dec9559cf9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1a1f87'},body:JSON.stringify({sessionId:'1a1f87',location:'CvAutoInitPlugin.ts:tryAutoInit',message:'CV init check',data:{cvEnabled,sceneKey:this.scene?.scene?.key,search,hasAdapter:!!this.scene?.getCvAdapter},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
    }
    // #endregion
    if (!cvEnabled || !this.scene) return;
    const adapter = this.scene.getCvAdapter?.();
    if (!adapter) {
      console.warn('[CV] getCvAdapter 未实现，CV 未初始化。主场景需实现 getCvAdapter() 返回 ICvSceneAdapter。运行 npm run cv:check 检查接入。');
      return;
    }
    // #region agent log
    if (typeof fetch !== 'undefined') {
      fetch('http://127.0.0.1:7727/ingest/2104fe52-dda1-4f44-a485-b3dec9559cf9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1a1f87'},body:JSON.stringify({sessionId:'1a1f87',location:'CvAutoInitPlugin.ts:tryAutoInit',message:'initCvIntegration called',data:{sceneKey:(this.scene as any)?.scene},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
    }
    // #endregion
    initCvIntegration(this.scene!, adapter as ICvSceneAdapter);
  }
}
