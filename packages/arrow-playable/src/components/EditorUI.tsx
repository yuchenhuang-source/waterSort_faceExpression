// 编辑器 UI 组件

import { useState, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { EventBus, EVENT_NAMES } from '../game/EventBus';
import { getLevelDataAsync } from '../game/config/level-config';
import { getOutputConfigAsync } from '../utils/outputConfigLoader';
import { runImageImport } from '../utils/imageImport';
import './EditorUI.css';

interface EditorState {
  gridWidth: number;
  gridHeight: number;
  cellSizeX: number;
  cellSizeY: number;
  selectedArrowId: string | null;
  currentColor: string;
  zoom: number;
}

interface MiniMapCameraState {
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
  zoom: number;
}

interface MiniMapState {
  gridWidth: number;
  gridHeight: number;
  cellSizeX: number;
  cellSizeY: number;
  offsetX: number;
  offsetY: number;
  visible: boolean;
  camera: MiniMapCameraState;
}

// 默认初始状态
const DEFAULT_INITIAL_STATE: EditorState = {
  gridWidth: 10,
  gridHeight: 10,
  cellSizeX: 50,
  cellSizeY: 50,
  selectedArrowId: null,
  currentColor: '#000000',
  zoom: 1
};

export function EditorUI() {
  const [state, setState] = useState<EditorState>(DEFAULT_INITIAL_STATE);
  const [widthInput, setWidthInput] = useState('10');
  const [heightInput, setHeightInput] = useState('10');
  const [cellWidthInput, setCellWidthInput] = useState('50');
  const [cellHeightInput, setCellHeightInput] = useState('50');
  const [miniMapVisible, setMiniMapVisible] = useState(false);
  /** 全局预览面板是否展开（用户可收起/展开） */
  const [previewExpanded, setPreviewExpanded] = useState(true);
  const miniMapRef = useRef<HTMLCanvasElement | null>(null);
  const miniMapStateRef = useRef<MiniMapState | null>(null);
  const miniMapDraggingRef = useRef(false);
  const miniMapRafRef = useRef<number | null>(null);
  /** 当前选中箭头 id（与事件同步，避免点击按钮时 state 未更新） */
  const selectedArrowIdRef = useRef<string | null>(null);
  const imageImportInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // 异步加载配置作为初始值
  useEffect(() => {
    let isMounted = true;

    const loadConfig = async () => {
      try {
        const levelData = await getLevelDataAsync();
        const outputConfig = await getOutputConfigAsync();
        const levelConfig = outputConfig?.level;
        
        if (!isMounted) return;
        
        const gridWidth = levelData.config?.width || DEFAULT_INITIAL_STATE.gridWidth;
        const gridHeight = levelData.config?.height || DEFAULT_INITIAL_STATE.gridHeight;
        const cellSizeX = (levelConfig && typeof levelConfig.cellSizeX === 'number') 
          ? levelConfig.cellSizeX 
          : DEFAULT_INITIAL_STATE.cellSizeX;
        const cellSizeY = (levelConfig && typeof levelConfig.cellSizeY === 'number') 
          ? levelConfig.cellSizeY 
          : DEFAULT_INITIAL_STATE.cellSizeY;
        
        setState(prev => ({
          ...prev,
          gridWidth,
          gridHeight,
          cellSizeX,
          cellSizeY
        }));
        setWidthInput(String(gridWidth));
        setHeightInput(String(gridHeight));
        setCellWidthInput(String(cellSizeX));
        setCellHeightInput(String(cellSizeY));
      } catch (error) {
        console.warn('加载配置失败，使用默认值:', error);
        // 使用默认值，不需要更新状态
      }
    };

    loadConfig();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    // 监听编辑器状态更新事件
    const handleStateUpdate = (newState: Partial<EditorState>) => {
      setState(prev => ({ ...prev, ...newState }));
    };

    // 监听箭头选择事件
    const handleArrowSelected = (arrowId: string | null, color?: number) => {
      selectedArrowIdRef.current = arrowId;
      setState(prev => ({
        ...prev,
        selectedArrowId: arrowId,
        currentColor: color ? `#${color.toString(16).padStart(6, '0')}` : prev.currentColor
      }));
    };

    // 监听缩放变化事件
    const handleZoomChange = (zoom: number) => {
      setState(prev => ({ ...prev, zoom }));
    };

    EventBus.on(EVENT_NAMES.EDITOR_STATE_UPDATE, handleStateUpdate);
    EventBus.on(EVENT_NAMES.EDITOR_ARROW_SELECTED, handleArrowSelected);
    EventBus.on(EVENT_NAMES.EDITOR_ZOOM_CHANGE, handleZoomChange);

    return () => {
      EventBus.off(EVENT_NAMES.EDITOR_STATE_UPDATE, handleStateUpdate);
      EventBus.off(EVENT_NAMES.EDITOR_ARROW_SELECTED, handleArrowSelected);
      EventBus.off(EVENT_NAMES.EDITOR_ZOOM_CHANGE, handleZoomChange);
    };
  }, []);

  useEffect(() => {
    const scheduleMiniMapDraw = () => {
      if (miniMapRafRef.current !== null) {
        return;
      }
      miniMapRafRef.current = window.requestAnimationFrame(() => {
        miniMapRafRef.current = null;
        drawMiniMap();
      });
    };

    const handleMiniMapUpdate = (miniMapState: MiniMapState) => {
      miniMapStateRef.current = miniMapState;
      setMiniMapVisible(prev => (prev === miniMapState.visible ? prev : miniMapState.visible));
      scheduleMiniMapDraw();
    };

    EventBus.on(EVENT_NAMES.EDITOR_MINIMAP_UPDATE, handleMiniMapUpdate);
    return () => {
      EventBus.off(EVENT_NAMES.EDITOR_MINIMAP_UPDATE, handleMiniMapUpdate);
      if (miniMapRafRef.current !== null) {
        window.cancelAnimationFrame(miniMapRafRef.current);
        miniMapRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setWidthInput(String(state.gridWidth));
  }, [state.gridWidth]);

  useEffect(() => {
    setHeightInput(String(state.gridHeight));
  }, [state.gridHeight]);

  useEffect(() => {
    setCellWidthInput(String(state.cellSizeX));
  }, [state.cellSizeX]);

  useEffect(() => {
    setCellHeightInput(String(state.cellSizeY));
  }, [state.cellSizeY]);

  const commitGridWidth = (value: number) => {
    if (value !== state.gridWidth) {
      setState(prev => ({ ...prev, gridWidth: value }));
      EventBus.emit(EVENT_NAMES.EDITOR_GRID_WIDTH_CHANGE, value);
    }
  };

  const commitGridHeight = (value: number) => {
    if (value !== state.gridHeight) {
      setState(prev => ({ ...prev, gridHeight: value }));
      EventBus.emit(EVENT_NAMES.EDITOR_GRID_HEIGHT_CHANGE, value);
    }
  };

  const handleGridWidthChange = (delta: number) => {
    commitGridWidth(state.gridWidth + delta);
  };

  const handleGridHeightChange = (delta: number) => {
    commitGridHeight(state.gridHeight + delta);
  };

  const commitCellWidth = (value: number) => {
    if (value !== state.cellSizeX) {
      setState(prev => ({ ...prev, cellSizeX: value }));
      EventBus.emit(EVENT_NAMES.EDITOR_CELL_WIDTH_CHANGE, value);
    }
  };

  const commitCellHeight = (value: number) => {
    if (value !== state.cellSizeY) {
      setState(prev => ({ ...prev, cellSizeY: value }));
      EventBus.emit(EVENT_NAMES.EDITOR_CELL_HEIGHT_CHANGE, value);
    }
  };

  const handleGridWidthInputChange = (value: string) => {
    setWidthInput(value);
  };

  const handleGridHeightInputChange = (value: string) => {
    setHeightInput(value);
  };

  const finalizeGridWidthInput = () => {
    const parsed = Number.parseInt(widthInput, 10);
    if (Number.isNaN(parsed)) {
      setWidthInput(String(state.gridWidth));
      return;
    }
    commitGridWidth(parsed);
    setWidthInput(String(parsed));
  };

  const finalizeGridHeightInput = () => {
    const parsed = Number.parseInt(heightInput, 10);
    if (Number.isNaN(parsed)) {
      setHeightInput(String(state.gridHeight));
      return;
    }
    commitGridHeight(parsed);
    setHeightInput(String(parsed));
  };

  const finalizeCellWidthInput = () => {
    const parsed = Number.parseInt(cellWidthInput, 10);
    if (Number.isNaN(parsed)) {
      setCellWidthInput(String(state.cellSizeX));
      return;
    }
    commitCellWidth(parsed);
    setCellWidthInput(String(parsed));
  };

  const finalizeCellHeightInput = () => {
    const parsed = Number.parseInt(cellHeightInput, 10);
    if (Number.isNaN(parsed)) {
      setCellHeightInput(String(state.cellSizeY));
      return;
    }
    commitCellHeight(parsed);
    setCellHeightInput(String(parsed));
  };

  const handleAddArrow = () => {
    EventBus.emit(EVENT_NAMES.EDITOR_ADD_ARROW);
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value;
    setState(prev => ({ ...prev, currentColor: newColor }));
    const colorNum = parseInt(newColor.replace('#', ''), 16);
    EventBus.emit(EVENT_NAMES.EDITOR_COLOR_CHANGE, colorNum);
  };

  const handleDeleteArrow = () => {
    if (state.selectedArrowId) {
      EventBus.emit(EVENT_NAMES.EDITOR_DELETE_ARROW, state.selectedArrowId);
    }
  };

  const handleFlipArrow = () => {
    const id = selectedArrowIdRef.current ?? state.selectedArrowId;
    if (id) {
      EventBus.emit(EVENT_NAMES.EDITOR_FLIP_ARROW, id);
    }
  };

  const handleExport = () => {
    EventBus.emit(EVENT_NAMES.EDITOR_EXPORT);
  };

  const handleCopyConfig = () => {
    EventBus.emit(EVENT_NAMES.EDITOR_COPY_CONFIG);
  };

  const handleImportImageClick = () => {
    setImportError(null);
    imageImportInputRef.current?.click();
  };

  const handleImportImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) {
      setImportError('请选择图片文件');
      return;
    }
    setImporting(true);
    setImportError(null);
    try {
      const result = await runImageImport(file);
      EventBus.emit(EVENT_NAMES.EDITOR_APPLY_IMPORT, result);
      setState((prev) => ({
        ...prev,
        gridWidth: result.config.width,
        gridHeight: result.config.height,
        cellSizeX: result.cellSizeX,
        cellSizeY: result.cellSizeY
      }));
      setWidthInput(String(result.config.width));
      setHeightInput(String(result.config.height));
      setCellWidthInput(String(result.cellSizeX));
      setCellHeightInput(String(result.cellSizeY));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '导入失败';
      console.error('[图片导入] 失败:', err);
      setImportError(msg);
    } finally {
      setImporting(false);
    }
  };

  const handleZoomIn = () => {
    EventBus.emit(EVENT_NAMES.EDITOR_ZOOM_IN);
  };

  const handleZoomOut = () => {
    EventBus.emit(EVENT_NAMES.EDITOR_ZOOM_OUT);
  };

  const handleZoomReset = () => {
    EventBus.emit(EVENT_NAMES.EDITOR_ZOOM_RESET);
  };

  const getMiniMapTransform = (data: MiniMapState, width: number, height: number, padding: number) => {
    const totalWidth = data.gridWidth * data.cellSizeX;
    const totalHeight = data.gridHeight * data.cellSizeY;
    const usableWidth = Math.max(1, width - padding * 2);
    const usableHeight = Math.max(1, height - padding * 2);
    const scale = Math.min(usableWidth / Math.max(1, totalWidth), usableHeight / Math.max(1, totalHeight));
    const contentWidth = totalWidth * scale;
    const contentHeight = totalHeight * scale;
    const originX = padding + (usableWidth - contentWidth) / 2;
    const originY = padding + (usableHeight - contentHeight) / 2;
    return { totalWidth, totalHeight, scale, originX, originY };
  };

  const drawMiniMap = () => {
    const canvas = miniMapRef.current;
    const data = miniMapStateRef.current;
    if (!canvas || !data) {
      return;
    }

    if (!data.visible) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const size = Math.max(1, Math.round(rect.width || 200));
    const height = Math.max(1, Math.round(rect.height || 200));
    const padding = 10;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.fillRect(0, 0, size, height);
    ctx.strokeStyle = 'rgba(68, 68, 68, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0.5, 0.5, size - 1, height - 1);

    const { totalWidth, totalHeight, scale, originX, originY } = getMiniMapTransform(data, size, height, padding);

    ctx.fillStyle = 'rgba(34, 34, 34, 0.8)';
    const dotRadius = Math.max(1, Math.min(2, Math.min(data.cellSizeX, data.cellSizeY) * scale * 0.08));

    for (let row = 0; row < data.gridHeight; row++) {
      for (let col = 0; col < data.gridWidth; col++) {
        const x = originX + (col * data.cellSizeX + data.cellSizeX / 2) * scale;
        const y = originY + (row * data.cellSizeY + data.cellSizeY / 2) * scale;
        if (dotRadius <= 1.1) {
          ctx.fillRect(x, y, 1, 1);
        } else {
          ctx.beginPath();
          ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    const viewWidth = data.camera.width / data.camera.zoom;
    const viewHeight = data.camera.height / data.camera.zoom;
    const viewX = originX + (data.camera.scrollX - data.offsetX) * scale;
    const viewY = originY + (data.camera.scrollY - data.offsetY) * scale;
    const viewW = viewWidth * scale;
    const viewH = viewHeight * scale;

    ctx.strokeStyle = 'rgba(0, 170, 255, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(viewX, viewY, viewW, viewH);
    ctx.fillStyle = 'rgba(0, 170, 255, 0.12)';
    ctx.fillRect(viewX, viewY, viewW, viewH);

  };

  const emitMiniMapPan = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = miniMapRef.current;
    const data = miniMapStateRef.current;
    if (!canvas || !data) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width || 200);
    const height = Math.max(1, rect.height || 200);
    const padding = 10;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const { totalWidth, totalHeight, scale, originX, originY } = getMiniMapTransform(data, width, height, padding);

    const localX = (x - originX) / Math.max(0.0001, scale);
    const localY = (y - originY) / Math.max(0.0001, scale);
    const normalizedX = Math.min(1, Math.max(0, localX / Math.max(1, totalWidth)));
    const normalizedY = Math.min(1, Math.max(0, localY / Math.max(1, totalHeight)));

    EventBus.emit(EVENT_NAMES.EDITOR_MINIMAP_PAN, { normalizedX, normalizedY });
  };

  return (
    <div className="editor-ui">
      <div className={`editor-ui-minimap ${previewExpanded ? 'editor-ui-minimap--expanded' : 'editor-ui-minimap--collapsed'}`}>
        {previewExpanded ? (
          <>
            {miniMapVisible && (
              <>
                <canvas
                  ref={miniMapRef}
                  className="editor-ui-minimap-canvas"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    miniMapDraggingRef.current = true;
                    emitMiniMapPan(event);
                  }}
                  onPointerMove={(event) => {
                    if (miniMapDraggingRef.current) {
                      event.preventDefault();
                      event.stopPropagation();
                      emitMiniMapPan(event);
                    }
                  }}
                  onPointerUp={() => {
                    miniMapDraggingRef.current = false;
                  }}
                  onPointerLeave={() => {
                    miniMapDraggingRef.current = false;
                  }}
                  onWheel={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                />
                <div className="editor-ui-minimap-label">全局</div>
              </>
            )}
            <button
              type="button"
              className="editor-ui-minimap-toggle"
              onClick={() => setPreviewExpanded(false)}
              title="收起全局预览"
            >
              收起
            </button>
          </>
        ) : (
          <button
            type="button"
            className="editor-ui-minimap-toggle"
            onClick={() => setPreviewExpanded(true)}
            title="展开全局预览"
          >
            全局预览
          </button>
        )}
      </div>
      <div className="editor-ui-panel">
        {/* 网格宽度控制 */}
        <div className="editor-ui-group">
          <label className="editor-ui-label">宽度:</label>
          <button 
            className="editor-ui-btn editor-ui-btn-secondary"
            onClick={() => handleGridWidthChange(-1)}
          >
            -
          </button>
          <input
            type="number"
            inputMode="numeric"
            value={widthInput}
            onChange={(e) => handleGridWidthInputChange(e.target.value)}
            onBlur={finalizeGridWidthInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                finalizeGridWidthInput();
                e.currentTarget.blur();
              }
            }}
            className="editor-ui-number"
          />
          <button 
            className="editor-ui-btn editor-ui-btn-secondary"
            onClick={() => handleGridWidthChange(1)}
          >
            +
          </button>
        </div>

        {/* 网格高度控制 */}
        <div className="editor-ui-group">
          <label className="editor-ui-label">高度:</label>
          <button 
            className="editor-ui-btn editor-ui-btn-secondary"
            onClick={() => handleGridHeightChange(-1)}
          >
            -
          </button>
          <input
            type="number"
            inputMode="numeric"
            value={heightInput}
            onChange={(e) => handleGridHeightInputChange(e.target.value)}
            onBlur={finalizeGridHeightInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                finalizeGridHeightInput();
                e.currentTarget.blur();
              }
            }}
            className="editor-ui-number"
          />
          <button 
            className="editor-ui-btn editor-ui-btn-secondary"
            onClick={() => handleGridHeightChange(1)}
          >
            +
          </button>
        </div>

        {/* 格子宽高控制 */}
        <div className="editor-ui-group">
          <label className="editor-ui-label">格宽:</label>
          <input
            type="number"
            inputMode="numeric"
            value={cellWidthInput}
            onChange={(e) => setCellWidthInput(e.target.value)}
            onBlur={finalizeCellWidthInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                finalizeCellWidthInput();
                e.currentTarget.blur();
              }
            }}
            className="editor-ui-number"
          />
        </div>
        <div className="editor-ui-group">
          <label className="editor-ui-label">格高:</label>
          <input
            type="number"
            inputMode="numeric"
            value={cellHeightInput}
            onChange={(e) => setCellHeightInput(e.target.value)}
            onBlur={finalizeCellHeightInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                finalizeCellHeightInput();
                e.currentTarget.blur();
              }
            }}
            className="editor-ui-number"
          />
        </div>

        {/* 添加箭头按钮 */}
        <button 
          className="editor-ui-btn editor-ui-btn-primary"
          onClick={handleAddArrow}
        >
          添加箭头
        </button>

        {/* 从图片导入 */}
        <input
          ref={imageImportInputRef}
          type="file"
          accept="image/*"
          className="editor-ui-hidden-file"
          onChange={handleImportImageFile}
          aria-hidden="true"
          tabIndex={-1}
        />
        <button
          type="button"
          className="editor-ui-btn editor-ui-btn-secondary"
          onClick={handleImportImageClick}
          disabled={importing}
          title="从透明背景+彩色线条的图片自动识别箭头（与 Python 脚本同算法）"
        >
          {importing ? '导入中…' : '从图片导入'}
        </button>
        {importError && (
          <span className="editor-ui-error" role="alert">{importError}</span>
        )}

        {/* 颜色选择器 */}
        <div className="editor-ui-group">
          <label className="editor-ui-label">颜色:</label>
          <input
            type="color"
            value={state.currentColor}
            onChange={handleColorChange}
            className="editor-ui-color-picker"
            disabled={!state.selectedArrowId}
          />
        </div>

        {/* 删除按钮 */}
        <button 
          className="editor-ui-btn editor-ui-btn-danger"
          onClick={handleDeleteArrow}
          disabled={!state.selectedArrowId}
        >
          删除
        </button>

        {/* 箭头对调按钮 */}
        <button 
          className="editor-ui-btn editor-ui-btn-secondary"
          onClick={handleFlipArrow}
          disabled={!state.selectedArrowId}
          title="将选中箭头改到线条另一端"
        >
          箭头对调
        </button>

        {/* 缩放控制 */}
        <div className="editor-ui-group">
          <button 
            className="editor-ui-btn editor-ui-btn-secondary"
            onClick={handleZoomOut}
            title="缩小"
          >
            −
          </button>
          <span className="editor-ui-value" style={{ minWidth: '50px' }}>
            {Math.round(state.zoom * 100)}%
          </span>
          <button 
            className="editor-ui-btn editor-ui-btn-secondary"
            onClick={handleZoomIn}
            title="放大"
          >
            +
          </button>
          <button 
            className="editor-ui-btn editor-ui-btn-secondary"
            onClick={handleZoomReset}
            title="重置缩放"
            style={{ marginLeft: '8px' }}
          >
            重置
          </button>
        </div>

        {/* 导出与复制 */}
        <button 
          className="editor-ui-btn editor-ui-btn-success"
          onClick={handleExport}
        >
          下载 output-config.json
        </button>
        <button 
          className="editor-ui-btn editor-ui-btn-secondary"
          onClick={handleCopyConfig}
          title="复制与下载相同的 output-config.json 内容"
        >
          复制到剪贴板
        </button>
      </div>

      {/* 提示信息 */}
      <div className="editor-ui-hint">
        {state.selectedArrowId ? (
          <span>已选中箭头：拖动头部调整路径 | Ctrl+方向键/WASD 整体平移一格 | 滚轮缩放，右键拖拽平移</span>
        ) : (
          <span>点击"添加箭头"自动放置箭头 | 方向键/WASD 平移视图（选中箭头时用 Ctrl+方向键 平移箭头） | 滚轮缩放，右键拖拽平移</span>
        )}
      </div>
    </div>
  );
}
