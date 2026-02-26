import React, { useEffect, useState, useCallback, useRef } from 'react';
import './UndoToast.css';

interface UndoToastProps {
  message: React.ReactNode;
  /** Duration in ms before auto-dismiss (default 5000) */
  duration?: number;
  onUndo: () => void;
  onDismiss: () => void;
}

const UndoToast: React.FC<UndoToastProps> = ({
  message,
  duration = 5000,
  onUndo,
  onDismiss,
}) => {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startExit = useCallback(() => {
    setExiting(true);
    setTimeout(onDismiss, 250); // match exit animation duration
  }, [onDismiss]);

  // Auto-dismiss after duration
  useEffect(() => {
    timerRef.current = setTimeout(startExit, duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [duration, startExit]);

  const handleUndo = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onUndo();
    startExit();
  };

  return (
    <div className={`undo-toast${exiting ? ' undo-toast--exiting' : ''}`} role="alert">
      <span className="undo-toast-icon">🗑️</span>
      <span className="undo-toast-message">{message}</span>
      <button className="undo-toast-btn" onClick={handleUndo}>
        ↩️ ביטול
      </button>
      <div
        className="undo-toast-progress"
        style={{ animationDuration: `${duration}ms` }}
      />
    </div>
  );
};

export default UndoToast;
