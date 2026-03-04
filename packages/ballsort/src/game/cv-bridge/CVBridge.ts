/**
 * CV Bridge - WebSocket client for Game <-> Python CV communication.
 * Captures frames from Phaser canvas, sends to CV server, waits for response.
 */

const WS_URL = 'ws://localhost:8765';

export interface CVResponse {
    status: string;
    detections?: Record<string, unknown>;
    error?: string;
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

    captureFrame(): string {
        const canvas = this.game.canvas;
        if (!canvas) return '';
        return canvas.toDataURL('image/jpeg', 0.8);
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
