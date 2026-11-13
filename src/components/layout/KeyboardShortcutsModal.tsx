import React from 'react';
import { Modal } from '../ui/Modal';
import { SHORTCUTS_LIST } from '../../hooks/useKeyboardShortcuts';
import { Button } from '../ui/Button';

export interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Keyboard Shortcuts"
      description="Navigate and manage your portfolio at lightning speed."
      maxWidth="md"
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-[var(--bg-surface)]">
          {SHORTCUTS_LIST.map((item) => (
            <div key={item.key} className="p-3 flex items-center justify-between hover:bg-[var(--bg-base)] transition-colors">
              <span className="text-xs text-[var(--text-primary)] font-medium">{item.description}</span>
              <kbd className="px-2.5 py-1 text-xs font-mono font-bold rounded-lg border border-[var(--border-strong)] bg-[var(--bg-base)] text-[var(--text-primary)] shadow-xs">
                {item.label}
              </kbd>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-3 border-t border-[var(--border-subtle)]">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};
