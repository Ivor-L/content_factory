# 文档索引（Content Factory Web / AtomX）

本目录是项目的“长期可维护文档”。目标是让新加入的开发者在不读完全部代码的情况下，也能理解系统边界、数据流、对外依赖和常见坑位。

## 1. 从这里开始

- [架构总览](ARCHITECTURE.md)
- [本地开发指南](DEVELOPMENT.md)
- [环境变量与密钥管理（含 Vibe）](ENV_AND_SECRETS.md)

## 2. 业务与集成

- [n8n 集成与回调接口](N8N_INTEGRATION.md)
- [工作流与 Webhook 清单（n8n）](WORKFLOWS.md)
- [积分系统对接](CREDIT_SYSTEM.md)

## 3. 数据与部署

- [数据库与 Prisma/Supabase](DATABASE.md)
- [多租户部署说明](MULTI_TENANT_DEPLOY.md)
- 部署相关（根目录）：
  - [DEPLOY.md](../DEPLOY.md)
  - [DEPLOY_GUIDE.md](../DEPLOY_GUIDE.md)
  - [ENV_CONFIG.md](../ENV_CONFIG.md)

## 4. 维护脚本与工作流文件位置

- `scripts/maintenance/`：排障/迁移/工作流同步的维护脚本
- `workflows/`：n8n 工作流导出（主用）
- `workflows/exports/`：历史导出、修复版、对比用快照（不直接被运行时引用）

