export interface MonetizationActionConfig {
  type: 'route';
  route: string;
  params?: Record<string, string | number | boolean | null>;
  featureKey?: string;
  promptTemplate?: string;
}

export interface MonetizationItemConfig {
  id: string;
  title: string;
  subtitle?: string;
  coverImageUrl?: string;
  demoVideoUrl?: string;
  tags?: string[];
  demos?: {
    id: string;
    title: string;
    subtitle?: string;
    coverImageUrl?: string;
    demoVideoUrl?: string;
    tags?: string[];
    action?: MonetizationActionConfig;
  }[];
  action: MonetizationActionConfig;
}

export interface MonetizationCategoryConfig {
  id: string;
  name: string;
  items: MonetizationItemConfig[];
}

export interface MonetizationSquareConfigPayload {
  title: string;
  subtitle?: string;
  categories: MonetizationCategoryConfig[];
}

export const DEFAULT_MONETIZATION_SQUARE_KEY = 'default';

export const DEFAULT_MONETIZATION_SQUARE_CONFIG: MonetizationSquareConfigPayload = {
  title: '变现广场',
  subtitle: '把内容能力变成稳定变现路径',
  categories: [
    {
      id: 'video-commerce',
      name: '视频带货',
      items: [
        {
          id: 'ai-tool-leads-video',
          title: 'AI工具引流',
          subtitle: '自动生成小红书/视频号标题、正文、视频文案',
          tags: ['引流', '自动文案'],
          action: {
            type: 'route',
            route: '/pages/image-generate/index',
            params: { mode: 'ai-tool-leads' },
            featureKey: 'monetization_ai_tool_leads_video',
            promptTemplate: '请基于{{platform}}生成标题、正文和视频口播文案，产品是{{product_name}}，卖点是{{selling_points}}。',
          },
        },
        {
          id: 'fashion-video',
          title: '服装视频',
          subtitle: '上传服装图和参考视频，自动动作迁移',
          tags: ['动作迁移', '服装带货'],
          action: {
            type: 'route',
            route: '/pages/remix-generate/index',
            params: { mode: 'action-swap' },
            featureKey: 'monetization_fashion_video',
            promptTemplate: '角色保持服装细节，严格参考视频动作节奏，输出竖版带货视频。',
          },
        },
        {
          id: 'story-leds',
          title: '剧情引流',
          subtitle: '调用爆款复刻能力，自动生成剧情视频',
          tags: ['爆款复刻', '剧情'],
          action: {
            type: 'route',
            route: '/pages/remix-generate/index',
            featureKey: 'monetization_story_leads',
            promptTemplate: '根据产品{{product_name}}与参考视频，生成高转化剧情引流短视频。',
          },
        },
        {
          id: 'sell-video',
          title: '卖货视频',
          subtitle: '营销类视频快速起量模板',
          tags: ['营销视频'],
          action: {
            type: 'route',
            route: '/pages/generate/index',
            params: { feature: 'video-generate', category: 'marketing' },
            featureKey: 'monetization_sell_video',
          },
        },
      ],
    },
    {
      id: 'mid-video-traffic',
      name: '中视频流量变现',
      items: [
        {
          id: 'tk-3d-skeleton',
          title: 'TK3D骨骼',
          subtitle: '分镜脚本自动拆解，批量生成骨骼视频',
          tags: ['3D骨骼', '中视频'],
          action: {
            type: 'route',
            route: '/pages/generate/index',
            params: { feature: 'video-generate', category: 'skeleton-3d' },
            featureKey: 'monetization_tk_3d_skeleton',
          },
        },
        {
          id: 'movie-commentary',
          title: '电影解说',
          subtitle: '按结构生成可复用解说稿与视频框架',
          tags: ['电影解说'],
          action: {
            type: 'route',
            route: '/pages/generate/index',
            params: { feature: 'video-generate', category: 'short-drama' },
            featureKey: 'monetization_movie_commentary',
          },
        },
      ],
    },
    {
      id: 'graphic-monetization',
      name: '图文变现',
      items: [
        {
          id: 'ai-knowledge-card',
          title: 'AI知识卡片',
          tags: ['知识卡片'],
          action: {
            type: 'route',
            route: '/pages/image-generate/index',
            params: { mode: 'knowledge-card' },
            featureKey: 'monetization_ai_knowledge_card',
          },
        },
        {
          id: 'startup-longform',
          title: '创业知识长文',
          tags: ['长文'],
          action: {
            type: 'route',
            route: '/pages/image-generate/index',
            params: { mode: 'startup-longform' },
            featureKey: 'monetization_startup_longform',
          },
        },
        {
          id: 'wellness-graphic',
          title: '养生图文',
          tags: ['养生'],
          action: {
            type: 'route',
            route: '/pages/image-generate/index',
            params: { mode: 'wellness-graphic' },
            featureKey: 'monetization_wellness_graphic',
          },
        },
        {
          id: 'finance-card',
          title: '理财知识卡片',
          tags: ['理财'],
          action: {
            type: 'route',
            route: '/pages/image-generate/index',
            params: { mode: 'finance-card' },
            featureKey: 'monetization_finance_card',
          },
        },
        {
          id: 'ai-tool-leads-graphic',
          title: 'AI工具引流',
          tags: ['引流'],
          action: {
            type: 'route',
            route: '/pages/image-generate/index',
            params: { mode: 'ai-tool-leads' },
            featureKey: 'monetization_ai_tool_leads_graphic',
          },
        },
      ],
    },
  ],
};

export function normalizeMonetizationConfig(raw: unknown): MonetizationSquareConfigPayload {
  if (!raw || typeof raw !== 'object') return DEFAULT_MONETIZATION_SQUARE_CONFIG;
  const obj = raw as Partial<MonetizationSquareConfigPayload>;
  if (!Array.isArray(obj.categories) || obj.categories.length === 0) {
    return DEFAULT_MONETIZATION_SQUARE_CONFIG;
  }

  const categories = obj.categories
    .map((category): MonetizationCategoryConfig | null => {
      if (!category || typeof category !== 'object') return null;
      const c = category as Partial<MonetizationCategoryConfig>;
      const id = String(c.id || '').trim();
      const name = String(c.name || '').trim();
      if (!id || !name || !Array.isArray(c.items)) return null;

      const items = c.items
        .map((item): MonetizationItemConfig | null => {
          if (!item || typeof item !== 'object') return null;
          const i = item as Partial<MonetizationItemConfig>;
          const action = i.action as Partial<MonetizationActionConfig> | undefined;
          const actionType = String(action?.type || '').trim();
          const actionRoute = String(action?.route || '').trim();
          if (!i.id || !i.title || actionType !== 'route' || !actionRoute) return null;

          return {
            id: String(i.id),
            title: String(i.title),
            subtitle: i.subtitle ? String(i.subtitle) : undefined,
            coverImageUrl: i.coverImageUrl ? String(i.coverImageUrl) : undefined,
            demoVideoUrl: i.demoVideoUrl ? String(i.demoVideoUrl) : undefined,
            tags: Array.isArray(i.tags) ? i.tags.map((tag) => String(tag)) : undefined,
            demos: Array.isArray((i as { demos?: unknown[] }).demos)
              ? (i as { demos: unknown[] }).demos
                .map((demo) => {
                  if (!demo || typeof demo !== 'object') return null;
                  const d = demo as Record<string, unknown>;
                  const demoId = String(d.id || '').trim();
                  const demoTitle = String(d.title || '').trim();
                  if (!demoId || !demoTitle) return null;
                  const demoAction = d.action && typeof d.action === 'object' ? d.action as Partial<MonetizationActionConfig> : null;
                  const normalizedAction = demoAction
                    && String(demoAction.type || '').trim() === 'route'
                    && String(demoAction.route || '').trim()
                    ? {
                      type: 'route' as const,
                      route: String(demoAction.route || '').trim(),
                      params: demoAction.params && typeof demoAction.params === 'object'
                        ? demoAction.params as Record<string, string | number | boolean | null>
                        : undefined,
                      featureKey: demoAction.featureKey ? String(demoAction.featureKey) : undefined,
                      promptTemplate: demoAction.promptTemplate ? String(demoAction.promptTemplate) : undefined,
                    }
                    : undefined;
                  return {
                    id: demoId,
                    title: demoTitle,
                    subtitle: d.subtitle ? String(d.subtitle) : undefined,
                    coverImageUrl: d.coverImageUrl ? String(d.coverImageUrl) : undefined,
                    demoVideoUrl: d.demoVideoUrl ? String(d.demoVideoUrl) : undefined,
                    tags: Array.isArray(d.tags) ? d.tags.map((tag) => String(tag)) : undefined,
                    action: normalizedAction,
                  };
                })
                .filter(Boolean) as {
                id: string;
                title: string;
                subtitle?: string;
                coverImageUrl?: string;
                demoVideoUrl?: string;
                tags?: string[];
                action?: MonetizationActionConfig;
              }[]
              : undefined,
            action: {
              type: 'route',
              route: actionRoute,
              params: action?.params && typeof action.params === 'object' ? action.params as Record<string, string | number | boolean | null> : undefined,
              featureKey: action?.featureKey ? String(action.featureKey) : undefined,
              promptTemplate: action?.promptTemplate ? String(action.promptTemplate) : undefined,
            },
          };
        })
        .filter(Boolean) as MonetizationItemConfig[];

      if (items.length === 0) return null;
      return { id, name, items };
    })
    .filter(Boolean) as MonetizationCategoryConfig[];

  if (categories.length === 0) return DEFAULT_MONETIZATION_SQUARE_CONFIG;

  return {
    title: String(obj.title || DEFAULT_MONETIZATION_SQUARE_CONFIG.title),
    subtitle: obj.subtitle ? String(obj.subtitle) : DEFAULT_MONETIZATION_SQUARE_CONFIG.subtitle,
    categories,
  };
}
