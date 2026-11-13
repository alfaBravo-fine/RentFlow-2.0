import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/toast/ToastContext';

export interface ShortcutItem {
  key: string;
  label: string;
  description: string;
}

export const SHORTCUTS_LIST: ShortcutItem[] = [
  { key: 'N', label: 'N', description: 'Create New Property / Unit' },
  { key: 'S', label: 'S', description: 'Force Sync to Google Drive' },
  { key: 'D', label: 'D', description: 'Go to Dashboard' },
  { key: 'P', label: 'P', description: 'Go to Properties & Units' },
  { key: 'T', label: 'T', description: 'Go to Tenants Directory' },
  { key: 'L', label: 'L', description: 'Go to Leases & Contracts' },
  { key: 'I', label: 'I', description: 'Go to Rent Roll & Invoices' },
  { key: 'M', label: 'M', description: 'Go to Maintenance Board' },
  { key: '?', label: '?', description: 'Show Keyboard Shortcuts Help' },
];

export function useKeyboardShortcuts(onSyncTrigger?: () => Promise<any>) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const newPropTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is inside an input, textarea, select, or contenteditable
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      // Ignore if Ctrl or Cmd is held (unless it's '?' or intentional)
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      const key = e.key.toLowerCase();

      switch (key) {
        case 'n': {
          e.preventDefault();
          navigate('/properties');
          if (newPropTimerRef.current) {
            clearTimeout(newPropTimerRef.current);
          }
          // Dispatch custom event to trigger New Property modal in PropertiesView
          newPropTimerRef.current = setTimeout(() => {
            newPropTimerRef.current = null;
            window.dispatchEvent(new CustomEvent('rentflow_open_new_property'));
          }, 100);
          showToast({ type: 'info', message: 'Shortcut: New Property (N)' });
          break;
        }
        case 's': {
          e.preventDefault();
          if (onSyncTrigger) {
            showToast({ type: 'info', message: 'Shortcut: Syncing to Google Drive (S)...' });
            onSyncTrigger().then(() => {
              showToast({ type: 'success', message: 'Shortcut: Synced to Google Drive!' });
            }).catch((err) => {
              showToast({ type: 'error', message: err.message || 'Sync failed' });
            });
          }
          break;
        }
        case 'd': {
          e.preventDefault();
          navigate('/');
          break;
        }
        case 'p': {
          e.preventDefault();
          navigate('/properties');
          break;
        }
        case 't': {
          e.preventDefault();
          navigate('/tenants');
          break;
        }
        case 'l': {
          e.preventDefault();
          navigate('/leases');
          break;
        }
        case 'i': {
          e.preventDefault();
          navigate('/invoices');
          break;
        }
        case 'm': {
          e.preventDefault();
          navigate('/maintenance');
          break;
        }
        case '?': {
          e.preventDefault();
          setIsHelpOpen((prev) => !prev);
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (newPropTimerRef.current) {
        clearTimeout(newPropTimerRef.current);
        newPropTimerRef.current = null;
      }
    };
  }, [navigate, onSyncTrigger, showToast]);

  return {
    isHelpOpen,
    setIsHelpOpen,
  };
}
