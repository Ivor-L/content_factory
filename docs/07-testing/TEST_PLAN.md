# Content Factory Web – Test Plan

## 1. Objectives & Success Criteria
- Validate that AI内容生产、数字人集成、多语言 UI、n8n 工作流等关键体验在生产部署前可稳定交付。
- 覆盖前台 App Router、Server Actions、Supabase 数据面、资产解析 worker 以及外部 Webhook/积分系统。
- 在发布窗口前交付完整的验收清单、测试证据与缺陷跟踪链接，确保 SEV1/SEV2 缺陷为零或获书面豁免。

## 2. Scope & Features Under Test
| 模块 | 关键能力 | 备注 |
| --- | --- | --- |
| Authentication & Tenant gating | 登录、租户开关 `contentCreation`、多语言切换 | 参考 `app/(auth)` 与 README 功能描述 |
| Dashboard & Creative Tasks Flow | 资产上传 → 诊断 → 生成 → 导出 Markdown | 包含阶段记录、AI 生成、素材关联 |
| ModelTicker & Digital Human | 多模型切换、数字人创建配置 | 验证 UI 交互与后端 API 状态 |
| Asset Processing Worker | `assets.history/stories/styles` 队列、Yunwu API 重试 | 需在预生产数据库中验证 |
| Integrations | Supabase（Auth/Storage）、n8n Webhook、信用积分 API | 涵盖 service-role key 缺失、超时等异常 |
| Admin/Settings | Profile、API Key 管理、国际化、暗黑模式 | 确保全局 UI 一致性 |

## 3. Test Environment & Data
- **Environment**: `staging.atomx.top` + Supabase 预生产实例，配置 `.env.staging` 与 `.env.production`，由 `.env` 注入 Docker 容器。
- **Services**: 托管 Supabase、n8n (`hook.atomx.top` 系列)，Yunwu API，积分系统 `https://api.atomx.top`。
- **Data**:
  - 两个测试租户（观点清晰 / 观点模糊）各 3 位用户。
  - 资产样本（历史文案/案例/风格）各 5 条，含正常与异常文件。
  - 积分账户若干（余额充足/临界/透支）。
- **Access**: Playwright 测试账号 + Service Role Key（后端专用，不进入浏览器端 bundle）。

## 4. Entry / Exit Criteria
- **Entry**: 主干代码冻结；`.env`、Supabase schema、n8n workflow 已同步；CI 通过 `lint` `typecheck` `build`；数据库与 Storage 备份完成。
- **Exit**:
  - 自动化（Lint/Typecheck/Build/Playwright/UI Smoke/Worker 健康检查）全绿。
  - 手工 UAT（运营、内容团队）完成两套端到端脚本签字。
  - 无开放 SEV1/SEV2；SEV3 需列出缓解计划。

## 5. Test Types & Owners
| 类型 | 负责人 | 工具/命令 | 频率 |
| --- | --- | --- | --- |
| 静态检查 | 平台工程 | `npm run lint`, `npm run typecheck` | 每次提交 + 发布前 |
| 构建验证 | 平台工程 | `npm run build` / `docker compose build` | 每次发布前 |
| API 兼容/集成 | 后端 | 新建 Vitest/Playwright APIRequest 场景，覆盖 Supabase/n8n/积分 | 每周 + 回归 |
| E2E UI | QA | Playwright（桌面/移动视窗） | 每晚定时 + 发布前 |
| Worker 队列 | 后端 + QA | `npm run workers:assets` + pg-boss Dashboard | 每周 + 发布前 |
| 性能/安全 | SRE | k6 压测、OWASP ASVS checklist、依赖扫描 | 每季度 + 大版本 |

## 6. Detailed Suites & Cases
1. **Auth & Tenant**
   - 登录/注册/忘记密码流程。
   - 租户启用 `contentCreation` → Dashboard 显示创建入口；禁用时隐藏。
   - 语言切换（自动 & 手动）。
2. **Creative Task Flow**
   - 上传多类型资产，等待 worker 入库。
   - 诊断 → 选题 → 框架 → 内容产出全链路。
   - 手动记录、AI 生成、Markdown 导出、删除任务。
3. **Digital Human & ModelTicker**
   - 新建/编辑数字人、预览、发布。
   - 模型切换动画与 API 状态同步。
4. **Integrations & Error Handling**
   - n8n webhook 正常/500/超时。
   - 积分 API 正常/余额不足/超时，验证前端 toast 与后端重试。
   - Supabase RLS、Storage 权限、Service Role key 缺失时回退策略。
5. **Workers & Queues**
   - Queue backlog 监控、失败重试、死信处理。
   - Yunwu API 限流/失败时的指数退避与告警。
6. **Non-functional**
   - k6 15 min 并发 50/80；观测 CPU、内存、响应时间。
   - OWASP Top 10 手工检查（JWT、上传接口、XSS、CSR）。

## 7. Schedule
| 日期 (2026) | 活动 |
| --- | --- |
| Mar 26 | 提交 Test Plan、执行基线静态检查、准备测试数据 |
| Mar 27 | 完成自动化 E2E、API 套件回归；开始 worker/集成测试 |
| Mar 28 | UAT & 性能/安全测试；收敛缺陷；生成发布签字包 |

## 8. Risks & Mitigations
- **端口/网关冲突**：与 `sub_nginx` 管理者提前沟通变更窗口，提供回滚脚本。
- **Prisma Schema 漂移**：上线前执行 `prisma diff`; 若有变更需评审。
- **第三方 API 限流**：为 Yunwu/积分接口设置沙箱配额与报警阈值。
- **队列积压**：发布期间暂停高负载资产上传，监控 pg-boss 并启用临时扩容。

## 9. Deliverables
- 测试结果汇总（表格 + 证据链接）。
- 缺陷清单（含严重级别、负责人、ETA）。
- 发布前验证清单 & 回归报告。
