# Supabase Realtime 实时推送架构

## 概述

本项目使用 **Supabase Realtime** 替代轮询，当数据库记录发生变化时，前端即时收到推送更新，无需反复请求 API。

---

## 基础设施配置

### 1. Supabase Realtime Publication

所有需要推送的表必须加入 `supabase_realtime` publication。当前已加入的表：

```sql
-- 分镜
ALTER PUBLICATION supabase_realtime ADD TABLE storyboard_segments, storyboard_tasks;

-- 脚本处理、复制任务、小红书文生图
ALTER PUBLICATION supabase_realtime ADD TABLE scripts, replications, creative_tasks;

-- 数字人视频、图文海报（已包含）
-- digital_human_videos, xhs_poster_jobs
```

> 新增需要实时推送的表时，执行 `ALTER PUBLICATION supabase_realtime ADD TABLE <表名>;` 即可。

### 2. Nginx WebSocket 代理

Nginx 需要对 `/realtime/v1/websocket` 路径单独处理 WebSocket 升级，配置位于：

```
/root/SubscriptionSystem/nginx/conf.d/supabase-api.conf
```

关键配置：

```nginx
location /realtime/v1/websocket {
    proxy_pass http://supabase_kong_content-factory-web_3:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
}
```

修改后执行 `docker exec sub_nginx nginx -s reload` 生效。

### 3. Kong API Gateway 端口映射

Kong 容器（`supabase_kong_content-factory-web_3`）的 8000 端口映射到宿主机的 **54321** 端口（不是 8000），Nginx 通过容器名 `supabase_kong_content-factory-web_3:8000` 访问。

### 4. API Key

Kong 配置了 key 转换规则：
- 前端传 `sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH`（短格式）
- Kong 自动替换为标准 JWT 格式，再转发给 Realtime 服务

`.env` 中应使用：
```
NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
```

---

## 已迁移功能一览

| 功能 | 文件 | 监听表 | 原轮询间隔 |
|------|------|--------|-----------|
| 分镜任务状态 | `storyboard/[id]/ViralCloneStoryboardPage.tsx` | `storyboard_tasks` | 5s |
| 分镜分段更新 | `storyboard/[id]/ViralCloneStoryboardPage.tsx` | `storyboard_segments` | 5s |
| 脚本处理状态（详情页） | `scripts/[id]/ScriptStatusPoller.tsx` | `scripts` | 3s |
| 脚本状态标签（列表页） | `scripts/ScriptStatusBadge.tsx` | `scripts` | 5s |
| 复制任务状态 | `replication/[id]/ReplicationDetail.tsx` | `replications` | 2s |
| 图文海报任务 | `replication/ReplicationContent.tsx` | `xhs_poster_jobs` | 8s |
| 数字人视频 | `replication/ReplicationContent.tsx` | `digital_human_videos` | 已有 |
| 小红书文生图任务 | `xhs-poster/hooks/useCreativeTaskPolling.ts` | `creative_tasks` | 3.5s |

---

## 前端实现模式

### 标准订阅写法

```typescript
useEffect(() => {
  if (isTerminal) return;

  const channel = supabase
    .channel(`唯一频道名-${id}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "表名", filter: `id=eq.${id}` },
      (payload) => {
        const data = payload.new as YourType;
        // 更新本地状态
        setState(data);
        // 终态时刷新页面
        if (data.status === "completed") router.refresh();
      }
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [id, isTerminal, router]);
```

### 超时保护（生成类任务）

若任务状态卡在生成中超过 **5 分钟**，自动解除按钮禁用，允许用户重试：

```typescript
const GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

useEffect(() => {
  if (task.status !== "IMAGE_GENERATING" && task.status !== "VIDEO_GENERATING") {
    generatingStartRef.current = null;
    setGeneratingTimedOut(false);
    return;
  }
  if (!generatingStartRef.current) generatingStartRef.current = Date.now();
  const remaining = GENERATION_TIMEOUT_MS - (Date.now() - generatingStartRef.current);
  if (remaining <= 0) { setGeneratingTimedOut(true); return; }
  const timer = setTimeout(() => setGeneratingTimedOut(true), remaining);
  return () => clearTimeout(timer);
}, [task.status]);
```

---

## 图片生成流程（同步响应）

n8n workflow `storyboard_image_generate_fixed`（ID: `YPzVxDvKVKPVmPuo`）使用 `respondToWebhook` 节点，调用方式为**同步**：

- n8n 处理完图片后，在 HTTP 响应体中直接返回 `{ image_url: "..." }`
- API route `generate-images/route.ts` 读取响应体，若有 `image_url` 则立即将 segment 状态设为 `IMAGE_READY` 并存入 DB
- Realtime 推送触发前端更新，图片即时显示

Webhook 地址配置（`.env`）：
```
N8N_IMAGE_GEN_WEBHOOK="https://hooks.atomx.top/webhook/storyboard-image-generate"
```

---

## 视频生成流程

视频生成使用异步 webhook 回调方式：

- 模型 `veo_3_1-fast` 和 `veo3` 使用同一个 webhook：
  ```
  N8N_VEO3_WEBHOOK="https://hooks.atomx.top/webhook/storyboard_video"
  ```
- 触发后 segment 状态变为 `VIDEO_GENERATING`，n8n 生成完成后回调 `/api/webhook/storyboard-video`，Realtime 推送更新前端
