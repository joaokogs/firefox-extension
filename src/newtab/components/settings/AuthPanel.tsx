import { useState, useEffect } from 'preact/hooks';
import { useI18n } from '@shared/i18n';
import { uiButtonClass, uiButtonPrimaryClass, uiButtonSecondaryClass, uiInputClass } from '@shared/ui/classes';
import {
  getSession,
  subscribeAuthState,
  signInWithEmail,
  signUpWithEmail,
  signOut,
  signInWithGoogle,
} from '@shared/auth/auth';
import type { Session } from '@supabase/supabase-js';
import { LockKeyhole, LogOut, Mail, UserRound } from 'lucide-preact';
import { PaymentPanel } from './PaymentPanel';

interface AuthPanelProps {
  onAuthenticated?: () => void;
}

export function AuthPanel({ onAuthenticated }: AuthPanelProps) {
  const { t } = useI18n();
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    let mounted = true;
    let unsubscribe = () => {};

    getSession()
      .then((nextSession) => {
        if (mounted) setSession(nextSession);
      })
      .catch(() => {
        if (mounted) setError(t('auth.errorNotConfigured'));
      });

    try {
      unsubscribe = subscribeAuthState((nextSession) => {
        if (mounted) setSession(nextSession);
      });
    } catch {
      setError(t('auth.errorNotConfigured'));
    }

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [t]);

  const getErrorMessage = (err: unknown, fallback: string) => {
    const authError = (
      err && typeof err === 'object' ? err : {}
    ) as { code?: string; message?: string; status?: number };
    const code = typeof authError.code === 'string' ? authError.code.toLowerCase() : undefined;
    const message = authError.message || (err instanceof Error ? err.message : '');

    if (message === 'SUPABASE_NOT_CONFIGURED') return t('auth.errorNotConfigured');
    if (message === 'GOOGLE_CLIENT_NOT_CONFIGURED') {
      return t('auth.errorGoogleConfig');
    }
    if (code === 'weak_password') return t('auth.errorWeakPassword');
    if (
      code === 'email_address_invalid' ||
      code === 'invalid_email' ||
      (code === 'validation_failed' && /email/i.test(message))
    ) {
      return t('auth.errorInvalidEmail');
    }
    if (code === 'signup_disabled') return t('auth.errorSignupDisabled');
    if (
      code === 'over_email_send_rate_limit' ||
      code === 'over_request_rate_limit' ||
      authError.status === 429
    ) {
      return t('auth.errorRateLimit');
    }
    if (code === 'user_already_exists' || code === 'email_exists') {
      return t('auth.errorUserExists');
    }
    if (/invalid login credentials/i.test(message)) {
      return t('auth.errorInvalidCredentials');
    }
    if (/email not confirmed/i.test(message)) {
      return t('auth.errorEmailNotConfirmed');
    }
    if (/user already registered|already exists/i.test(message)) {
      return t('auth.errorUserExists');
    }
    if (authError.status === 422) return t('auth.errorInvalidSignupData');

    return fallback;
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setError('');
    setEmailSent(false);
  };

  const handleSignIn = async (e: Event) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmail(email, password);
      resetForm();
      onAuthenticated?.();
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('auth.errorSignIn')));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: Event) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const session = await signUpWithEmail(email, password);
      resetForm();
      setEmailSent(!session);
      if (session) onAuthenticated?.();
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('auth.errorSignUp')));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
      onAuthenticated?.();
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('auth.errorGoogle')));
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setError('');
    setLoading(true);
    try {
      await signOut();
      resetForm();
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('auth.errorSignOut')));
    } finally {
      setLoading(false);
    }
  };

  const selectMode = (nextMode: 'signin' | 'signup') => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setError('');
    setEmailSent(false);
  };

  if (session?.user) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto w-full max-w-2xl">
          <div className="rounded-xl border border-panel-border bg-panel-surface-muted p-4 shadow-[0_8px_24px_rgba(15,23,42,0.08)] sm:p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-panel-accent/12 text-panel-accent-text">
                <UserRound size={21} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-panel-text-muted">{t('auth.connected')}</span>
                  <span className="rounded-full border border-panel-accent-text/20 bg-panel-accent-text/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-panel-accent-text">{t('auth.signedIn')}</span>
                </div>
                <span className="mt-1 block truncate text-sm font-medium text-panel-text">{session.user.email}</span>
              </div>
            </div>
            <button
              className={`${uiButtonClass} mt-5 min-h-10 w-full border-ui-danger/25 bg-ui-danger/10 px-4 text-ui-danger hover:border-ui-danger/40 hover:bg-ui-danger/15 hover:text-ui-danger-hover`}
              onClick={handleSignOut}
              disabled={loading}
              aria-label={t('auth.signOut')}
            >
              <LogOut size={15} aria-hidden="true" />
              {t('auth.signOut')}
            </button>
          </div>
          <div>
            <PaymentPanel session={session} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-5 grid grid-cols-2 rounded-lg border border-panel-border-subtle bg-panel-surface-muted p-1" role="tablist" aria-label={t('auth.title')}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            className={`min-h-10 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-panel-accent-text ${mode === 'signin' ? 'bg-panel-surface-raised text-panel-text shadow-sm' : 'text-panel-text-muted hover:text-panel-text'}`}
            onClick={() => selectMode('signin')}
            disabled={loading}
          >
            {t('auth.signIn')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className={`min-h-10 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-panel-accent-text ${mode === 'signup' ? 'bg-panel-surface-raised text-panel-text shadow-sm' : 'text-panel-text-muted hover:text-panel-text'}`}
            onClick={() => selectMode('signup')}
            disabled={loading}
          >
            {t('auth.signUp')}
          </button>
        </div>

        {emailSent && (
          <div className="mb-4 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-3 text-sm leading-5 text-panel-success" role="status">
            {t('auth.emailConfirmation')}
          </div>
        )}

        <form
          onSubmit={mode === 'signin' ? handleSignIn : handleSignUp}
          className="rounded-xl border border-panel-border bg-panel-surface-muted p-4 shadow-[0_8px_24px_rgba(15,23,42,0.08)] sm:p-5"
          aria-busy={loading}
        >
          <div className="flex flex-col gap-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-panel-text" htmlFor="auth-email"><Mail size={14} aria-hidden="true" />{t('auth.email')}</label>
              <input
                 className={`${uiInputClass} mt-1.5 min-h-11 px-3.5`}
                id="auth-email"
                name="email"
                type="email"
                value={email}
                onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                autoComplete="email"
                required
                aria-label={t('auth.email')}
                disabled={loading}
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-panel-text" htmlFor="auth-password"><LockKeyhole size={14} aria-hidden="true" />{t('auth.password')}</label>
              <input
                 className={`${uiInputClass} mt-1.5 min-h-11 px-3.5`}
                id="auth-password"
                name="password"
                type="password"
                value={password}
                onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                aria-label={t('auth.password')}
                disabled={loading}
              />
            </div>
            {mode === 'signup' && (
              <div>
                <label className="text-sm font-semibold text-panel-text" htmlFor="auth-confirm-password">{t('auth.confirmPassword')}</label>
                <input
                   className={`${uiInputClass} mt-1.5 min-h-11 px-3.5`}
                  id="auth-confirm-password"
                  name="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onInput={(e) => setConfirmPassword((e.target as HTMLInputElement).value)}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  aria-label={t('auth.confirmPassword')}
                  disabled={loading}
                />
              </div>
            )}

            {error && (
              <div className="rounded-md border border-red-500/25 bg-red-500/10 px-3.5 py-3 text-sm leading-5 text-panel-danger" role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
               className={`${uiButtonPrimaryClass} min-h-11 w-full px-4`}
              disabled={loading}
            >
              {loading ? t('auth.loading') : mode === 'signin' ? t('auth.signIn') : t('auth.signUp')}
            </button>
          </div>
        </form>

        <div className="my-4 h-px bg-panel-border-subtle" aria-hidden="true" />

        <button
          type="button"
           className={`${uiButtonSecondaryClass} min-h-11 w-full px-4`}
          onClick={handleGoogleSignIn}
          disabled={loading}
          aria-label={t('auth.signInWithGoogle')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          {t('auth.signInWithGoogle')}
        </button>

      </div>
    </div>
  );
}
