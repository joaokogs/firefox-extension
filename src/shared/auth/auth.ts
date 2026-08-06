import { getSupabaseClient } from '@shared/supabase/client';
import type { Session, User } from '@supabase/supabase-js';
import { browser } from '@shared/browser';

type AuthStateCallback = (session: Session | null) => void;

interface Identity {
  launchWebAuthFlow: (details: { url: string; interactive: boolean }) => Promise<string | undefined>;
  getRedirectURL: (path?: string) => string;
}

function getIdentity(): Identity | null {
  const api = (browser as unknown as { identity?: Identity }).identity;
  if (
    !api ||
    typeof api.launchWebAuthFlow !== 'function' ||
    typeof api.getRedirectURL !== 'function'
  ) {
    return null;
  }
  return api;
}

function extractIdToken(urlString: string): string | null {
  const hashIndex = urlString.indexOf('#');
  if (hashIndex === -1) return null;

  const fragment = urlString.substring(hashIndex + 1);
  const params = new URLSearchParams(fragment);
  return params.get('id_token');
}

export async function getSession(): Promise<Session | null> {
  const { data } = await getSupabaseClient().auth.getSession();
  return data.session;
}

export function subscribeAuthState(callback: AuthStateCallback): () => void {
  const { data } = getSupabaseClient().auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => {
    void data.subscription.unsubscribe();
  };
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<Session | null> {
  const { data, error } = await getSupabaseClient().auth.signUp({
    email,
    password,
  });
  if (error) throw error;
  return data.session;
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw error;
}

export async function signInWithGoogle(): Promise<void> {
  const identity = getIdentity();
  if (!identity) {
    throw new Error(
      'Google Sign-In requires the "identity" permission in manifest.json. ' +
        'Please add it and reload the extension.'
    );
  }

  const nonce = crypto.randomUUID();
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(nonce),
  );
  const hashedNonce = Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  const redirectUrl = identity.getRedirectURL();
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  if (!clientId || clientId.startsWith('YOUR_')) {
    throw new Error('GOOGLE_CLIENT_NOT_CONFIGURED');
  }

  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth` +
    `?response_type=id_token` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUrl)}` +
    `&scope=${encodeURIComponent('openid email profile')}` +
    `&nonce=${encodeURIComponent(hashedNonce)}`;

  const responseUrl = await identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true,
  });

  if (!responseUrl) {
    throw new Error('Google sign-in was cancelled or failed');
  }

  const idToken = extractIdToken(responseUrl);
  if (!idToken) {
    throw new Error('Could not get ID token from Google. Please try again.');
  }

  const { error } = await getSupabaseClient().auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
    nonce,
  });

  if (error) throw error;
}

export type { Session, User, AuthStateCallback };
