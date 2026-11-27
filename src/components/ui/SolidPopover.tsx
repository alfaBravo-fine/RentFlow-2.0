import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SolidPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  align?: 'left' | 'right';
  offsetY?: number;
  className?: string;
  children: React.ReactNode;
}

export const SolidPopover: React.FC<SolidPopoverProps> = ({
  isOpen,
  onClose,
  anchorEl,
  align = 'right',
  offsetY = 8,
  className = '',
  children,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!isOpen || !anchorEl) return;

    const updatePosition = () => {
      const rect = anchorEl.getBoundingClientRect();
      const menuRect = menuRef.current?.getBoundingClientRect();
      const menuWidth = menuRect?.width || 220;
      const menuHeight = menuRect?.height || 200;

      let left = align === 'right' ? rect.right - menuWidth : rect.left;
      left = Math.max(12, Math.min(left, window.innerWidth - menuWidth - 12));

      let top = rect.bottom + offsetY;
      if (top + menuHeight > window.innerHeight - 12 && rect.top - menuHeight - offsetY >= 12) {
        top = rect.top - menuHeight - offsetY;
      } else {
        top = Math.max(12, Math.min(top, window.innerHeight - menuHeight - 12));
      }

      setCoords({ top, left });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, anchorEl, align, offsetY]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        className="menu-backdrop-blur z-[90] no-print animate-in fade-in duration-150"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-hidden="true"
      />
      <div
        ref={menuRef}
        onClick={(e) => e.stopPropagation()}
        style={{ top: coords.top, left: coords.left }}
        className={`solid-menu-surface bg-[var(--bg-surface)] fixed z-[100] no-print animate-in fade-in zoom-in-95 duration-150 ${className}`}
      >
        {children}
      </div>
    </>,
    document.body
  );
};

export default SolidPopover;
