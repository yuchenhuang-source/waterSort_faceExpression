import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import video169 from '@/assets/169.mp4';
import video916 from '@/assets/916.mp4';
import './IntroVideo.css';

interface IntroVideoProps {
  /** 为 true 时不渲染（如编辑器模式） */
  skip?: boolean;
}

/** 横屏用 169.mp4，竖屏用 916.mp4 */
function getVideoSrcForOrientation(): string {
  if (typeof window === 'undefined') return video916;
  return window.innerWidth > window.innerHeight ? video169 : video916;
}

/**
 * 可玩广告开场视频：横屏播 169.mp4，竖屏播 916.mp4，播放完淡出；播放中横竖屏切换会切换对应视频
 */
export function IntroVideo({ skip = false }: IntroVideoProps) {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // 入场时根据当前横竖屏选定视频
  useLayoutEffect(() => {
    if (!skip && visible) {
      setVideoSrc(getVideoSrcForOrientation());
    }
  }, [skip, visible]);

  // 播放中监听 resize，横竖屏变化时切换视频
  useEffect(() => {
    if (skip || !visible || fading) return;
    const onResize = () => {
      const nextSrc = getVideoSrcForOrientation();
      setVideoSrc((prev) => (prev !== nextSrc ? nextSrc : prev));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [skip, visible, fading]);

  // 选定视频后加载并播放
  useEffect(() => {
    if (skip || !visible || !videoSrc) return;
    const video = videoRef.current;
    if (!video) return;
    video.load();
    video.play().catch(() => {
      setVisible(false);
    });
  }, [skip, visible, videoSrc]);

  const handleEnded = () => {
    setFading(true);
    setTimeout(() => setVisible(false), 500);
  };

  if (skip || !visible || !videoSrc) return null;

  return (
    <div
      className={`intro-video-wrap ${fading ? 'intro-video-fade-out' : ''}`}
      aria-hidden
    >
      <video
        ref={videoRef}
        className="intro-video"
        src={videoSrc}
        muted
        playsInline
        onEnded={handleEnded}
      />
    </div>
  );
}
