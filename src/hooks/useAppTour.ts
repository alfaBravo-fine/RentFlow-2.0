import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  driver,
  type Config,
  type DriveStep,
  type Driver,
  type HookOpts,
  type PopoverDOM,
} from 'driver.js';
import 'driver.js/dist/driver.css';
import { animate } from 'motion/react';

export const TOUR_STORAGE_KEY = 'rentflow_onboarding_tour_completed_v1';
export const START_TOUR_EVENT = 'rentflow:start-tour';
export const TOUR_ACTION_EVENT = 'rentflow:tour-action';

export type TourActionType =
  | 'property-saved'
  | 'unit-saved'
  | 'tenant-saved'
  | 'lease-saved'
  | 'work-order-saved';

export function emitTourAction(type: TourActionType): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TOUR_ACTION_EVENT, { detail: { type } }));
}

interface TourStepInteraction {
  kind: 'click' | 'action';
  targetSelector?: string;
  actionType?: TourActionType;
  nextTargetSelector?: string;
  settleMs?: number;
  focusInput?: boolean;
}

type TourDriveStep = DriveStep & {
  data?: {
    interaction?: TourStepInteraction;
    focusInput?: boolean;
  };
};

const ROUTE_SETTLE_MS = 500;

function waitForElement(
  selector: string,
  timeoutMs = 4000,
  signal?: AbortSignal
): Promise<Element | null> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(null);
      return;
    }

    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    let settled = false;
    let timerId: number | undefined;
    let rafId: number | undefined;

    const cleanup = () => {
      observer.disconnect();
      if (timerId !== undefined) window.clearTimeout(timerId);
      if (rafId !== undefined) window.cancelAnimationFrame(rafId);
      signal?.removeEventListener('abort', onAbort);
    };

    const finish = (el: Element | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(el);
    };

    const onAbort = () => finish(null);
    signal?.addEventListener('abort', onAbort, { once: true });

    const check = () => {
      const found = document.querySelector(selector);
      if (found) {
        finish(found);
        return true;
      }
      return false;
    };

    const observer = new MutationObserver(() => {
      check();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'class', 'style'],
    });

    const poll = () => {
      if (settled || signal?.aborted) return;
      if (!check()) {
        rafId = window.requestAnimationFrame(poll);
      }
    };
    rafId = window.requestAnimationFrame(poll);

    timerId = window.setTimeout(() => {
      finish(document.querySelector(selector));
    }, timeoutMs);
  });
}

export interface UseAppTourReturn {
  startTour: (forceRestart?: boolean) => void;
  skipTour: () => void;
  isTourCompleted: () => boolean;
}

export function useAppTour(autoStartOnFirstVisit = false): UseAppTourReturn {
  const navigate = useNavigate();
  const location = useLocation();
  const driverRef = useRef<Driver | null>(null);
  const stepAbortRef = useRef<AbortController | null>(null);
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;

  const isTourCompleted = useCallback((): boolean => {
    try {
      return localStorage.getItem(TOUR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }, []);

  const markTourCompleted = useCallback(() => {
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    } catch {
      // Ignore storage quota / private mode errors
    }
  }, []);

  const cleanupStepListeners = useCallback(() => {
    if (stepAbortRef.current) {
      stepAbortRef.current.abort();
      stepAbortRef.current = null;
    }
  }, []);

  const skipTour = useCallback(() => {
    cleanupStepListeners();
    markTourCompleted();
    document.body.classList.remove('rentflow-tour-active');
    if (driverRef.current?.isActive()) {
      driverRef.current.destroy();
    }
  }, [cleanupStepListeners, markTourCompleted]);

  const buildSteps = useCallback((): TourDriveStep[] => {
    return [
      // 1. Dashboard (Passive)
      {
        element: '[data-tour="dashboard-kpis"]',
        popover: {
          title: 'Welcome to RentFlow',
          description: 'This is your portfolio overview. Select Next to add your first property.',
          side: 'bottom',
          align: 'start',
          showButtons: ['next', 'close'],
        },
      },

      // 2. Sidebar Properties (Wait for click)
      {
        element: '[data-tour="sidebar-properties"]',
        popover: {
          title: 'Go to Properties',
          description: 'Select Properties & Units to view and manage your buildings.',
          side: 'right',
          align: 'center',
          showButtons: ['close'],
        },
        data: {
          interaction: {
            kind: 'click',
            targetSelector: '[data-tour="sidebar-properties"]',
            nextTargetSelector: '[data-tour="btn-add-property"]',
            settleMs: ROUTE_SETTLE_MS,
          },
        },
      },

      // 3. Add Property (Wait for click)
      {
        element: '[data-tour="btn-add-property"]',
        popover: {
          title: 'Create a Property',
          description: 'Select Add Property to open the creation form.',
          side: 'bottom',
          align: 'end',
          showButtons: ['close'],
        },
        data: {
          interaction: {
            kind: 'click',
            targetSelector: '[data-tour="btn-add-property"]',
            nextTargetSelector: '[data-tour="input-property-name"]',
            settleMs: ROUTE_SETTLE_MS,
          },
        },
      },

      // 4. Property Modal Name (Allow typing, Next button)
      {
        element: '[data-tour="input-property-name"]',
        allowPageInteraction: true,
        allowedElements: ['[role="dialog"]', '[data-tour="input-property-name"]'],
        popover: {
          title: 'Name your building',
          description: 'Enter a name for your property, then select Next.',
          side: 'bottom',
          align: 'start',
          showButtons: ['next', 'close'],
        },
        data: {
          focusInput: true,
        },
      },

      // 5. Save Property (Wait for save completion)
      {
        element: '[data-tour="btn-save-property"]',
        allowPageInteraction: true,
        allowedElements: ['[role="dialog"]', '[data-tour="btn-save-property"]'],
        popover: {
          title: 'Save it',
          description: 'Click Save to create your property.',
          side: 'top',
          align: 'end',
          showButtons: ['close'],
        },
        data: {
          interaction: {
            kind: 'action',
            actionType: 'property-saved',
            nextTargetSelector: '[data-tour="sidebar-tenants"]',
            settleMs: ROUTE_SETTLE_MS,
          },
        },
      },

      // 6. Sidebar Tenants (Wait for click)
      {
        element: '[data-tour="sidebar-tenants"]',
        popover: {
          title: 'Step 2: Add a Tenant',
          description: 'Select Tenants Directory to register your first tenant.',
          side: 'right',
          align: 'center',
          showButtons: ['close'],
        },
        data: {
          interaction: {
            kind: 'click',
            targetSelector: '[data-tour="sidebar-tenants"]',
            nextTargetSelector: '[data-tour="btn-add-tenant"]',
            settleMs: ROUTE_SETTLE_MS,
          },
        },
      },

      // 7. Add Tenant (Wait for click)
      {
        element: '[data-tour="btn-add-tenant"]',
        popover: {
          title: 'Add a Tenant',
          description: 'Select Add Tenant to open the registration form.',
          side: 'bottom',
          align: 'end',
          showButtons: ['close'],
        },
        data: {
          interaction: {
            kind: 'click',
            targetSelector: '[data-tour="btn-add-tenant"]',
            nextTargetSelector: '[data-tour="input-tenant-name"]',
            settleMs: ROUTE_SETTLE_MS,
          },
        },
      },

      // 8. Tenant Modal Name (Allow typing, Next button)
      {
        element: '[data-tour="input-tenant-name"]',
        allowPageInteraction: true,
        allowedElements: ['[role="dialog"]', '[data-tour="input-tenant-name"]'],
        popover: {
          title: 'Enter Tenant Name',
          description: 'Enter your tenant’s full name, then select Next.',
          side: 'bottom',
          align: 'start',
          showButtons: ['next', 'close'],
        },
        data: {
          focusInput: true,
        },
      },

      // 9. Save Tenant (Wait for save completion)
      {
        element: '[data-tour="btn-save-tenant"]',
        allowPageInteraction: true,
        allowedElements: ['[role="dialog"]', '[data-tour="btn-save-tenant"]'],
        popover: {
          title: 'Save Tenant',
          description: 'Click Save.',
          side: 'top',
          align: 'end',
          showButtons: ['close'],
        },
        data: {
          interaction: {
            kind: 'action',
            actionType: 'tenant-saved',
            nextTargetSelector: '[data-tour="sidebar-leases"]',
            settleMs: ROUTE_SETTLE_MS,
          },
        },
      },

      // 10. Sidebar Leases (Wait for click)
      {
        element: '[data-tour="sidebar-leases"]',
        popover: {
          title: 'Step 3: Create a Lease',
          description: 'A lease connects a unit and tenant. Select Leases & Deposits to continue.',
          side: 'right',
          align: 'center',
          showButtons: ['close'],
        },
        data: {
          interaction: {
            kind: 'click',
            targetSelector: '[data-tour="sidebar-leases"]',
            nextTargetSelector: '[data-tour="btn-add-lease"]',
            settleMs: ROUTE_SETTLE_MS,
          },
        },
      },

      // 11. Add Lease (Wait for click)
      {
        element: '[data-tour="btn-add-lease"]',
        popover: {
          title: 'Create a Lease',
          description: 'Click to open the form.',
          side: 'bottom',
          align: 'end',
          showButtons: ['close'],
        },
        data: {
          interaction: {
            kind: 'click',
            targetSelector: '[data-tour="btn-add-lease"]',
            nextTargetSelector: '[data-tour="select-tenant"]',
            settleMs: ROUTE_SETTLE_MS,
          },
        },
      },

      // 12. Lease Modal Tenant Select (Next button)
      {
        element: '[data-tour="select-tenant"]',
        allowPageInteraction: true,
        allowedElements: ['[role="dialog"]', '[data-tour="select-tenant"]'],
        popover: {
          title: 'Select the Tenant',
          description: 'Choose your newly added tenant, then select Next.',
          side: 'bottom',
          align: 'start',
          showButtons: ['next', 'close'],
        },
        data: {
          focusInput: true,
        },
      },

      // 13. Save Lease (Wait for save completion)
      {
        element: '[data-tour="btn-save-lease"]',
        allowPageInteraction: true,
        allowedElements: ['[role="dialog"]', '[data-tour="btn-save-lease"]'],
        popover: {
          title: 'Save the Lease',
          description: 'Click Save.',
          side: 'top',
          align: 'end',
          showButtons: ['close'],
        },
        data: {
          interaction: {
            kind: 'action',
            actionType: 'lease-saved',
            nextTargetSelector: '[data-tour="sidebar-invoicing"]',
            settleMs: ROUTE_SETTLE_MS,
          },
        },
      },

      // 14. Sidebar Invoicing (Wait for click)
      {
        element: '[data-tour="sidebar-invoicing"]',
        popover: {
          title: 'Rent Roll & Invoicing',
          description:
            'Open Rent Roll & Invoicing to review the invoice automatically generated for your new lease.',
          side: 'right',
          align: 'center',
          showButtons: ['close'],
        },
        data: {
          interaction: {
            kind: 'click',
            targetSelector: '[data-tour="sidebar-invoicing"]',
            settleMs: ROUTE_SETTLE_MS,
          },
        },
      },

      // 15. Finish (Centered Modal)
      {
        popover: {
          title: 'Setup Complete',
          description:
            'You have created a property, registered a tenant, signed a lease, and generated your first invoice.',
          align: 'center',
          showButtons: ['next', 'close'],
          doneBtnText: 'Finish',
        },
      },
    ];
  }, []);

  const launchDriver = useCallback(() => {
    cleanupStepListeners();
    if (driverRef.current?.isActive()) {
      driverRef.current.destroy();
    }

    const steps = buildSteps();
    const totalSteps = steps.length;

    const config: Config = {
      steps,
      animate: true,
      smoothScroll: true,
      allowClose: false,
      disableActiveInteraction: false,
      allowKeyboardControl: true,
      showButtons: ['next', 'close'],
      overlayColor: '#000000',
      overlayOpacity: 0.6,
      stagePadding: 8,
      stageRadius: 12,
      popoverOffset: 12,
      waitForElement: 2000,
      popoverClass: 'rentflow-tour-popover',
      showProgress: true,
      progressText: 'Step {{current}} of {{total}}',
      nextBtnText: 'Next →',
      prevBtnText: '← Back',
      doneBtnText: 'Finish',
      closeBtnLabel: 'Skip Tour',

      onPopoverRender: (popover: PopoverDOM, opts: HookOpts) => {
        // Keep the explicit Skip Tour button visible even with allowClose: false blocking accidental backdrop dismissals
        popover.closeButton.style.display = 'inline-flex';
        popover.closeButton.textContent = 'Skip Tour';
        popover.closeButton.setAttribute('aria-label', 'Skip onboarding tour');
        popover.closeButton.classList.add('rentflow-tour-skip-btn');
        popover.closeButton.onclick = (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          skipTour();
        };

        const activeIndex = opts.state.activeIndex ?? 0;
        const pct = Math.min(100, Math.max(4, Math.round(((activeIndex + 1) / totalSteps) * 100)));

        let progressContainer = popover.wrapper.querySelector(
          '.rentflow-tour-progress-wrap'
        ) as HTMLElement | null;
        if (!progressContainer) {
          progressContainer = document.createElement('div');
          progressContainer.className = 'rentflow-tour-progress-wrap';

          const track = document.createElement('div');
          track.className = 'rentflow-tour-progress-track';

          const fill = document.createElement('div');
          fill.className = 'rentflow-tour-progress-fill';

          track.appendChild(fill);
          progressContainer.appendChild(track);
          popover.wrapper.appendChild(progressContainer);
        }

        const fillEl = progressContainer.querySelector(
          '.rentflow-tour-progress-fill'
        ) as HTMLElement | null;
        if (fillEl) {
          fillEl.style.width = `${pct}%`;
        }

        const prefersReducedMotion =
          typeof window !== 'undefined' &&
          window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

        if (!prefersReducedMotion) {
          animate(
            popover.wrapper,
            { opacity: [0, 1], scale: [0.94, 1] },
            { duration: 0.22, ease: [0.16, 1, 0.3, 1] }
          );
        }
      },

      onHighlightStarted: (element: Element | undefined, step: DriveStep, _opts: HookOpts) => {
        cleanupStepListeners();

        const tourStep = step as TourDriveStep;
        const shouldFocus = tourStep.data?.focusInput || tourStep.data?.interaction?.focusInput;

        const controller = new AbortController();
        stepAbortRef.current = controller;
        const { signal } = controller;

        if (
          shouldFocus &&
          element &&
          (element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement ||
            element instanceof HTMLSelectElement)
        ) {
          window.setTimeout(() => {
            if (!signal.aborted) {
              element.focus({ preventScroll: true });
            }
          }, 120);
        }

        const interaction = tourStep.data?.interaction;
        if (!interaction) return;

        let isAdvancing = false;

        const advanceAfterSettle = async () => {
          if (isAdvancing || signal.aborted) return;
          isAdvancing = true;

          // Wait 500ms so route animations (<AnimatePresence>) or modal transitions settle cleanly
          await new Promise<void>((resolve) => {
            const t = window.setTimeout(resolve, interaction.settleMs ?? ROUTE_SETTLE_MS);
            signal.addEventListener(
              'abort',
              () => {
                window.clearTimeout(t);
                resolve();
              },
              { once: true }
            );
          });

          if (signal.aborted) return;

          if (interaction.nextTargetSelector) {
            await waitForElement(interaction.nextTargetSelector, 3500, signal);
          }

          if (!signal.aborted && driverRef.current?.isActive()) {
            driverRef.current.moveNext();
          }
        };

        if (interaction.kind === 'click' && interaction.targetSelector) {
          const targetSelector = interaction.targetSelector;
          const handleClick = (e: Event) => {
            const eventTarget = e.target as Element | null;
            if (!eventTarget?.closest(targetSelector)) return;
            void advanceAfterSettle();
          };
          document.addEventListener('click', handleClick, { capture: true, signal });
        } else if (interaction.kind === 'action' && interaction.actionType) {
          const expectedAction = interaction.actionType;

          const handleActionEvent = (e: Event) => {
            const customEvent = e as CustomEvent<{ type?: TourActionType }>;
            if (customEvent.detail?.type !== expectedAction) return;
            void advanceAfterSettle();
          };

          const handleFormInvalid = (e: Event) => {
            const formTarget = e.target as Element | null;
            if (!formTarget?.closest('[role="dialog"]')) return;
            driverRef.current?.nudge('Please complete all required (*) fields, then click Save.');
          };

          window.addEventListener(TOUR_ACTION_EVENT, handleActionEvent, { signal });
          document.addEventListener('invalid', handleFormInvalid, { capture: true, signal });
        }
      },

      onCloseClick: () => {
        skipTour();
      },

      onDoneClick: () => {
        cleanupStepListeners();
        markTourCompleted();
        document.body.classList.remove('rentflow-tour-active');
        driverRef.current?.destroy();
      },

      onDestroyed: () => {
        cleanupStepListeners();
        document.body.classList.remove('rentflow-tour-active');
      },
    };

    const instance = driver(config);
    driverRef.current = instance;
    document.body.classList.add('rentflow-tour-active');
    instance.drive(0);
  }, [buildSteps, cleanupStepListeners, markTourCompleted, skipTour]);

  const startTour = useCallback(
    (forceRestart = false) => {
      if (forceRestart) {
        try {
          localStorage.removeItem(TOUR_STORAGE_KEY);
        } catch {
          // Ignore storage errors
        }
      }

      const begin = async () => {
        if (locationRef.current !== '/') {
          navigate('/');
        }
        const kpiTarget = await waitForElement('[data-tour="dashboard-kpis"]', 3000);
        if (!kpiTarget) return;
        window.setTimeout(() => {
          launchDriver();
        }, ROUTE_SETTLE_MS);
      };

      void begin();
    },
    [launchDriver, navigate]
  );

  // Listen for manual tour restart triggers (e.g., from Settings)
  useEffect(() => {
    const handleStartRequest = () => {
      startTour(true);
    };
    window.addEventListener(START_TOUR_EVENT, handleStartRequest);
    return () => {
      window.removeEventListener(START_TOUR_EVENT, handleStartRequest);
    };
  }, [startTour]);

  // Auto-start once on first visit when Dashboard is active
  useEffect(() => {
    if (!autoStartOnFirstVisit || isTourCompleted()) return;
    if (location.pathname !== '/') return;

    const timer = window.setTimeout(() => {
      if (document.querySelector('[data-tour="dashboard-kpis"]') && !driverRef.current?.isActive()) {
        launchDriver();
      }
    }, 1650);

    return () => window.clearTimeout(timer);
  }, [autoStartOnFirstVisit, isTourCompleted, launchDriver, location.pathname]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupStepListeners();
      document.body.classList.remove('rentflow-tour-active');
      if (driverRef.current?.isActive()) {
        driverRef.current.destroy();
      }
    };
  }, [cleanupStepListeners]);

  return {
    startTour,
    skipTour,
    isTourCompleted,
  };
}
