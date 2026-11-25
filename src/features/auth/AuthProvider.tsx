import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAuthStore, UserProfile } from '../../stores/authStore';
import { AuthResponse } from '../../lib/tauri/bridge';
import { useToast } from '../../components/toast/ToastContext';

interface AuthContextValue {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  authError: string | null;
  statusText: string | null;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAuthenticating = useAuthStore((s) => s.isAuthenticating);
  const authError = useAuthStore((s) => s.authError);
  const setAuthenticating = useAuthStore((s) => s.setAuthenticating);
  const setGoogleSession = useAuthStore((s) => s.setGoogleSession);
  const hydrateDesktopSession = useAuthStore((s) => s.hydrateDesktopSession);
  const signOut = useAuthStore((s) => s.signOut);
  const { showToast } = useToast();

  const [statusText, setStatusText] = useState<string | null>(null);

  useEffect(() => {
    void hydrateDesktopSession();
  }, [hydrateDesktopSession]);

  const clearAuthError = useCallback(() => {
    setAuthenticating(false, null);
  }, [setAuthenticating]);

  const loginWithGoogle = useCallback(async () => {
    setAuthenticating(true, null);
    setStatusText('Opening Browser...');

    // Yield a frame so the loading spinner updates before invoking Rust OAuth
    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 0);
      }
    });

    try {
      const authResponse = await invoke<AuthResponse>('google_login');

      if (!authResponse || !authResponse.email) {
        throw new Error('Google sign-in returned an incomplete account profile.');
      }

      setGoogleSession({
        sub: authResponse.id,
        email: authResponse.email,
        name: authResponse.name || authResponse.email.split('@')[0],
        picture: authResponse.picture,
      });
    } catch (err: unknown) {
      const rawMessage =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message || '';
      const isCancelled =
        !rawMessage ||
        rawMessage.toLowerCase().includes('cancelled') ||
        rawMessage.toLowerCase().includes('timed out') ||
        rawMessage.toLowerCase().includes('denied');

      const displayMessage = isCancelled
        ? 'Google login was cancelled. You can try again anytime.'
        : rawMessage || 'Google login was cancelled. You can try again anytime.';

      setAuthenticating(false, isCancelled ? null : displayMessage);
      showToast({ type: 'error', message: displayMessage });
    } finally {
      setStatusText(null);
      useAuthStore.setState({ isAuthenticating: false });
    }
  }, [setAuthenticating, setGoogleSession, showToast]);

  const logout = useCallback(async () => {
    await signOut();
  }, [signOut]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isAuthenticating,
        authError,
        statusText,
        loginWithGoogle,
        logout,
        clearAuthError,
      }}
    >
      {authError && !isAuthenticated && (
        <div
          role="alert"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-md w-[calc(100%-2rem)] rounded-xl bg-rose-50 dark:bg-rose-950/90 border border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200 px-4 py-3 shadow-lg flex items-start justify-between gap-3 text-xs"
        >
          <span className="break-words leading-relaxed">{authError}</span>
          <button
            type="button"
            onClick={clearAuthError}
            className="font-semibold text-rose-700 dark:text-rose-300 hover:underline shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
