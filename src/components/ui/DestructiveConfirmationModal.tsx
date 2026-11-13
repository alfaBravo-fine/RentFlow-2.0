import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { AlertCircle, Trash2 } from '../icons';

export interface DestructiveConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  itemName?: string;
  itemType?: string;
  warningDetails?: string;
}

export const DestructiveConfirmationModal: React.FC<DestructiveConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Delete Confirmation',
  itemName,
  itemType,
  warningDetails,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="md">
      <div className="space-y-4">
        {/* Warning Box */}
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-rose-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="text-xs space-y-1">
            <span className="font-bold text-sm block text-[var(--text-primary)]">
              Are you sure you want to delete this?
            </span>
            {itemName && (
              <p className="leading-relaxed text-[var(--text-secondary)]">
                {itemType ? `${itemType}: ` : ''}
                <strong className="text-[var(--text-primary)] font-bold">&ldquo;{itemName}&rdquo;</strong>
              </p>
            )}
            {warningDetails && (
              <p className="text-[11px] font-medium leading-relaxed mt-1 text-rose-700 dark:text-rose-300">
                {warningDetails}
              </p>
            )}
          </div>
        </div>

        {/* Modal Buttons: [Cancel] and [Yes, Delete] */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border-subtle)]">
          <Button type="button" variant="outline" onClick={onClose} className="h-9 text-xs">
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="h-9 text-xs gap-1.5 font-semibold"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Yes, Delete</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
};
