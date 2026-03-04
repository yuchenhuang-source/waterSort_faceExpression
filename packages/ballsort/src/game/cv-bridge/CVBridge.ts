/**
 * CV Bridge - WebSocket client for Game <-> Python CV communication.
 * Captures frames from Phaser canvas, sends to CV server, waits for response.
 * Phase 2: Runtime CV debug mode toggle (smooth switch between normal and ArUco visuals).
 */

import { EventBus } from '../EventBus';

const WS_URL = 'ws://localhost:8765';

export const CV_MODE_CHANGED = 'cv-mode-changed';

export interface CVResponse {
    status: string;
    detections?: Record<string, unknown>;
    error?: string;
}

export class CVBridge {
    private ws: WebSocket | null = null;
    private pendingResolve: ((value: CVResponse) => void) | null = null;
    private game: Phaser.Game;
    /** Phase 2: Runtime CV debug mode - toggles ArUco vs normal visuals */
    private cvDebugMode: boolean = false;

    constructor(game: Phaser.Game) {
        this.game = game;
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            this.cvDebugMode = params.get('cv') === '1';
        }
    }

    /** Phase 2: Get current CV debug mode (ArUco visuals) */
    isCVDebugMode(): boolean {
        return this.cvDebugMode;
    }

    /** Phase 2: Toggle CV debug mode. Emits cv-mode-changed for Board/UI to react. */
    setCVDebugMode(enabled: boolean): void {
        if (this.cvDebugMode === enabled) return;
        this.cvDebugMode = enabled;
        console.log('[CV-TEST] setCVDebugMode', enabled);
        EventBus.emit(CV_MODE_CHANGED, enabled);
        console.log('[CV-TEST] emitted cv-mode-changed');
    }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(WS_URL);
            this.ws.onopen = () => {
                console.log('[CV] Connected to CV server');
                resolve();
            };
            this.ws.onclose = () => {
                console.log('[CV] Disconnected from CV server');
                if (this.pendingResolve) {
                    this.pendingResolve({ status: 'error', error: 'Connection closed' });
                    this.pendingResolve = null;
                }
            };
            this.ws.onerror = (err) => {
                console.error('[CV] WebSocket error', err);
                reject(err);
            };
            this.ws.onmessage = (ev) => {
                try {
                    const data = JSON.parse(ev.data as string) as CVResponse;
                    // Ignore broadcasts (type: frame_processed) - we only care about direct response
                    if ('type' in data && data.type === 'frame_processed') {
                        return;
                    }
                    if (this.pendingResolve) {
                        this.pendingResolve(data);
                        this.pendingResolve = null;
                    }
                } catch (e) {
                    console.error('[CV] Parse error', e);
                    if (this.pendingResolve) {
                        this.pendingResolve({ status: 'error', error: String(e) });
                        this.pendingResolve = null;
                    }
                }
            };
        });
    }

    isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    /**
     * Capture the game canvas. This captures ONLY what Phaser renders - no editor UI,
     * simulator frame, toolbar, or DOM overlays. When run in the simulator iframe
     * (?simulator=1), the canvas is the game's render target; the device frame and
     * constants editor are in the parent window and are not included.
     */
    captureFrame(): string {
        const canvas = this.game.canvas;
        if (!canvas) {
            console.warn('[CV] captureFrame: no canvas');
            return '';
        }
        // 透明背景合成到白色，避免黑底导致 ArUco 不可见
        const offscreen = document.createElement('canvas');
        offscreen.width = canvas.width;
        offscreen.height = canvas.height;
        const ctx = offscreen.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, offscreen.width, offscreen.height);
            ctx.drawImage(canvas, 0, 0);
        }
        const data = (ctx ? offscreen : canvas).toDataURL('image/png');
        console.log('[CV] captureFrame w=' + canvas.width + ' h=' + canvas.height + ' dataLen=' + data.length);
        return data;
    }

    sendFrameAndWait(frameBase64: string): Promise<CVResponse> {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error('CV server not connected'));
                return;
            }
            if (this.pendingResolve) {
                reject(new Error('Already waiting for response'));
                return;
            }
            this.pendingResolve = resolve;
            this.ws.send(JSON.stringify({ frame: frameBase64 }));
        });
    }

    disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.pendingResolve = null;
    }
}

let cvBridgeInstance: CVBridge | null = null;

export function isCVModeEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('cv') === '1';
}

export function getCVBridge(game: Phaser.Game): CVBridge {
    if (!cvBridgeInstance) {
        cvBridgeInstance = new CVBridge(game);
    }
    return cvBridgeInstance;
}

export function destroyCVBridge(): void {
    if (cvBridgeInstance) {
        cvBridgeInstance.disconnect();
        cvBridgeInstance = null;
    }
}
