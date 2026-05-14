// NexTide Background Service Worker

// Listener for messages from content scripts
// Listener for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle request to open a tab in the background
  if (message.type === 'OPEN_BACKGROUND_TAB') {
    chrome.tabs.create({ 
      url: message.url, 
      active: false // Critical: Open in background without stealing focus
    });
    return false; // No async response needed
  }

  // PROXY REQUEST: Bypass CORS/Mixed-Content by fetching from Background Context
  if (message.type === 'PROXY_REQ') {
    const { url, options } = message.payload;
    
    // We must return true to indicate we will respond asynchronously
    (async () => {
      try {
        console.log('[Background] Proxying request to:', url);
        const res = await fetch(url, options);
        const text = await res.text();
        
        // Construct a serializable response object
        const responseData = {
          ok: res.ok,
          status: res.status,
          statusText: res.statusText,
          data: text
        };
        
        sendResponse({ success: true, response: responseData });
      } catch (error) {
        console.error('[Background] Proxy request failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep the message channel open for async response
  }

  if (message.type === 'CONTENT_FACTORY_PLUGIN_API') {
    const { path, method = 'GET', body } = message.payload || {};

    (async () => {
      try {
        const stored = await chrome.storage.sync.get(['apiBaseUrl', 'apiKey']);
        const base = (stored.apiBaseUrl || 'http://localhost:3000').replace(/\/$/, '');
        const headers = {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        };
        if (stored.apiKey) headers['x-user-api-key'] = stored.apiKey;

        const res = await fetch(base + path, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await res.text();
        let data = text;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {}

        sendResponse({
          success: res.ok,
          response: {
            ok: res.ok,
            status: res.status,
            statusText: res.statusText,
            data,
          },
        });
      } catch (error) {
        console.error('[Background] ContentFactoryPlugin request failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
});
