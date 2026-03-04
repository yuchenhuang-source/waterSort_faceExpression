import { useState, useEffect } from 'react';
import { CV_RECORD_PLAY, CV_RECORD_PAUSE, CV_RECORD_END, CV_RECORD_STATUS, type RecordStatus } from '../game/cvRecordEvents';

interface CVRecordControlsProps {
    /** When provided, posts commands to iframe instead of using EventBus (for parent/simulator) */
    iframeRef?: React.RefObject<HTMLIFrameElement | null>;
}

export default function CVRecordControls({ iframeRef }: CVRecordControlsProps) {
    const [status, setStatus] = useState<RecordStatus>('idle');

    useEffect(() => {
        if (!iframeRef) return;
        const handler = (e: MessageEvent) => {
            if (e.data?.type === 'cv-record-status' && e.data?.status) setStatus(e.data.status);
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [iframeRef]);

    const handlePlay = () => {
        if (iframeRef?.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage({ type: 'cv-record-play' }, '*');
        }
    };
    const handlePause = () => {
        if (iframeRef?.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage({ type: 'cv-record-pause' }, '*');
        }
    };
    const handleEnd = () => {
        if (iframeRef?.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage({ type: 'cv-record-end' }, '*');
        }
    };

    const statusText = status === 'idle' ? '未录制' : status === 'recording' ? '录制中' : '已暂停';

    return (
        <div className="cv-record-controls cv-record-controls-toolbar">
            <button type="button" onClick={handlePlay}>播放</button>
            <button type="button" onClick={handlePause}>暂停</button>
            <button type="button" onClick={handleEnd}>结束</button>
            <span className="cv-record-status">{statusText}</span>
        </div>
    );
}

