/**
 * 租户配置文件
 * 
 * 配置说明：
 * - slug: URL 路径中使用
 * - name: 显示名称
 * - logo: Logo 图片路径（后续提供）
 * - primaryColor: 主题色
 * - features: 功能模块开关
 * - navItems: 导航菜单项
 */

export interface TenantFeature {
  products: boolean;
  scripts: boolean;
  contentCreation: boolean;
  replication: boolean;
  replicationShots: boolean;
  storyboard: boolean;
  storyboardGen: boolean;
  digitalHuman: boolean;
  knowledgeVideos: boolean;
  characters: boolean;
  assetLibrary: boolean;
  myVideos: boolean;
  upload: boolean;
  settings: boolean;
  dashboard: boolean;
  canvas: boolean;
  nexapi: boolean;
}

export interface TenantNavItem {
  label: string;
  href: string;
  icon: string;
}

export interface TenantConfig {
  slug: string;
  name: string;
  logo?: string;
  darkLogo?: string;
  browserLogo?: string;
  faviconLogo?: string;
  primaryColor?: string;
  features: TenantFeature;
  navItems: TenantNavItem[];
}

export const tenants: Record<string, TenantConfig> = {
  // 租户 1：历史兼容别名（默认展示统一为 NexTide）
  crossborder: {
    slug: 'crossborder',
    name: 'NexTide',
    logo: '/logo/NexTidelogo.png',
    darkLogo: '/logo/NexTidelogo-white.png',
    browserLogo: '/logo/black-logo.png',
    faviconLogo: '/logo/black-logo-favicon.png',
    primaryColor: '#111111',
    features: {
      dashboard: true,
      canvas: true,
      products: true,
      scripts: true,
      contentCreation: true,
      replication: true,
      replicationShots: false,
      storyboard: true,
      storyboardGen: true,
      digitalHuman: true,
      knowledgeVideos: false,
      characters: true,
      assetLibrary: true,
      myVideos: true,
      upload: true,
      settings: true,
      nexapi: true,
    },
      navItems: [
      { label: '首页', href: '/dashboard', icon: 'Home' },
      { label: '产品库', href: '/products', icon: 'Package' },
      { label: '脚本库', href: '/scripts', icon: 'FileText' },
      { label: '爆款复刻', href: '/replication', icon: 'Video' },
      { label: '故事板', href: '/storyboard', icon: 'Clapperboard' },
      { label: '我的项目', href: '/my-works', icon: 'History' },
      { label: '素材上传', href: '/upload', icon: 'Upload' },
      { label: '设置', href: '/settings', icon: 'Settings' },
    ],
  },

  // 租户 2：保险
  insurance: {
    slug: 'insurance',
    name: '保险助手',
    logo: undefined, // TODO: 提供 Logo
    primaryColor: '#111111',
    features: {
      dashboard: true,
      canvas: true,
      products: true,
      scripts: true,
      contentCreation: true,
      replication: true,
      replicationShots: false,
      storyboard: false,
      storyboardGen: false,
      digitalHuman: true,
      knowledgeVideos: false,
      characters: true,
      assetLibrary: true,
      myVideos: true,
      upload: true,
      settings: true,
      nexapi: false,
    },
      navItems: [
      { label: '首页', href: '/dashboard', icon: 'Home' },
      { label: '产品库', href: '/products', icon: 'Package' },
      { label: '脚本库', href: '/scripts', icon: 'FileText' },
      { label: '爆款复刻', href: '/replication', icon: 'Video' },
      { label: '我的项目', href: '/my-works', icon: 'History' },
      { label: '素材上传', href: '/upload', icon: 'Upload' },
      { label: '设置', href: '/settings', icon: 'Settings' },
    ],
  },

  // 租户 3：跨境出海 - NexTide
  nextide: {
    slug: 'nextide',
    name: 'NexTide',
    logo: '/logo/NexTidelogo.png',
    darkLogo: '/logo/NexTidelogo-white.png',
    browserLogo: '/logo/black-logo.png',
    faviconLogo: '/logo/black-logo-favicon.png',
    primaryColor: '#111111',
    features: {
      dashboard: true,
      canvas: true,
      products: true,
      scripts: true,
      contentCreation: true,
      replication: true,
      replicationShots: false,
      storyboard: true,
      storyboardGen: true,
      digitalHuman: true,
      knowledgeVideos: false,
      characters: true,
      assetLibrary: true,
      myVideos: true,
      upload: true,
      settings: true,
      nexapi: true,
    },
      navItems: [
      { label: '首页', href: '/dashboard', icon: 'Home' },
      { label: '产品库', href: '/products', icon: 'Package' },
      { label: '脚本库', href: '/scripts', icon: 'FileText' },
      { label: '爆款复刻', href: '/replication', icon: 'Video' },
      { label: '故事板', href: '/storyboard', icon: 'Clapperboard' },
      { label: '我的项目', href: '/my-works', icon: 'History' },
      { label: '素材上传', href: '/upload', icon: 'Upload' },
      { label: '设置', href: '/settings', icon: 'Settings' },
    ],
  },

  // 租户 4：未来扩展（占位）
  enterprise: {
    slug: 'enterprise',
    name: '企业版',
    logo: undefined, // TODO: 提供 Logo
    primaryColor: '#111111',
    features: {
      dashboard: true,
      canvas: true,
      products: true,
      scripts: true,
      contentCreation: true,
      replication: true,
      replicationShots: false,
      storyboard: true,
      storyboardGen: true,
      digitalHuman: true,
      knowledgeVideos: false,
      characters: true,
      assetLibrary: true,
      myVideos: true,
      upload: true,
      settings: true,
      nexapi: false,
    },
      navItems: [
      { label: '首页', href: '/dashboard', icon: 'Home' },
      { label: '产品库', href: '/products', icon: 'Package' },
      { label: '脚本库', href: '/scripts', icon: 'FileText' },
      { label: '爆款复刻', href: '/replication', icon: 'Video' },
      { label: '故事板', href: '/storyboard', icon: 'Clapperboard' },
      { label: '我的项目', href: '/my-works', icon: 'History' },
      { label: '素材上传', href: '/upload', icon: 'Upload' },
      { label: '设置', href: '/settings', icon: 'Settings' },
    ],
  },

  // 租户 5：聚保盆
  jubaopen: {
    slug: 'jubaopen',
    name: '聚保盆',
    logo: '/logo/jubaopen.svg',
    browserLogo: '/logo/jubaopeng_logo.svg',
    primaryColor: '#111111',
    features: {
      dashboard: true,
      canvas: true,
      products: true,
      scripts: true,
      contentCreation: true,
      replication: true,
      replicationShots: false,
      storyboard: true,
      storyboardGen: true,
      digitalHuman: true,
      knowledgeVideos: false,
      characters: true,
      assetLibrary: true,
      myVideos: true,
      upload: true,
      settings: true,
      nexapi: false,
    },
      navItems: [
      { label: '首页', href: '/dashboard', icon: 'Home' },
      { label: '产品库', href: '/products', icon: 'Package' },
      { label: '脚本库', href: '/scripts', icon: 'FileText' },
      { label: '爆款复刻', href: '/replication', icon: 'Video' },
      { label: '故事板', href: '/storyboard', icon: 'Clapperboard' },
      { label: '我的项目', href: '/my-works', icon: 'History' },
      { label: '素材上传', href: '/upload', icon: 'Upload' },
      { label: '设置', href: '/settings', icon: 'Settings' },
    ],
  },
};

// 有效的租户 Slug 列表
export const VALID_TENANT_SLUGS = Object.keys(tenants);

/**
 * 根据 slug 获取租户配置
 */
export function getTenantConfig(slug: string): TenantConfig {
  return tenants[slug] || tenants.nextide;
}

/**
 * 获取默认租户配置
 */
export function getDefaultTenant(): TenantConfig {
  return tenants.nextide;
}
