import Taro, { useDidShow, useShareAppMessage, useShareTimeline } from '@tarojs/taro';

const DEFAULT_SHARE_TITLE = '小蚁AI - 让内容营销更简单';
const DEFAULT_SHARE_PATH = '/pages/home/index';
const DEFAULT_SHARE_IMAGE_URL = 'https://oss.atomx.top/miniapp/home/hero-poster-1777627846532.jpg';

type ShareQueryValue = string | number | boolean | null | undefined;

type MiniappShareOptions = {
  title?: string;
  path?: string;
  imageUrl?: string;
  query?: string | Record<string, ShareQueryValue>;
};

type MiniappShareOptionsResolver = MiniappShareOptions | (() => MiniappShareOptions);

export function useMiniappShare(options?: MiniappShareOptionsResolver) {
  useDidShow(() => {
    void Taro.showShareMenu({
      withShareTicket: true,
      showShareItems: ['shareAppMessage', 'shareTimeline'],
    } as Taro.showShareMenu.Option).catch(() => {
      // Some devtool/runtime targets do not expose share menu APIs.
    });
  });

  useShareAppMessage(() => {
    const share = resolveShareOptions(options);
    return {
      title: share.title || DEFAULT_SHARE_TITLE,
      path: share.path || getCurrentMiniappPath(),
      imageUrl: share.imageUrl || DEFAULT_SHARE_IMAGE_URL,
    };
  });

  useShareTimeline(() => {
    const share = resolveShareOptions(options);
    return {
      title: share.title || DEFAULT_SHARE_TITLE,
      query: stringifyShareQuery(share.query) || getShareQueryFromPath(share.path) || getCurrentPageQuery(),
      imageUrl: share.imageUrl || DEFAULT_SHARE_IMAGE_URL,
    };
  });
}

function resolveShareOptions(options?: MiniappShareOptionsResolver): MiniappShareOptions {
  if (!options) return {};
  return typeof options === 'function' ? options() : options;
}

function getCurrentMiniappPath() {
  const current = getCurrentPageInfo();
  if (!current.route) return DEFAULT_SHARE_PATH;
  const query = stringifyShareQuery(current.query);
  return `/${current.route}${query ? `?${query}` : ''}`;
}

function getCurrentPageQuery() {
  const current = getCurrentPageInfo();
  return stringifyShareQuery(current.query);
}

function getCurrentPageInfo(): { route: string; query: Record<string, ShareQueryValue> } {
  const pages = Taro.getCurrentPages();
  const page = pages[pages.length - 1] as any;
  const route = String(page?.route || page?.__route__ || '').replace(/^\//, '');
  const query = normalizeShareQuery(page?.options || page?.$taroParams || {});
  return { route, query };
}

function getShareQueryFromPath(path?: string) {
  if (!path) return '';
  const queryIndex = path.indexOf('?');
  if (queryIndex < 0) return '';
  return path.slice(queryIndex + 1);
}

function stringifyShareQuery(query?: string | Record<string, ShareQueryValue>) {
  if (!query) return '';
  if (typeof query === 'string') return query.replace(/^\?/, '');

  return Object.entries(query)
    .filter(([key, value]) => key && value !== null && value !== undefined && key !== '$taroTimestamp')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

function normalizeShareQuery(query: Record<string, unknown>): Record<string, ShareQueryValue> {
  return Object.entries(query).reduce<Record<string, ShareQueryValue>>((acc, [key, value]) => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      acc[key] = value;
    }
    return acc;
  }, {});
}
