/**
 * CV Bridge - WebSocket client for Game <-> Python CV communication.
 * Captures frames from Phaser canvas, sends to CV server, waits for response.
 */

import type { ColorMap } from '../render/ObjectIdPipeline';

const WS_URL = 'ws://localhost:8765';

export interface CVResponse {
    status: string;
    detections?: Record<string, unknown>;
    error?: string;
}

/** Compact pixel frame — replaces base64 PNG; only non-transparent pixels are included. */
export interface PixelFrameData {
    /**
     * Binary-packed pixels encoded as base64.
     * Each pixel is 7 bytes: [x_lo, x_hi, y_lo, y_hi, r, g, b] (x/y as uint16 little-endian).
     */
    pixels: string;
    width: number;
    height: number;
}

export class CVBridge {
    private ws: WebSocket | null = null;
    private pendingResolve: ((value: CVResponse) => void) | null = null;
    private game: Phaser.Game;

    constructor(game: Phaser.Game) {
        this.game = game;
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
        // 透明背景合成到白色，便于 CV 颜色检测
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

    /**
     * Capture a color-coded frame for CV detection by delegating to the Game scene.
     * Returns compact pixel data (non-transparent pixels only) instead of a full PNG.
     */
    captureColorCodedFrame(): PixelFrameData | null {
        const gameScene = this.game.scene.getScene('Game') as any;
        if (!gameScene || typeof gameScene.captureColorCodedFrame !== 'function') {
            console.warn('[CV-COLOR] Game scene not available for color-coded capture');
            return null;
        }
        return gameScene.captureColorCodedFrame();
    }

    sendFrameAndWait(frameData: PixelFrameData, colorMap?: ColorMap, activeIds?: number[]): Promise<CVResponse> {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error('CV server not connected'));
                return;
            }
            if (this.pendingResolve) {
                reject(new Error('Already waiting for response'));
                return;
            }
            const timeout = setTimeout(() => {
                if (this.pendingResolve) {
                    this.pendingResolve = null;
                    reject(new Error('CV server response timeout (10s)'));
                    console.warn('[CV] sendFrameAndWait timeout after 10s');
                }
            }, 10000);
            const wrappedResolve = (v: CVResponse) => {
                clearTimeout(timeout);
                resolve(v);
            };
            this.pendingResolve = wrappedResolve;
            const msg: Record<string, unknown> = { pixelData: frameData };
            if (colorMap) msg.colorMap = colorMap;
            if (activeIds) msg.activeIds = activeIds;
            const serialized = JSON.stringify(msg);
            this.ws.send(serialized);
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
