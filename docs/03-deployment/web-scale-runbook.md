# Web 多副本扩容 Runbook

> 适用：4 核 8G 服务器上用 Docker Compose 部署 Content Factory Web。  
> 背景：线上压测显示数据库查询已是亚毫秒级，但单 Next.js Node 进程在 25+ 并发下出现应用层排队和长尾。

## 架构

当前 Compose 将 `web` 服务改为内部服务，通过 `nginx` 容器暴露公网端口：

```text
公网 :3002
  -> nginx(content-factory-web)
    -> web 副本 1..N (:3000)
```

`web` 服务不再固定 `container_name` 和宿主端口，因此可以使用 `--scale web=N` 横向扩容。

## 推荐副本数

4 核 8G 建议：

- 首次：`web=3`
- 若 CPU 仍有余量、数据库连接稳定：可试 `web=4`
- 若数据库连接数升高或内存压力明显：回退 `web=2`

## 上线步骤

> 在服务器项目目录执行。

1. 拉取最新代码：

```bash
git pull --ff-only
```

2. 确认 `.env` 中建议开启启动跳过 db push：

```env
SKIP_PRISMA_DB_PUSH=1
PRISMA_DB_PUSH_REQUIRED=1
```

3. 建议限制 Prisma 连接池，避免多副本放大 DB 连接：

如果 `DATABASE_URL` 没有 query 参数：

```env
DATABASE_URL=postgresql://...?... # 按实际格式追加 connection_limit=3&pool_timeout=10
```

示例：

```env
DATABASE_URL=postgresql://user:pass@host:5432/db?connection_limit=3&pool_timeout=10
```

如果已有 query 参数，则追加：

```text
&connection_limit=3&pool_timeout=10
```

4. 启动 3 个 Web 副本：

```bash
docker compose up -d --build --scale web=3
```

5. 查看服务：

```bash
docker compose ps
```

预期看到：

- 1 个 `content-factory-web` nginx 容器，暴露 `3002:80`
- 3 个 `web` 副本，仅内部 `3000`

6. 查看资源：

```bash
docker stats
```

## 压测复验

先测 25 并发：

```bash
LOADTEST_MODE=readonly TARGET_VUS=25 DURATION_SECONDS=120 npm run loadtest:node
```

稳定后测 50：

```bash
LOADTEST_MODE=readonly TARGET_VUS=50 DURATION_SECONDS=120 npm run loadtest:node
```

最后再测 100：

```bash
LOADTEST_MODE=readonly TARGET_VUS=100 DURATION_SECONDS=120 npm run loadtest:node
```

## 观察指标

压测期间观察：

```bash
docker stats
```

重点：

- 单个 web 副本 CPU 是否仍接近 100%。
- nginx CPU 是否异常。
- 总内存是否逼近 8G。
- 数据库连接数是否异常升高。

## 回滚

回退到单副本：

```bash
docker compose up -d --scale web=1
```

若 nginx 配置异常，可临时回退上一版本 compose 或恢复直接端口映射。

## 注意事项

- `container_name` 只能保留在 nginx，不能放在 `web`，否则无法 scale。
- `ports` 只能放在 nginx，不能放在 `web`，否则多个副本端口冲突。
- 多副本会让进程内短 TTL 缓存变成每副本独立缓存，这是可接受的；热点请求仍会被每个副本本地缓存削峰。
