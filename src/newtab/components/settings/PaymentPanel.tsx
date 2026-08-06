import { useEffect, useState } from 'preact/hooks';
import type { Session } from '@supabase/supabase-js';
import { CreditCard, ExternalLink } from 'lucide-preact';
import { openUrl } from '@shared/browser';
import { useI18n } from '@shared/i18n';
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

  const refreshSubscription = async () => {
    setLoadingSubscription(true);
    try {
      const [nextSubscription, nextSyncAccess] = await Promise.all([getSubscription(), hasSyncAccess()]);
      setSubscription(nextSubscription);
      setSyncAccess(nextSyncAccess);
    } catch (err: unknown) {
      setError(t(getPaymentErrorKey(err)));
    } finally {
      setLoadingSubscription(false);
    }
  };

  useEffect(() => {
    setError('');
    setCouponSuccess(false);
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
      await refreshSubscription();
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
    <div className="auth-panel__payment">
      <div className="auth-panel__payment-header">
        <div>
          <strong>{t('payment.title')}</strong>
          <span className="auth-panel__payment-status">
            {loadingSubscription ? t('payment.loading') : t(`payment.status.${statusKey}`)}
          </span>
        </div>
        <CreditCard size={18} aria-hidden="true" />
      </div>

      {hasPaidAccess ? (
        <>
          <p className="auth-panel__payment-description">{t('payment.activeDescription')}</p>
          <button
            type="button"
            className="btn btn--secondary auth-panel__payment-button"
            onClick={handlePortal}
            disabled={portalLoading || loadingSubscription}
          >
            <ExternalLink size={15} aria-hidden="true" />
            {portalLoading ? t('payment.loading') : t('payment.manage')}
          </button>
        </>
      ) : (
        <>
          <p className="auth-panel__payment-description">{t('payment.description')}</p>
          <button
            type="button"
            className="btn btn--primary auth-panel__payment-button"
            onClick={handleCheckout}
            disabled={checkoutLoading || loadingSubscription}
          >
            <ExternalLink size={15} aria-hidden="true" />
            {checkoutLoading ? t('payment.loading') : t('payment.subscribe')}
          </button>
        </>
      )}

      <form className="auth-panel__coupon" onSubmit={handleCoupon}>
        <label htmlFor="promotional-coupon">{t('payment.couponLabel')}</label>
        <div className="auth-panel__coupon-row">
          <input
            id="promotional-coupon"
            type="text"
            value={couponCode}
            onInput={(event) => setCouponCode((event.target as HTMLInputElement).value)}
            placeholder={t('payment.couponPlaceholder')}
            disabled={couponLoading}
            autoComplete="off"
          />
          <button type="submit" className="btn btn--secondary" disabled={couponLoading || !couponCode.trim()}>
            {couponLoading ? t('payment.loading') : t('payment.redeem')}
          </button>
        </div>
      </form>

      {couponSuccess && (
        <div className="auth-panel__message auth-panel__message--success" role="status">
          {t('payment.couponSuccess')}
        </div>
      )}
      {error && (
        <div className="auth-panel__message auth-panel__message--error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
