import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '@shared/supabase/client';
import { getSession } from '@shared/auth/auth';

export type SubscriptionStatus =
  | 'none'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'paused';

export interface Subscription {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: SubscriptionStatus;
  price_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export interface ProPlanPrice {
  id: string;
  currency: string;
  unit_amount: number | null;
  recurring: {
    interval: string;
    interval_count: number;
  } | null;
  product_name: string | null;
}

interface CheckoutResponse {
  url?: string;
}

function requireAuthenticatedSession(session: Session | null): Session {
  if (!session?.user || !session.access_token) {
    throw new Error('AUTH_REQUIRED');
  }
  return session;
}

export async function getSubscription(): Promise<Subscription | null> {
  const session = requireAuthenticatedSession(await getSession());
  const { data, error } = await getSupabaseClient()
    .from('subscriptions')
    .select(
      'user_id, stripe_customer_id, stripe_subscription_id, status, price_id, current_period_end, cancel_at_period_end',
    )
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error) throw error;
  return data as Subscription | null;
}

export function getProPlanPrice(): ProPlanPrice | null {
  const amount = Number(import.meta.env.VITE_PRO_PRICE_AMOUNT);
  const currency = String(import.meta.env.VITE_PRO_PRICE_CURRENCY || '').trim().toUpperCase();
  const interval = String(import.meta.env.VITE_PRO_PRICE_INTERVAL || '').trim().toLowerCase();

  if (!Number.isFinite(amount) || amount < 0 || currency.length !== 3) {
    return null;
  }

  if (!['day', 'week', 'month', 'year'].includes(interval)) {
    return null;
  }

  return {
    id: 'static-pro-price',
    currency,
    unit_amount: Math.round(amount * 100),
    recurring: {
      interval,
      interval_count: 1,
    },
    product_name: 'Prismi Pro',
  };
}

export async function hasSyncAccess(): Promise<boolean> {
  const session = requireAuthenticatedSession(await getSession());
  const { data, error } = await getSupabaseClient().rpc('has_sync_access', {
    target_user_id: session.user.id,
  });

  if (error) throw error;
  return data === true;
}

export async function createCheckoutSession(): Promise<string> {
  requireAuthenticatedSession(await getSession());
  const { data, error } = await getSupabaseClient().functions.invoke<CheckoutResponse>(
    'create-checkout-session',
    { body: {} },
  );

  if (error) throw error;
  if (!data?.url) throw new Error('CHECKOUT_URL_MISSING');

  return data.url;
}

export async function createPortalSession(): Promise<string> {
  requireAuthenticatedSession(await getSession());
  const { data, error } = await getSupabaseClient().functions.invoke<CheckoutResponse>(
    'create-portal-session',
    { body: {} },
  );

  if (error) throw error;
  if (!data?.url) throw new Error('PORTAL_URL_MISSING');

  return data.url;
}

export async function redeemPromotionalCoupon(code: string): Promise<void> {
  requireAuthenticatedSession(await getSession());
  const normalizedCode = code.trim();
  if (!normalizedCode) throw new Error('COUPON_REQUIRED');

  const { error } = await getSupabaseClient().rpc('redeem_promotional_coupon', {
    input_code: normalizedCode,
  });
  if (error) throw error;
}
