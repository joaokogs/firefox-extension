import { useEffect, useRef, useState } from 'preact/hooks';
import type { Session } from '@supabase/supabase-js';
import { CreditCard, ExternalLink } from 'lucide-preact';
import { openUrl } from '@shared/browser';
import { useI18n } from '@shared/i18n';
import { syncNow } from '@shared/sync';
import {
  createCheckoutSession,
  createPortalSession,
  getSubscription,
  hasSyncAccess,
  redeemPromotionalCoupon,
  type Subscription,
} from '@shared/payments/payments';

interface PaymentPanelProps {
  session: Session;
}

const paidStatuses = new Set(['active', 'trialing']);

function getPaymentErrorKey(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message === 'AUTH_REQUIRED') return 'payment.errorSignInRequired';
  if (message === 'COUPON_REQUIRED') return 'payment.errorCouponRequired';
  if (message === 'CHECKOUT_URL_MISSING') return 'payment.errorCheckout';
  if (message === 'PORTAL_URL_MISSING') return 'payment.errorPortal';
  if (message === 'SUPABASE_NOT_CONFIGURED') return 'auth.errorNotConfigured';
  return 'payment.errorGeneric';
}

export function PaymentPanel({ session }: PaymentPanelProps) {
  const { t } = useI18n();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [syncAccess, setSyncAccess] = useState(false);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [error, setError] = useState('');
  const [couponSuccess, setCouponSuccess] = useState(false);
  const prevSyncAccessRef = useRef(false);

  const refreshSubscription = async (syncOnAccessChange = false) => {
    setLoadingSubscription(true);
    try {
      const [nextSubscription, nextSyncAccess] = await Promise.all([getSubscription(), hasSyncAccess()]);
      setSubscription(nextSubscription);
      setSyncAccess(nextSyncAccess);
      if (syncOnAccessChange && nextSyncAccess && !prevSyncAccessRef.current) {
        syncNow();
      }
      prevSyncAccessRef.current = nextSyncAccess;
    } catch (err: unknown) {
      setError(t(getPaymentErrorKey(err)));
    } finally {
      setLoadingSubscription(false);
    }
  };

  useEffect(() => {
    setError('');
    setCouponSuccess(false);
    // Track access for a possible transition after coupon redemption.
    prevSyncAccessRef.current = false;
    void refreshSubscription();
  }, [session.user.id]);

  const handleCheckout = async () => {
    setError('');
    setCheckoutLoading(true);
    try {
      await openUrl(await createCheckoutSession(), true);
    } catch (err: unknown) {
      setError(t(getPaymentErrorKey(err)));
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handlePortal = async () => {
    setError('');
    setPortalLoading(true);
    try {
      await openUrl(await createPortalSession(), true);
    } catch (err: unknown) {
      setError(t(getPaymentErrorKey(err)));
    } finally {
      setPortalLoading(false);
    }
  };

  const handleCoupon = async (event: Event) => {
    event.preventDefault();
    setError('');
    setCouponSuccess(false);
    setCouponLoading(true);
    try {
      await redeemPromotionalCoupon(couponCode);
      setCouponCode('');
      setCouponSuccess(true);
      await refreshSubscription(true);
    } catch (err: unknown) {
      setError(t(getPaymentErrorKey(err)));
    } finally {
      setCouponLoading(false);
    }
  };

  const hasPaidAccess = syncAccess || Boolean(subscription && paidStatuses.has(subscription.status));
  const statusKey = syncAccess && (!subscription || !paidStatuses.has(subscription.status))
    ? 'coupon'
    : subscription?.status || 'none';
  const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-panel-accent-text disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="mt-5 border-t border-panel-border-subtle pt-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <strong className="block text-sm font-semibold text-panel-text">{t('payment.title')}</strong>
          <span className="mt-1 block text-xs text-panel-text-muted">
            {loadingSubscription ? t('payment.loading') : t(`payment.status.${statusKey}`)}
          </span>
        </div>
        <CreditCard size={18} aria-hidden="true" />
      </div>

      {hasPaidAccess ? (
        <>
          <p className="my-3 text-sm leading-5 text-panel-text-secondary">{t('payment.activeDescription')}</p>
          <button
            type="button"
            className={`${buttonClass} w-full border-panel-border bg-panel-surface-muted text-panel-text-secondary hover:border-panel-border hover:bg-panel-surface-raised hover:text-panel-text`}
            onClick={handlePortal}
            disabled={portalLoading || loadingSubscription}
          >
            <ExternalLink size={15} aria-hidden="true" />
            {portalLoading ? t('payment.loading') : t('payment.manage')}
          </button>
        </>
      ) : (
        <>
          <p className="my-3 text-sm leading-5 text-panel-text-secondary">{t('payment.description')}</p>
          <button
            type="button"
            className={`${buttonClass} w-full border-transparent bg-panel-accent text-white shadow-[0_10px_24px_rgba(15,23,42,0.2)] hover:bg-panel-accent-hover`}
            onClick={handleCheckout}
            disabled={checkoutLoading || loadingSubscription}
          >
            <ExternalLink size={15} aria-hidden="true" />
            {checkoutLoading ? t('payment.loading') : t('payment.subscribe')}
          </button>
        </>
      )}

      <form className="mt-5" onSubmit={handleCoupon}>
        <label className="text-xs font-semibold uppercase tracking-[0.1em] text-panel-text-muted" htmlFor="promotional-coupon">{t('payment.couponLabel')}</label>
        <div className="mt-2 flex gap-2">
          <input
            id="promotional-coupon"
            type="text"
            className="min-h-10 min-w-0 flex-1 rounded-xl border border-panel-border bg-panel-background px-3 text-sm text-panel-text outline-none transition-colors placeholder:text-panel-text-muted/80 hover:border-panel-border focus:border-panel-accent-text focus:ring-2 focus:ring-panel-accent-text/20 disabled:cursor-not-allowed disabled:opacity-50"
            value={couponCode}
            onInput={(event) => setCouponCode((event.target as HTMLInputElement).value)}
            placeholder={t('payment.couponPlaceholder')}
            disabled={couponLoading}
            autoComplete="off"
          />
          <button type="submit" className={`${buttonClass} shrink-0 border-panel-border bg-panel-surface-muted text-panel-text-secondary hover:border-panel-border hover:bg-panel-surface-raised hover:text-panel-text`} disabled={couponLoading || !couponCode.trim()}>
            {couponLoading ? t('payment.loading') : t('payment.redeem')}
          </button>
        </div>
      </form>

      {couponSuccess && (
        <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-3 text-sm leading-5 text-panel-success" role="status">
          {t('payment.couponSuccess')}
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-3 text-sm leading-5 text-panel-danger" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
