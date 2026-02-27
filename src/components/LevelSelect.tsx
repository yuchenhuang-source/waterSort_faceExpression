import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './LevelSelect.css';
import icon from '../assets/icon.png';
import hand from '../assets/手.png';
import chooseImg from '../assets/choose.png';
import playNowImg from '../assets/play-now.png';
import download from '../game/scenes/constants/download';

export interface LevelSelectProps {
  onSelectLevel: (level: number) => void;
}

interface HandState {
  left: number;
  top: number;
  visible: boolean;
}

const HAND_CONFIG = {
  moveDuration: 600,
  tapDuration: 500,
  idleDuration: 500,
  offsetX: 0.82,
  offsetY: 0.78
};

/** logo 缩放倍数：>1 放大，<1 缩小，容器框大小不变 */
const LOGO_SCALE = 1.08;

/** 与 dof 竖版选关页面一致，3 个假关卡对应难度 1/5/9 */
const LevelSelect: React.FC<LevelSelectProps> = ({ onSelectLevel }) => {
  const levels = useMemo(
    () => [
      { id: 1, image: icon, difficulty: 1 },
      { id: 2, image: icon, difficulty: 5 },
      { id: 3, image: icon, difficulty: 9 }
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
        cardRect.left - gridRect.left + cardRect.width * HAND_CONFIG.offsetX;
      const targetTop =
        cardRect.top - gridRect.top + cardRect.height * HAND_CONFIG.offsetY;

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
            HAND_CONFIG.idleDuration
          );
        }, HAND_CONFIG.tapDuration);
      }, HAND_CONFIG.moveDuration);
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
          <div className="game-logo-section">
            <div className="game-icon-wrapper" style={{ ['--logo-scale' as string]: String(LOGO_SCALE) }}>
              <img src={icon} alt="Game Icon" className="game-icon placeholder-img" />
            </div>
            <h2 className="game-title">Ball Sort</h2>
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

              return (
                <div
                  key={level.id}
                  className={cardClassName}
                  ref={el => {
                    levelRefs.current[index] = el;
                  }}
                  onClick={() => onSelectLevel(level.difficulty)}
                >
                  <div className="level-image-wrapper">
                    <img
                      src={level.image}
                      alt={`Level ${level.id}`}
                      className="level-image placeholder-img"
                    />
                  </div>
                </div>
              );
            })}
            <div
              className={handPointerClassName}
              style={{ left: handState.left, top: handState.top }}
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
