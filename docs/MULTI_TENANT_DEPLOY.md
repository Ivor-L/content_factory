# 多租户功能 - 部署指南

## 已完成的开发

### Day 1: 后端 + 基础设施

- [x] Prisma Schema 添加 tenant/tenant_user 表
- [x] 租户配置文件 `lib/tenants/config.ts`
- [x] 租户 Hook `hooks/useTenant.ts`
- [x] 中间件 `middleware.ts`
- [x] Providers 添加 TenantProvider
- [x] Sidebar 动态化（根据租户显示菜单）
- [x] TenantLogo 组件

## 部署步骤

### 1. 数据库迁移

```bash
cd /Users/oscar/Desktop/content-factory-web\ 3
npx prisma db push
```

### 2. 初始化租户数据

```bash
npx tsx scripts/init-tenants.ts
```

### 3. 测试

访问以下地址测试：

| 租户 | 地址 |
|------|------|
| 默认（跨境出海）| `/dashboard` |
| 保险 | `/insurance/dashboard` |
| 企业版 | `/enterprise/dashboard` |

## 租户配置

### 当前租户

| Slug | 名称 | 主题色 | 功能 |
|------|------|--------|------|
| `crossborder` | AtomX | #007AFF | 全部功能 |
| `insurance` | 保险助手 | #52C41A | 去掉故事板相关 |
| `enterprise` | 企业版 | #722ED1 | 全部功能 |

### 添加新租户

在 `lib/tenants/config.ts` 中添加：

```typescript
{
  slug: 'new-tenant',
  name: '新租户',
  logo: '/logo.png', // 放在 public 目录
  primaryColor: '#FF0000',
  features: { ... },
  navItems: [ ... ],
}
```

## 注意事项

1. **Logo**: 当前使用占位符，需要在 `lib/tenants/config.ts` 中提供实际 Logo 路径
2. **数据库**: 确保 Supabase 数据库可访问后再运行迁移
3. **现有用户**: 运行 init-tenants.ts 后会自动关联到默认租户

## 后续功能（可选）

1. 数据隔离 - 为各数据模型添加 tenantId
2. 租户管理后台 - 创建租户管理页面
3. Subdomain 支持 - 修改中间件解析域名
