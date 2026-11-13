/**
 * Global Print Utility Engine for RentFlow
 * Ensures any preparation or DOM updates settle before invoking the system print dialog.
 */
export const handlePrint = (callback?: () => void): void => {
  if (callback) {
    try {
      callback();
    } catch (err) {
      console.error('[Print Engine] Callback failed before print:', err);
    }
  }

  // 200ms delay to guarantee DOM reflow and print-area readiness
  window.setTimeout(() => {
    try {
      window.print();
    } catch (err) {
      console.error('[Print Engine] window.print() invocation failed:', err);
    }
  }, 200);
};
