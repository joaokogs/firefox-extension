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
