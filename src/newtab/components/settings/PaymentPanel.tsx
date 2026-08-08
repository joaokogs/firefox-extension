import { useEffect, useRef, useState } from 'preact/hooks';
import type { Session } from '@supabase/supabase-js';
import { Check, CreditCard, ExternalLink, Sparkles } from 'lucide-preact';
import { isValidStripeUrl, openUrl } from '@shared/browser';
import { useI18n } from '@shared/i18n';
import { uiButtonPrimaryClass, uiButtonSecondaryClass, uiInputClass } from '@shared/ui/classes';
import { syncNow } from '@shared/sync';
import {
  createCheckoutSession,
  createPortalSession,
  getProPlanPrice,
  getSubscription,
  hasSyncAccess,
  redeemPromotionalCoupon,
  type ProPlanPrice,
  type Subscription,
} from '@shared/payments/payments';

interface PaymentPanelProps {
  session: Session;
}

const recoveryStatuses = new Set(['past_due', 'unpaid', 'incomplete']);

function formatPlanPrice(
  price: ProPlanPrice | null,
  locale: string,
  getText: (key: string) => string,
  multiplier = 1,
): string | null {
  if (!price || price.unit_amount === null) return null;

  const amount = new Intl.NumberFormat(locale === 'pt-BR' ? 'pt-BR' : 'en-US', {
    style: 'currency',
    currency: price.currency.toUpperCase(),
  }).format((price.unit_amount * multiplier) / 100);
  const interval = price.recurring?.interval === 'year'
    ? getText('payment.perYear')
    : getText('payment.perMonth');

  return `${amount} ${interval}`;
}

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
  const { locale, t } = useI18n();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [proPrice, setProPrice] = useState<ProPlanPrice | null>(null);
  const [syncAccess, setSyncAccess] = useState(false);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [error, setError] = useState('');
  const [couponSuccess, setCouponSuccess] = useState(false);
  const prevSyncAccessRef = useRef(false);
  const subscriptionRefreshTimerRef = useRef<number | null>(null);
  const refreshRequestRef = useRef(0);

  const refreshSubscription = async (syncOnAccessChange = false) => {
    const requestId = ++refreshRequestRef.current;
    setLoadingSubscription(true);
    try {
      const [nextSubscription, nextSyncAccess] = await Promise.all([getSubscription(), hasSyncAccess()]);
      if (requestId !== refreshRequestRef.current) return;

      setSubscription(nextSubscription);
      setSyncAccess(nextSyncAccess);
      const nextHasPaidAccess = nextSyncAccess;
      if (nextHasPaidAccess) setCheckoutPending(false);
      if (nextHasPaidAccess) {
        setProPrice(null);
      } else {
        setProPrice(getProPlanPrice());
      }
      if (syncOnAccessChange && nextSyncAccess && !prevSyncAccessRef.current) {
        await syncNow();
      }
      prevSyncAccessRef.current = nextSyncAccess;
    } catch (err: unknown) {
      if (requestId === refreshRequestRef.current) {
        setError(t(getPaymentErrorKey(err)));
      }
    } finally {
      if (requestId === refreshRequestRef.current) {
        setLoadingSubscription(false);
      }
    }
  };

  const stopSubscriptionRefresh = () => {
    if (subscriptionRefreshTimerRef.current === null) return;
    window.clearInterval(subscriptionRefreshTimerRef.current);
    subscriptionRefreshTimerRef.current = null;
  };

  const startSubscriptionRefresh = () => {
    stopSubscriptionRefresh();
    let attempts = 0;

    subscriptionRefreshTimerRef.current = window.setInterval(() => {
      attempts += 1;
      void refreshSubscription(true);

      if (attempts >= 12) {
        stopSubscriptionRefresh();
        setCheckoutPending(false);
      }
    }, 5_000);
  };

  useEffect(() => {
    setError('');
    setCouponSuccess(false);
    // Track access for a possible transition after coupon redemption.
    prevSyncAccessRef.current = false;
    void refreshSubscription();

    const refreshOnReturn = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshSubscription();
    };

    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', refreshOnReturn);

    return () => {
      refreshRequestRef.current += 1;
      window.removeEventListener('focus', refreshOnReturn);
      document.removeEventListener('visibilitychange', refreshOnReturn);
      stopSubscriptionRefresh();
    };
  }, [session.user.id]);

  const handleCheckout = async () => {
    setError('');
    setCheckoutPending(true);
    setCheckoutLoading(true);
    try {
      const url = await createCheckoutSession();
      if (!isValidStripeUrl(url)) throw new Error('CHECKOUT_URL_MISSING');
      await openUrl(url, true);
      startSubscriptionRefresh();
    } catch (err: unknown) {
      setCheckoutPending(false);
      setError(t(getPaymentErrorKey(err)));
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handlePortal = async () => {
    setError('');
    setPortalLoading(true);
    try {
      const url = await createPortalSession();
      if (!isValidStripeUrl(url)) throw new Error('PORTAL_URL_MISSING');
      await openUrl(url, true);
      startSubscriptionRefresh();
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

  const hasPaidAccess = syncAccess;
  const hasBillingRecord = Boolean(subscription?.stripe_customer_id && subscription?.stripe_subscription_id);
  const needsBillingRecovery = !hasPaidAccess && Boolean(subscription && recoveryStatuses.has(subscription.status));
  const canManageBilling = hasBillingRecord;
  const showPortal = canManageBilling;
  const hasCouponOnlyAccess = hasPaidAccess && !hasBillingRecord;
  const isFreeSelected = !loadingSubscription && !hasPaidAccess;
  const isProSelected = !loadingSubscription && hasPaidAccess;
  const formattedOriginalProPrice = formatPlanPrice(proPrice, locale, t);
  const formattedFirstMonthProPrice = formatPlanPrice(proPrice, locale, t, 0.5);

  let buttonLabel: string;
  let buttonDisabled: boolean;
  let buttonAction: () => void;

  if (showPortal) {
    buttonLabel = portalLoading ? t('payment.loading') : needsBillingRecovery ? t('payment.recover') : t('payment.manage');
    buttonDisabled = portalLoading || loadingSubscription;
    buttonAction = handlePortal;
  } else {
    buttonLabel = checkoutLoading ? t('payment.loading') : checkoutPending ? t('payment.verifying') : t('payment.subscribe');
    buttonDisabled = checkoutLoading || checkoutPending || loadingSubscription;
    buttonAction = handleCheckout;
  }

  return (
    <div className="mt-6 border-t border-panel-border-subtle pt-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-panel-accent/12 text-panel-accent-text">
          <CreditCard size={18} aria-hidden="true" />
        </span>
        <div>
          <strong className="block text-base font-semibold tracking-[-0.01em] text-panel-text">{t('payment.title')}</strong>
          <p className="mt-1 text-sm leading-5 text-panel-text-secondary">{t('payment.plansDescription')}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className={`rounded-xl border p-4 sm:p-5 ${isFreeSelected ? 'border-panel-success/70 bg-panel-success/[0.06] shadow-[0_0_0_1px_rgba(110,231,183,0.16)]' : 'border-panel-border-subtle bg-panel-surface-muted'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-panel-text-muted">{t('payment.freePlan')}</span>
              <h3 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-panel-text">{t('payment.freePlanTitle')}</h3>
            </div>
            <span className={`rounded-full border px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.08em] ${isFreeSelected ? 'border-panel-success/35 bg-panel-success/10 text-panel-success' : 'border-panel-border bg-panel-surface-raised text-panel-text-muted'}`}>
              {isFreeSelected ? t('payment.currentPlan') : t('payment.availableBadge')}
            </span>
          </div>
          <p className="mt-3 min-h-10 text-sm leading-5 text-panel-text-secondary">{t('payment.freePlanDescription')}</p>
          <ul className="mt-4 space-y-2 text-sm text-panel-text-secondary">
            {[t('payment.freeFeatureLocal'), t('payment.freeFeatureWidgets')].map((feature) => (
              <li className="flex items-start gap-2" key={feature}>
                <Check className="mt-0.5 shrink-0 text-panel-text-muted" size={15} aria-hidden="true" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={`rounded-xl border p-4 shadow-[0_8px_24px_rgba(15,23,42,0.08)] sm:p-5 ${isProSelected ? 'border-panel-success/70 bg-panel-success/[0.06] shadow-[0_0_0_1px_rgba(110,231,183,0.16)]' : 'border-panel-accent/50 bg-panel-surface-muted'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-panel-accent-text"><Sparkles size={13} aria-hidden="true" />{t('payment.proPlan')}</span>
              <h3 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-panel-text">{t('payment.proPlanTitle')}</h3>
              {!hasPaidAccess && (
                loadingSubscription ? (
                  <span className="mt-1 block text-sm font-semibold text-panel-text">{t('payment.loading')}</span>
                ) : formattedOriginalProPrice && formattedFirstMonthProPrice ? (
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5" aria-label={`${formattedFirstMonthProPrice} ${t('payment.firstMonthOffer')}`}>
                    <span className="text-sm font-medium text-panel-text-muted line-through decoration-panel-text-muted/70">{formattedOriginalProPrice}</span>
                    <span className="text-base font-bold text-panel-text">{formattedFirstMonthProPrice}</span>
                    <span className="basis-full text-[0.68rem] font-semibold text-panel-accent-text">{t('payment.firstMonthOffer')}</span>
                  </div>
                ) : (
                  <span className="mt-1 block text-sm font-semibold text-panel-text">{t('payment.priceUnavailable')}</span>
                )
              )}
            </div>
            <span className={`rounded-full border px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.08em] ${isProSelected ? 'border-panel-success/35 bg-panel-success/10 text-panel-success' : 'border-panel-accent-text/20 bg-panel-accent-text/10 text-panel-accent-text'}`}>
              {isProSelected ? t('payment.currentPlan') : t('payment.upgradeBadge')}
            </span>
          </div>
          <p className="mt-3 min-h-10 text-sm leading-5 text-panel-text-secondary">{t('payment.proPlanDescription')}</p>
          <ul className="mt-4 space-y-2 text-sm text-panel-text-secondary">
            {[t('payment.proFeatureSync'), t('payment.proFeatureAccess')].map((feature) => (
              <li className="flex items-start gap-2" key={feature}>
                <Check className="mt-0.5 shrink-0 text-panel-accent-text" size={15} aria-hidden="true" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          {!hasCouponOnlyAccess && (
            <button
              type="button"
              className={`${showPortal ? uiButtonSecondaryClass : uiButtonPrimaryClass} mt-5 w-full`}
              onClick={buttonAction}
              disabled={buttonDisabled}
            >
              <ExternalLink size={15} aria-hidden="true" />
              {buttonLabel}
            </button>
          )}
        </div>
      </div>

      <form className="mt-5" onSubmit={handleCoupon}>
        <div className="mb-2">
          <label className="text-xs font-semibold uppercase tracking-[0.1em] text-panel-text-muted" htmlFor="promotional-coupon">{t('payment.couponLabel')}</label>
          <p className="mt-1 text-xs text-panel-text-muted">{t('payment.couponDescription')}</p>
        </div>
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
