(function () {
  if (window.ContentFactoryPlugin) return;

  const VERSION = '0.1.0';
  const REQUEST_TYPE = 'CONTENT_FACTORY_PLUGIN_REQUEST';
  const RESPONSE_TYPE = 'CONTENT_FACTORY_PLUGIN_RESPONSE';

  function request(action, payload) {
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener('message', onMessage);
        reject(new Error('Plugin request timeout'));
      }, 30000);

      function onMessage(event) {
        if (event.source !== window) return;
        const data = event.data || {};
        if (data.type !== RESPONSE_TYPE || data.requestId !== requestId) return;
        window.clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
        if (data.error) reject(new Error(data.error));
        else resolve(data.payload);
      }

      window.addEventListener('message', onMessage);
      window.postMessage({ type: REQUEST_TYPE, requestId, action, payload }, '*');
    });
  }

  function getPlatformFromHost() {
    const host = window.location.hostname;
    if (host.includes('douyin.com')) return 'douyin';
    if (host.includes('xiaohongshu.com')) return 'xhs';
    return 'unknown';
  }

  function pageSnapshot(extra) {
    return {
      url: window.location.href,
      title: document.title || '',
      description:
        document.querySelector('meta[name="description"]')?.getAttribute('content') ||
        document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
        '',
      capturedAt: new Date().toISOString(),
      source: 'content_factory_plugin',
      ...extra,
    };
  }

  async function collectCurrentPage(params) {
    const platform = params?.platform || getPlatformFromHost();
    return request('api', {
      path: '/api/plugin/evidence',
      method: 'POST',
      body: {
        eventType: 'collect_current_page',
        action: 'collect',
        platform,
        requestId: params?.requestId,
        payload: pageSnapshot(params),
      },
    });
  }

  async function captureEvidence(params) {
    const platform = params?.platform || getPlatformFromHost();
    const evidence = pageSnapshot(params);

    if (params?.userTaskId) {
      return request('api', {
        path: `/api/plugin/tasks/${params.userTaskId}/submit-evidence`,
        method: 'POST',
        body: {
          eventType: params?.eventType || 'task_submit_evidence',
          action: params?.action || 'collect',
          platform,
          requestId: params?.requestId,
          submissionUrl: params?.submissionUrl || window.location.href,
          pluginEvidence: evidence,
        },
      });
    }

    return request('api', {
      path: '/api/plugin/evidence',
      method: 'POST',
      body: {
        eventType: params?.eventType || 'capture_evidence',
        action: params?.action || 'collect',
        platform,
        requestId: params?.requestId,
        payload: evidence,
      },
    });
  }

  window.ContentFactoryPlugin = {
    version: VERSION,
    checkPermission() {
      return request('status');
    },
    getStatus() {
      return request('status');
    },
    bootstrap() {
      return request('api', { path: '/api/plugin/bootstrap', method: 'GET' });
    },
    login(platform) {
      const target = platform === 'douyin'
        ? 'https://www.douyin.com/'
        : 'https://www.xiaohongshu.com/';
      window.open(target, '_blank', 'noopener,noreferrer');
      return Promise.resolve({ platform, opened: true });
    },
    getAccounts() {
      return request('api', { path: '/api/plugin/bootstrap', method: 'GET' });
    },
    getEarnTasks() {
      return request('api', { path: '/api/plugin/bootstrap', method: 'GET' })
        .then((data) => data?.activeTasks || data?.data?.activeTasks || []);
    },
    syncAccounts(accounts) {
      return request('api', {
        path: '/api/plugin/accounts/sync',
        method: 'POST',
        body: { accounts },
      });
    },
    collectCurrentPage,
    captureEvidence,
    publish(params) {
      const platform = params?.platform || getPlatformFromHost();
      const target = platform === 'douyin'
        ? 'https://creator.douyin.com/creator-micro/content/upload'
        : 'https://creator.xiaohongshu.com/publish/publish';
      window.open(params?.url || target, '_blank', 'noopener,noreferrer');
      return captureEvidence({
        ...params,
        platform,
        action: 'publish',
        eventType: 'publish_assist',
      });
    },
    xhsRequest(params) {
      return request('api', {
        path: '/api/plugin/evidence',
        method: 'POST',
        body: { ...params, platform: 'xhs', eventType: params?.eventType || 'xhs_request' },
      });
    },
    douyinRequest(params) {
      return request('api', {
        path: '/api/plugin/evidence',
        method: 'POST',
        body: { ...params, platform: 'douyin', eventType: params?.eventType || 'douyin_request' },
      });
    },
  };

  window.dispatchEvent(new CustomEvent('ContentFactoryPluginReady', {
    detail: { version: VERSION },
  }));
})();
