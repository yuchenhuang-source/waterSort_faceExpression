import { useEffect, useState } from 'react';

/**
 * 开发模式下在右上角显示帧数（FPS）
 */
export default function FpsDisplay() {
    const [fps, setFps] = useState(0);

    useEffect(() => {
        if (!import.meta.env.DEV) return;

        let frameCount = 0;
        let lastTime = performance.now();
        let rafId: number;

        const tick = () => {
            frameCount++;
            const now = performance.now();
            const elapsed = now - lastTime;
            if (elapsed >= 1000) {
                const currentFps = Math.round((frameCount * 1000) / elapsed);
                setFps(currentFps);
                console.log(`[FPS] ${currentFps}`);
                frameCount = 0;
                lastTime = now;
            }
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);

        return () => cancelAnimationFrame(rafId);
    }, []);

    if (!import.meta.env.DEV) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: 8,
                right: 8,
                zIndex: 9999,
                padding: '4px 8px',
                background: 'rgba(0,0,0,0.6)',
                color: '#0f0',
                fontFamily: 'monospace',
                fontSize: 14,
                borderRadius: 4,
                pointerEvents: 'none'
            }}
        >
            {fps} FPS
        </div>
    );
}
