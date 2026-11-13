import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { renderToString } from 'react-dom/server';

interface PrintContextType {
  printReport: (content: React.ReactElement) => void;
  printHtmlString: (html: string) => void;
  isPrinting: boolean;
}

const PrintContext = createContext<PrintContextType>({
  printReport: () => {},
  printHtmlString: () => {},
  isPrinting: false,
});

export const usePrint = () => useContext(PrintContext);

let activeLaunchTimer: number | undefined;
let activeCleanupFn: (() => void) | null = null;

/**
 * Clears any residual print markup from #print-root and cancels pending timers.
 */
export function clearPrintRoot(): void {
  if (typeof window !== 'undefined' && activeLaunchTimer !== undefined) {
    window.clearTimeout(activeLaunchTimer);
    activeLaunchTimer = undefined;
  }
  if (activeCleanupFn) {
    const fn = activeCleanupFn;
    activeCleanupFn = null;
    fn();
    return;
  }
  if (typeof document === 'undefined') return;
  const printRoot = document.getElementById('print-root');
  if (printRoot) {
    printRoot.innerHTML = '';
    printRoot.className = 'hidden print:block bg-white text-black';
  }
}

/**
 * Injects rendered HTML into #print-root, triggers the native print dialog,
 * and clears #print-root automatically once printing completes.
 */
export function printHtml(htmlString: string, onComplete?: () => void): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    onComplete?.();
    return;
  }

  // Cancel any prior active print session before starting a new one
  clearPrintRoot();

  const printRoot = document.getElementById('print-root');
  if (!printRoot) {
    console.error('#print-root element not found in DOM');
    onComplete?.();
    return;
  }

  printRoot.className = 'print-area bg-white text-black';
  printRoot.innerHTML = htmlString;

  let cleaned = false;
  let fallbackTimer: number | undefined;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (activeLaunchTimer !== undefined) {
      window.clearTimeout(activeLaunchTimer);
      activeLaunchTimer = undefined;
    }
    if (fallbackTimer !== undefined) {
      window.clearTimeout(fallbackTimer);
    }
    if (activeCleanupFn === cleanup) {
      activeCleanupFn = null;
    }
    window.removeEventListener('afterprint', cleanup);
    printRoot.className = 'hidden print:block bg-white text-black';
    printRoot.innerHTML = '';
    onComplete?.();
  };

  activeCleanupFn = cleanup;
  window.addEventListener('afterprint', cleanup, { once: true });
  fallbackTimer = window.setTimeout(cleanup, 60000);

  activeLaunchTimer = window.setTimeout(() => {
    activeLaunchTimer = undefined;
    try {
      window.print();
    } catch (err) {
      console.error('[Print Engine] window.print() failed:', err);
      cleanup();
    }
  }, 200);
}

export const PrintProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    return () => {
      clearPrintRoot();
    };
  }, []);

  const printHtmlString = useCallback((html: string) => {
    setIsPrinting(true);
    printHtml(html, () => setIsPrinting(false));
  }, []);

  const printReport = useCallback((content: React.ReactElement) => {
    try {
      setIsPrinting(true);
      const htmlString = renderToString(content);
      printHtml(htmlString, () => setIsPrinting(false));
    } catch (err) {
      console.error('[Print Engine] Error rendering print template:', err);
      clearPrintRoot();
      setIsPrinting(false);
    }
  }, []);

  return (
    <PrintContext.Provider value={{ printReport, printHtmlString, isPrinting }}>
      {children}
    </PrintContext.Provider>
  );
};
