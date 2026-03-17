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
  browserLogo?: string;
  primaryColor?: string;
  features: TenantFeature;
  navItems: TenantNavItem[];
}

export const tenants: Record<string, TenantConfig> = {
  // 租户 1：跨境出海（默认）
  crossborder: {
    slug: 'crossborder',
    name: 'AtomX',
    logo: '/logo-full.svg',
    primaryColor: '#FCD34D',
    features: {
      dashboard: true,
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
    },
      navItems: [
      { label: '首页', href: '/dashboard', icon: 'Home' },
      { label: '产品库', href: '/products', icon: 'Package' },
      { label: '脚本库', href: '/scripts', icon: 'FileText' },
      { label: '内容创作', href: '/content', icon: 'PenSquare' },
      { label: '爆款复刻', href: '/replication', icon: 'Video' },
      { label: '故事板', href: '/storyboard', icon: 'Clapperboard' },
      { label: '我的作品', href: '/my-videos', icon: 'History' },
      { label: '素材上传', href: '/upload', icon: 'Upload' },
      { label: '设置', href: '/settings', icon: 'Settings' },
    ],
  },

  // 租户 2：保险
  insurance: {
    slug: 'insurance',
    name: '保险助手',
    logo: undefined, // TODO: 提供 Logo
    primaryColor: '#52C41A',
    features: {
      dashboard: true,
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
    },
      navItems: [
      { label: '首页', href: '/dashboard', icon: 'Home' },
      { label: '产品库', href: '/products', icon: 'Package' },
      { label: '脚本库', href: '/scripts', icon: 'FileText' },
      { label: '内容创作', href: '/content', icon: 'PenSquare' },
      { label: '爆款复刻', href: '/replication', icon: 'Video' },
      { label: '我的作品', href: '/my-videos', icon: 'History' },
      { label: '素材上传', href: '/upload', icon: 'Upload' },
      { label: '设置', href: '/settings', icon: 'Settings' },
    ],
  },

  // 租户 3：跨境出海 - NexTide
  nextide: {
    slug: 'nextide',
    name: 'NexTide',
    logo: '/logo/nextide_logo.svg',
    primaryColor: '#1890FF',
    features: {
      dashboard: true,
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
    },
      navItems: [
      { label: '首页', href: '/dashboard', icon: 'Home' },
      { label: '产品库', href: '/products', icon: 'Package' },
      { label: '脚本库', href: '/scripts', icon: 'FileText' },
      { label: '内容创作', href: '/content', icon: 'PenSquare' },
      { label: '爆款复刻', href: '/replication', icon: 'Video' },
      { label: '故事板', href: '/storyboard', icon: 'Clapperboard' },
      { label: '我的作品', href: '/my-videos', icon: 'History' },
      { label: '素材上传', href: '/upload', icon: 'Upload' },
      { label: '设置', href: '/settings', icon: 'Settings' },
    ],
  },

  // 租户 4：未来扩展（占位）
  enterprise: {
    slug: 'enterprise',
    name: '企业版',
    logo: undefined, // TODO: 提供 Logo
    primaryColor: '#722ED1',
    features: {
      dashboard: true,
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
    },
      navItems: [
      { label: '首页', href: '/dashboard', icon: 'Home' },
      { label: '产品库', href: '/products', icon: 'Package' },
      { label: '脚本库', href: '/scripts', icon: 'FileText' },
      { label: '内容创作', href: '/content', icon: 'PenSquare' },
      { label: '爆款复刻', href: '/replication', icon: 'Video' },
      { label: '故事板', href: '/storyboard', icon: 'Clapperboard' },
      { label: '我的作品', href: '/my-videos', icon: 'History' },
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
    primaryColor: '#333333',
    features: {
      dashboard: true,
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
    },
      navItems: [
      { label: '首页', href: '/dashboard', icon: 'Home' },
      { label: '产品库', href: '/products', icon: 'Package' },
      { label: '脚本库', href: '/scripts', icon: 'FileText' },
      { label: '内容创作', href: '/content', icon: 'PenSquare' },
      { label: '爆款复刻', href: '/replication', icon: 'Video' },
      { label: '故事板', href: '/storyboard', icon: 'Clapperboard' },
      { label: '我的作品', href: '/my-videos', icon: 'History' },
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
  return tenants[slug] || tenants.crossborder;
}

/**
 * 获取默认租户配置
 */
export function getDefaultTenant(): TenantConfig {
  return tenants.crossborder;
}
