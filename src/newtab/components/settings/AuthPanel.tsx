import { useState, useEffect } from 'preact/hooks';
import { useI18n } from '@shared/i18n';
import {
  getSession,
  subscribeAuthState,
  signInWithEmail,
  signUpWithEmail,
  signOut,
  signInWithGoogle,
} from '@shared/auth/auth';
import type { Session } from '@supabase/supabase-js';

export function AuthPanel() {
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

  const toggleMode = () => {
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
    setError('');
    setEmailSent(false);
  };

  if (session?.user) {
    return (
      <div className="dialog__section auth-panel__section">
        <div className="auth-panel__user">
          <span className="auth-panel__email">{session.user.email}</span>
          <button
            className="btn btn--danger auth-panel__logout"
            onClick={handleSignOut}
            disabled={loading}
            aria-label={t('auth.signOut')}
          >
            {t('auth.signOut')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dialog__section auth-panel__section">
      {emailSent && (
        <div className="auth-panel__message auth-panel__message--success" role="status">
          {t('auth.emailConfirmation')}
        </div>
      )}

      <form
        onSubmit={mode === 'signin' ? handleSignIn : handleSignUp}
        className="auth-panel__form"
        aria-busy={loading}
      >
        <div className="field">
          <label htmlFor="auth-email">{t('auth.email')}</label>
          <input
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
        <div className="field">
          <label htmlFor="auth-password">{t('auth.password')}</label>
          <input
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
          <div className="field">
            <label htmlFor="auth-confirm-password">{t('auth.confirmPassword')}</label>
            <input
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
          <div className="auth-panel__message auth-panel__message--error" role="alert">
            {error}
          </div>
        )}

        <button
          type="submit"
          className="btn btn--primary auth-panel__submit"
          disabled={loading}
        >
          {loading ? t('auth.loading') : mode === 'signin' ? t('auth.signIn') : t('auth.signUp')}
        </button>
      </form>

       <button
         type="button"
         className="btn btn--secondary auth-panel__google"
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

      <button
        className="auth-panel__toggle"
        onClick={toggleMode}
        disabled={loading}
        type="button"
      >
        {mode === 'signin' ? t('auth.noAccount') : t('auth.hasAccount')}
      </button>
    </div>
  );
}
