/**
 * CV 录制控制事件（Play/Pause/End 按钮）
 * 注意：录制功能已暂时注释（Game.ts / App.tsx / DeviceSimulator），按 S 单步仍可用。恢复时取消相关注释。
 */
export const CV_RECORD_PLAY = 'cv-record-play';
export const CV_RECORD_PAUSE = 'cv-record-pause';
export const CV_RECORD_END = 'cv-record-end';
export const CV_RECORD_STATUS = 'cv-record-status';

export type RecordStatus = 'idle' | 'recording' | 'paused';
