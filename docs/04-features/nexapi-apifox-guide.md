# NexAPI Apifox 指南

最后更新：2026-03-26

## 1. 生成 NexAPI 版本的 Apifox 文件
1. 确保 `docs/云雾API 接口对接3.17 .apifox.json` 为官方最新版本。
2. 运行脚本：
   ```bash
   npm run build:nexapi:apifox
   ```
3. 产物：
   - `artifacts/nexapi-apifox.json`：可直接导入 Apifox 的配置文件。
   - 下载的图片位于 `public/nexapi-apifox/`，导出的 JSON 会引用 `/nexapi-apifox/<文件名>` 路径。

脚本行为：
- 将“云雾”品牌/域名替换为 NexTide/NexAPI。
- 将 `https://yunwu.ai` 系列域名改成 `https://aiapi.atomx.top` / `https://aiapi.nextide.top`。
- 自动缓存 `https://api.apifox.com/api/v1/...` 图像为本地文件。

## 2. 在 Apifox 中导入
1. 打开 Apifox → `导入` → 选择 “Apifox JSON”。
2. 选择 `artifacts/nexapi-apifox.json`。
3. 导入后检查：
   - 项目名称显示为 `NexAPI`。
   - 所有接口 Base URL 为 `https://aiapi.atomx.top` 或 `https://aiapi.atomx.top/v1/...`。
   - Markdown 文档中的图片引用 `/nexapi-apifox/...`，预览正常。

## 3. 配置环境变量
1. 在 Apifox 左侧 `环境` 面板创建一个新环境，比如 `NexAPI-Prod`。
2. 添加变量：
   | 名称 | 示例值 | 说明 |
   |------|--------|------|
   | `base_url` | `https://aiapi.atomx.top` | 线路主域名 |
   | `api_key` | `nxt_sk_xxx` | 在 NexAPI 控制台生成的用户密钥 |
3. 请求头统一设置 `Authorization: Bearer {{api_key}}`。

## 4. 分享给客户
1. 在 Apifox 里选择 `分享` → `导出` → `Apifox JSON`，即可生成带品牌配置的文件。
2. 配套文档建议包含：
   - 域名/备用域名及切换说明。
   - 如何在 NexAPI 控制台创建 API Key。
   - 计费方式和积分换算。

## 5. 更新流程
当云雾官方发布新接口时：
1. 用最新 JSON 覆盖 `docs/云雾API 接口对接3.17 .apifox.json`。
2. 运行 `npm run build:nexapi:apifox` 重新生成产物。
3. 将新的 `artifacts/nexapi-apifox.json` 分享给客户，并更新版本记录。
