// RedNote Muse Background Service Worker

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
});
