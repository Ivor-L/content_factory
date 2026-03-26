# Viral Reference Sync

## Overview

- Chrome extension `nextide-extension` posts data to `/api/viral-references/import`.
- New tables: `viral_reference_items` and `viral_creators` store notes and creator snapshots.
- Front-end surfaces: Scripts page now has "爆款内容" and "对标创作者" tabs backed by these APIs. Replication form can bind a selected reference and creator when submitting tasks.

## API Endpoints

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/viral-references/import` | POST | Batch ingest notes/profiles from extension (requires `x-user-api-key`). |
| `/api/viral-references` | GET | Paginated list, filter by platform/category/query. Returns `creator` relation. |
| `/api/viral-creators` | GET | Paginated list with optional reference samples and counts. |
| `/api/viral-creators/[id]/sync` | POST | Triggers the configured webhook (`VIRAL_CREATOR_SYNC_WEBHOOK_URL`) so n8n/采集器可以拉取该创作者的最新笔记，并自动刷新前端列表；若未配置，该接口会回退到应用内的 `/api/webhook/creator-sync` 默认处理逻辑，仅记录请求。 |

Snapshots of the selected reference/creator are written into `replications.inputParams` and forwarded to n8n so downstream workflows can enrich prompts.

## Plugin Configuration

1. Install the unpacked extension from `workflows/nextide-extension-v0.1.2`.
2. Open the extension options page and set:
   - **API Base URL**: e.g. `https://app.contentfactory.ai` (no trailing slash).
   - **API Key**: personal API key from the Content Factory profile page.
   - **Dev/Preview**: 本地或内网穿透调试时可临时填写例如 `https://nextide.cpolar.top/nextide`，**上线前必须改回正式域名**（如 `https://app.contentfactory.ai`），否则线上用户无法访问。
3. The extension stores both values via `chrome.storage.sync` and automatically sends collected notes to `<base>/api/viral-references/import`.

If the API key is missing the sidebar will display `请先在插件设置中配置内容工厂 API Key` and syncing will be blocked.

## 插件更新/分发指引

运营或开发修改插件代码（`workflows/nextide-extension-v0.1.2`）后，必须手动重新打包发版，否则导航栏「下载 XX 助手」仍会指向旧 zip。

1. 在项目根目录执行 `npm run build:extensions`（脚本 `scripts/build-extension-packages.ts` 会复制基础插件、注入对应租户名称/图标，并生成 zip）。
2. 打包完成后检查 `public/extensions/`，应看到当前租户 zip（NexTide + 聚保盆）：
   - `nextide-assistant.zip`
   - `jubaopen-assistant.zip`
   时间戳需要是本次构建时间。
3. 线上导航栏头像菜单的「下载 XX 助手」链接固定指向 `/extensions/{slug}-assistant.zip`（由 `components/Sidebar.tsx` 渲染），因此只要上述 zip 更新，用户即可立即下载到最新版。
4. 让终端用户重新下载对应租户 zip，Chrome → 设置 → 扩展程序 → 打开「开发者模式」，删除旧版本后点击「加载已解压的扩展程序」，选择新 zip 解压后的目录或直接拖入更新文件夹；Chrome 不会自动替换同名 zip。
5. 如发现样式/功能未变化，优先核对 zip 修改时间、确认浏览器确实加载的是新目录（有需要可彻底移除旧扩展再重新导入）。

## UI Flow

- Scripts → "爆款内容" tab lists references (platform pills, category chips, search box).
- Scripts → "对标创作者" surfaces blogger cards with follower metrics and their latest reference.
- Replication form now shows two picker panels so users can attach a reference note + benchmark creator when submitting one-click/storyboard/digital human jobs.

## Rollout Checklist

- [ ] Provide each operator with a Content Factory API key.
- [ ] Configure extension options on capture machines.
- [ ] Run a manual capture, verify `/api/viral-references` returns new entries, and confirm the Scripts page + Replication form display them.
