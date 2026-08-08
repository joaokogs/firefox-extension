import browserApi from 'webextension-polyfill';

export const browser = browserApi;

function sanitizeExternalUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  const allowedProtocols = new Set(['http:', 'https:', 'mailto:', 'tel:']);
  if (!allowedProtocols.has(parsed.protocol)) {
    throw new Error(`Blocked URL protocol: ${parsed.protocol}`);
  }
  return url;
}

export async function queryActiveTab(): Promise<{ title: string; url: string; favicon?: string } | null> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.url || tab.url.startsWith('about:') || tab.url.startsWith('moz-extension:')) {
      return null;
    }
    return {
      title: tab.title || tab.url,
      url: tab.url,
      favicon: tab.favIconUrl
    };
  } catch (err) {
    console.error('Failed to query active tab:', err);
    return null;
  }
}

export async function openUrlDirect(url: string, openInNewTab: boolean): Promise<void> {
  const safeUrl = sanitizeExternalUrl(url);

  if (openInNewTab) {
    await browser.tabs.create({ url: safeUrl, active: true });
    return;
  }

  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  if (tabId === undefined) {
    throw new Error('No active tab available');
  }
  await browser.tabs.update(tabId, { url: safeUrl });
}

export async function openUrl(url: string, openInNewTab = true): Promise<void> {
  await openUrlDirect(url, openInNewTab);
}

const STRIPE_HOSTS = ['checkout.stripe.com', 'billing.stripe.com', 'stripe.com'];

export function isValidStripeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    return STRIPE_HOSTS.some((h) => hostname === h || hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}
