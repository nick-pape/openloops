import { useState, useEffect } from 'react';
import './Resizer.css';

interface ResizerProps {
  onResize: (width: number) => void;
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
}

export function Resizer({ onResize, initialWidth, minWidth, maxWidth }: ResizerProps) {
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(initialWidth);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const newWidth = e.clientX;
      const constrainedWidth = Math.min(Math.max(newWidth, minWidth), maxWidth);
      
      setSidebarWidth(constrainedWidth);
      onResize(constrainedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, minWidth, maxWidth, onResize]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  return (
    <div
      className="resizer"
      onMouseDown={handleMouseDown}
      style={{ cursor: isResizing ? 'col-resize' : 'ew-resize' }}
    />
  );
}
