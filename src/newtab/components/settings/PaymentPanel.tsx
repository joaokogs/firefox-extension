import { useEffect, useRef, useState } from 'preact/hooks';
import type { Session } from '@supabase/supabase-js';
import { CreditCard, ExternalLink } from 'lucide-preact';
import { openUrl } from '@shared/browser';
import { useI18n } from '@shared/i18n';
import { uiButtonPrimaryClass, uiButtonSecondaryClass, uiInputClass } from '@shared/ui/classes';
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
             className={`${uiButtonSecondaryClass} w-full`}
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
             className={`${uiButtonPrimaryClass} w-full`}
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
             className={`${uiInputClass} min-w-0 flex-1`}
            value={couponCode}
            onInput={(event) => setCouponCode((event.target as HTMLInputElement).value)}
            placeholder={t('payment.couponPlaceholder')}
            disabled={couponLoading}
            autoComplete="off"
          />
          <button type="submit" className={`${uiButtonSecondaryClass} shrink-0`} disabled={couponLoading || !couponCode.trim()}>
            {couponLoading ? t('payment.loading') : t('payment.redeem')}
          </button>
        </div>
      </form>

      {couponSuccess && (
        <div className="mt-3 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-3 text-sm leading-5 text-panel-success" role="status">
          {t('payment.couponSuccess')}
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-md border border-red-500/25 bg-red-500/10 px-3.5 py-3 text-sm leading-5 text-panel-danger" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
