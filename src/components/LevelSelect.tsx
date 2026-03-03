import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './LevelSelect.css';
import icon from '../assets/icon.png';
import hand from '../assets/手.png';
import chooseImg from '../assets/choose.png';
import playNowImg from '../assets/play-now.png';
import download from '../game/scenes/constants/download';
import LevelPreview from './LevelPreview';
import { Config } from '../game/constants/GameConstants';

export interface LevelSelectProps {
  onSelectLevel: (level: number) => void;
}

interface HandState {
  left: number;
  top: number;
  visible: boolean;
}

/** width 根据视口适配，height 可配置 */
function getPreviewSize(): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: 120, height: 180 };
  const isPortrait = window.innerHeight > window.innerWidth;
  const widthRatio = isPortrait
    ? (Config.UI_CONFIG?.LEVEL_SELECT?.PREVIEW_WIDTH_RATIO_PORTRAIT ?? 0.15)
    : (Config.UI_CONFIG?.LEVEL_SELECT?.PREVIEW_WIDTH_RATIO_LANDSCAPE ?? 0.15);
  const width = Math.round(window.innerWidth * widthRatio);
  const height = isPortrait
    ? (Config.UI_CONFIG?.LEVEL_SELECT?.PREVIEW_HEIGHT_PORTRAIT ?? 180)
    : (Config.UI_CONFIG?.LEVEL_SELECT?.PREVIEW_HEIGHT_LANDSCAPE ?? 120);
  return { width, height };
}

/** 与 dof 竖版选关页面一致，3 个假关卡对应难度 1/5/9 */
const LevelSelect: React.FC<LevelSelectProps> = ({ onSelectLevel }) => {
  const [previewSize, setPreviewSize] = useState(getPreviewSize);
  const previewWidth = previewSize.width;
  const previewHeight = previewSize.height;

  useEffect(() => {
    const onResize = () => setPreviewSize(getPreviewSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const levels = useMemo(
    () => [
      { id: 1, difficulty: 1 },
      { id: 2, difficulty: 5 },
      { id: 3, difficulty: 9 }
    ],
    []
  );
  const levelCount = levels.length;

  const levelRefs = useRef<Array<HTMLDivElement | null>>([]);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const activeIndexRef = useRef(0);
  const [handState, setHandState] = useState<HandState>({
    left: 0,
    top: 0,
    visible: false
  });
  const [currentCardIndex, setCurrentCardIndex] = useState<number>(-1);
  const [isSimulatingClick, setIsSimulatingClick] = useState(false);
  const handConfig = Config.UI_CONFIG.HAND_ANIMATION;

  const updateHandPosition = useCallback(
    (cardIndex: number) => {
      const gridEl = gridRef.current;
      const cardEl = levelRefs.current[cardIndex];

      if (!gridEl || !cardEl) {
        return false;
      }

      const gridRect = gridEl.getBoundingClientRect();
      const cardRect = cardEl.getBoundingClientRect();

      const targetLeft =
        cardRect.left - gridRect.left + cardRect.width * handConfig.offsetX;
      const targetTop =
        cardRect.top - gridRect.top + cardRect.height * handConfig.offsetY;

      setHandState({
        left: targetLeft,
        top: targetTop,
        visible: true
      });
      activeIndexRef.current = cardIndex;

      return true;
    },
    []
  );

  useEffect(() => {
    let moveTimer: number | null = null;
    let tapTimer: number | null = null;
    let pauseTimer: number | null = null;
    let kickoffTimer: number | null = null;
    let rafId: number | null = null;
    let highlightTimer: number | null = null;

    const runCycle = (index: number) => {
      setCurrentCardIndex(-1);
      if (highlightTimer) {
        window.clearTimeout(highlightTimer);
        highlightTimer = null;
      }
      const positioned = updateHandPosition(index);

      if (!positioned) {
        rafId = requestAnimationFrame(() => runCycle(index));
        return;
      }

      // 手指移动到位 → 等待 waitAfterMove → 点击
      moveTimer = window.setTimeout(() => {
        setIsSimulatingClick(true);
        highlightTimer = window.setTimeout(() => {
          setCurrentCardIndex(index);
          highlightTimer = null;
        }, 200);

        tapTimer = window.setTimeout(() => {
          if (highlightTimer) {
            window.clearTimeout(highlightTimer);
            highlightTimer = null;
          }
          setIsSimulatingClick(false);
          setCurrentCardIndex(-1);
          const nextIndex = (index + 1) % levelCount;

          pauseTimer = window.setTimeout(
            () => runCycle(nextIndex),
            handConfig.idleDuration
          );
        }, handConfig.tapDuration);
      }, handConfig.moveDuration + (handConfig.waitAfterMove ?? 0));
    };

    kickoffTimer = window.setTimeout(
      () => runCycle(activeIndexRef.current),
      500
    );

    return () => {
      if (moveTimer) window.clearTimeout(moveTimer);
      if (tapTimer) window.clearTimeout(tapTimer);
      if (pauseTimer) window.clearTimeout(pauseTimer);
      if (kickoffTimer) window.clearTimeout(kickoffTimer);
      if (highlightTimer) window.clearTimeout(highlightTimer);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [levelCount, updateHandPosition]);

  useEffect(() => {
    const handleResize = () => {
      updateHandPosition(activeIndexRef.current);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateHandPosition]);

  const handPointerClassName = [
    'hand-pointer',
    handState.visible ? 'is-visible' : '',
    isSimulatingClick ? 'is-tapping' : ''
  ]
    .filter(Boolean)
    .join(' ');

  const handlePlayNow = useCallback(() => {
    download();
  }, []);

  return (
    <div className="level-select-container">
      <div className="level-select-content">
        <div className="left-section">
          <div
            className="game-logo-section"
            style={{
              transform: `translate(${Config.UI_CONFIG?.LEVEL_SELECT?.LOGO_OFFSET_X ?? 0}px, ${Config.UI_CONFIG?.LEVEL_SELECT?.LOGO_OFFSET_Y ?? 0}px)`
            }}
          >
            <div className="game-icon-wrapper" style={{ ['--logo-scale' as string]: String(Config.UI_CONFIG?.LEVEL_SELECT?.LOGO_SCALE ?? 1.08) }}>
              <img src={icon} alt="Game Icon" className="game-icon" />
            </div>
            <h2 className="game-title">Water Sort</h2>
          </div>
          <button className="play-now-btn landscape-only" onClick={handlePlayNow}>
            <img src={playNowImg} alt="Play Now" className="play-now-bg" />
            <span className="play-now-text">PLAY NOW</span>
          </button>
        </div>

        <div className="right-section">
          <div className="level-title-wrapper">
            <div className="level-select-title">
              <img src={chooseImg} alt="Choose the next level" className="choose-bg" />
              <span className="choose-text">Choose the next level</span>
            </div>
          </div>

          <div className="level-select-grid" ref={gridRef}>
            {levels.map((level, index) => {
              const cardClassName = [
                'level-card',
                currentCardIndex === index ? 'is-highlighted' : '',
                isSimulatingClick && currentCardIndex === index
                  ? 'is-pressed'
                  : ''
              ]
                .filter(Boolean)
                .join(' ');

              const ls = Config.UI_CONFIG?.LEVEL_SELECT;
              const borderWidth = ls?.PREVIEW_BORDER_WIDTH ?? 2;
              const borderColor = ls?.PREVIEW_BORDER_COLOR ?? '#ffffff';
              const borderRadius = ls?.PREVIEW_BORDER_RADIUS ?? 8;

              return (
                <div
                  key={level.id}
                  className={cardClassName}
                  ref={el => {
                    levelRefs.current[index] = el;
                  }}
                  onClick={() => onSelectLevel(level.difficulty)}
                  style={{
                    width: previewWidth,
                    height: previewHeight,
                    border: `${borderWidth}px solid ${borderColor}`,
                    borderRadius: `${borderRadius}px`
                  }}
                >
                  <div className="level-image-wrapper">
                    <LevelPreview difficulty={level.difficulty} maxTubes={5} />
                  </div>
                </div>
              );
            })}
            <div
              className={handPointerClassName}
              style={{
                left: handState.left,
                top: handState.top,
                ['--hand-move-transition' as string]: `${handConfig.handMoveTransition}s`,
                ['--hand-tap-duration' as string]: `${handConfig.handTapDuration}s`
              }}
            >
              <img src={hand} alt="Hand" className="hand-icon" />
            </div>
          </div>

          <button className="play-now-btn portrait-only" onClick={handlePlayNow}>
            <img src={playNowImg} alt="Play Now" className="play-now-bg" />
            <span className="play-now-text">PLAY NOW</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default LevelSelect;
