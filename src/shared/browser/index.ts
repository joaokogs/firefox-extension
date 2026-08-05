import browserApi from 'webextension-polyfill';

export const browser = browserApi;

export async function queryActiveTab(): Promise<{ title: string; url: string; favicon?: string } | null> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (
      !tab?.url ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('moz-extension:') ||
      tab.url.startsWith('chrome-extension:')
    ) {
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
  if (openInNewTab) {
    await browser.tabs.create({ url, active: true });
    return;
  }

  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  if (tabId === undefined) {
    throw new Error('No active tab available');
  }
  await browser.tabs.update(tabId, { url });
}

export async function openUrl(url: string, openInNewTab = true): Promise<void> {
  await openUrlDirect(url, openInNewTab);
}
