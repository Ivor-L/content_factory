# 小程序爆款复刻上传优化计划

## 目标

优化爆款复刻页面上传参考视频的速度与稳定性，减少大视频经过 Next 服务端中转带来的等待时间。

## 范围

- 后端：扩展 `/api/upload/presign`，为微信小程序返回 OSS POST 表单直传签名。
- 小程序：爆款复刻参考视频上传优先走 OSS 直传，并展示上传进度。
- 兜底：直传失败时继续使用现有 `/api/upload` 服务端中转链路。

## 最小调研

### 方案 A：继续走 `/api/upload`，只做前端压缩和大小限制

- 兼容性：改动最小，继续使用现有 Next API 与 OSS/Supabase 存储逻辑。
- 优点：无需 OSS CORS 或小程序上传域名调整。
- 缺点：视频仍然是“小程序 -> Next -> OSS”，服务端内存、带宽、请求体限制都会影响速度。
- 结论：只能作为基础保护，不适合作为主要提速方案。

### 方案 B：OSS 表单直传，Next 只生成临时签名

- 兼容性：Next 继续使用 `ali-oss` 生成 policy/signature；Taro/微信小程序使用 `Taro.uploadFile` multipart POST 上传到 OSS。
- 优点：视频不再经过业务服务器中转，上传链路更短，能绕开 Next 请求体与服务器转发瓶颈。
- 风险：OSS Bucket CORS、小程序上传合法域名、POST policy 字段必须配置正确。
- 回滚：小程序直传失败自动回退旧 `/api/upload`；接口保留原 PUT presign 字段，兼容 Web 端现有调用。
- 结论：采用此方案。

## 实施步骤

1. 扩展 `/api/upload/presign`：保留 PUT `uploadUrl`，新增 POST `postUploadUrl` 与 `postFormData`。
2. 小程序 `api.uploadMedia` 增加可选 `direct` 和 `onProgress` 参数。
3. 爆款复刻参考视频上传开启直传优先，上传态显示百分比。
4. 执行 `npm run lint`、`npm run typecheck`、小程序构建与 weapp-dev-mcp 联调。

## 验收标准

- 上传参考视频时页面显示实时进度。
- OSS 配置可用时优先直传 OSS。
- 直传失败时不阻断用户，自动回退现有服务端上传。
- 爆款复刻页面可正常渲染，运行日志无新增错误。
