import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Copy, Home, Moon, RefreshCw, Sun } from '../icons';
import { useTheme } from '../theme/ThemeProvider';

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  selectedText: string;
  targetInput: HTMLInputElement | HTMLTextAreaElement | null;
}

export const AppContextMenu: React.FC = () => {
  const navigate = useNavigate();
  const { isDarkMode, toggleTheme } = useTheme();
  const menuRef = useRef<HTMLDivElement>(null);

  const [menu, setMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    selectedText: '',
    targetInput: null,
  });

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();

      const selection = window.getSelection()?.toString() || '';
      const rawTarget = e.target as HTMLElement | null;
      const targetInput =
        rawTarget instanceof HTMLInputElement || rawTarget instanceof HTMLTextAreaElement
          ? rawTarget
          : null;

      const menuWidth = 200;
      const menuHeight = 220;
      const maxX = Math.max(8, window.innerWidth - menuWidth - 8);
      const maxY = Math.max(8, window.innerHeight - menuHeight - 8);

      setMenu({
        visible: true,
        x: Math.min(Math.max(8, e.clientX), maxX),
        y: Math.min(Math.max(8, e.clientY), maxY),
        selectedText: selection,
        targetInput,
      });
    };

    const closeMenu = () => {
      setMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMenu();
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && e.target instanceof Node && !menuRef.current.contains(e.target)) {
        closeMenu();
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('blur', closeMenu);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('blur', closeMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  if (!menu.visible || typeof document === 'undefined') return null;

  const handleCopy = async () => {
    const textToCopy = menu.selectedText;
    setMenu((prev) => ({ ...prev, visible: false }));
    if (textToCopy && typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(textToCopy);
      } catch {
        // Ignore clipboard permission errors
      }
    }
  };

  const handlePaste = async () => {
    const input = menu.targetInput;
    setMenu((prev) => ({ ...prev, visible: false }));
    if (!input || input.readOnly || input.disabled) return;
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip) return;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      const nextValue = input.value.slice(0, start) + clip + input.value.slice(end);
      const nativeSetter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(input),
        'value'
      )?.set;
      nativeSetter?.call(input, nextValue);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return createPortal(
    <>
      <div
        className="menu-backdrop-blur z-[190] no-print animate-in fade-in duration-100"
        onClick={() => setMenu((prev) => ({ ...prev, visible: false }))}
        aria-hidden="true"
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label="RentFlow actions"
        style={{ top: menu.y, left: menu.x }}
        className="no-print fixed z-[200] w-48 rounded-xl solid-menu-surface bg-[var(--bg-surface)] py-1.5 text-xs select-none animate-in fade-in zoom-in-95 duration-100"
      >
        {menu.selectedText && (
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="w-full px-3.5 py-2 text-left text-[var(--text-primary)] hover:bg-[var(--bg-surface-sunken)] flex items-center gap-2.5 cursor-pointer"
          >
          <Copy className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span>Copy</span>
        </button>
      )}

      {menu.targetInput && !menu.targetInput.readOnly && !menu.targetInput.disabled && (
        <button
          type="button"
          onClick={() => void handlePaste()}
          className="w-full px-3.5 py-2 text-left text-[var(--text-primary)] hover:bg-[var(--bg-base)] flex items-center gap-2.5 cursor-pointer"
        >
          <Copy className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
          <span>Paste</span>
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          setMenu((prev) => ({ ...prev, visible: false }));
          navigate(-1);
        }}
        className="w-full px-3.5 py-2 text-left text-[var(--text-primary)] hover:bg-[var(--bg-base)] flex items-center gap-2.5 cursor-pointer"
      >
        <ChevronLeft className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
        <span>Back</span>
      </button>

      <button
        type="button"
        onClick={() => {
          setMenu((prev) => ({ ...prev, visible: false }));
          navigate('/');
        }}
        className="w-full px-3.5 py-2 text-left text-[var(--text-primary)] hover:bg-[var(--bg-base)] flex items-center gap-2.5 cursor-pointer"
      >
        <Home className="w-3.5 h-3.5 text-[var(--accent)]" />
        <span>Dashboard</span>
      </button>

      <div className="my-1 border-t border-[var(--border-subtle)]" />

      <button
        type="button"
        onClick={() => {
          setMenu((prev) => ({ ...prev, visible: false }));
          toggleTheme();
        }}
        className="w-full px-3.5 py-2 text-left text-[var(--text-primary)] hover:bg-[var(--bg-base)] flex items-center gap-2.5 cursor-pointer"
      >
        {isDarkMode ? (
          <Sun className="w-3.5 h-3.5 text-amber-400" />
        ) : (
          <Moon className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
        )}
        <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
      </button>

      <button
        type="button"
        onClick={() => {
          setMenu((prev) => ({ ...prev, visible: false }));
          window.location.reload();
        }}
        className="w-full px-3.5 py-2 text-left text-[var(--text-primary)] hover:bg-[var(--bg-surface-sunken)] flex items-center gap-2.5 cursor-pointer"
      >
        <RefreshCw className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
        <span>Refresh App</span>
      </button>
    </div>
    </>,
    document.body
  );
};

export default AppContextMenu;
