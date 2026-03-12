# n8n Workflow Sync Playbook

This doc keeps the Content Factory app’s n8n workflows aligned between the live instance (`https://n8n.atomx.top`) and the repository snapshots under `workflows/`.

## 1. Scope & Ownership
| Workflow | ID | Trigger / Purpose | Snapshot Path |
|----------|----|-------------------|---------------|
| Content Factory Digital Human Gen | `t8l47ZgqYyab0X0D` | Front-end uploads image/audio → Runninghub submission → Supabase status | `workflows/t8l47ZgqYyab0X0D.json` |
| Content Factory Digital Human Callback | `eFM4rgmZI8bhSZut` | Runninghub callback → Next.js API relay → Supabase update | `workflows/eFM4rgmZI8bhSZut.json` |
| 爆款拆解-Veo3&sora-网页版 | `xXldwYS5d3lCTNwE` | Script breakdown + Yunwu prompt + Supabase writes | `workflows/xXldwYS5d3lCTNwE.json` |
| product-dna-web-fix | `dD3z4oaWhFNNIL3K` | Product DNA analysis → Supabase products table | `workflows/dD3z4oaWhFNNIL3K.json` |
| 一键生成9宫格-剧情版plus-网页版 | `xNY4qhKT2cwXYi0v` | Storyboard + grid image generation | `workflows/xNY4qhKT2cwXYi0v.json` |

> Add new workflows to this table whenever a repo change needs a deployed counterpart.

## 2. Sync Lifecycle
1. **Pull latest from n8n (Source of Truth)**
   ```bash
   curl -s -H "X-N8N-API-KEY:$N8N_API_KEY" \
        "https://n8n.atomx.top/api/v1/workflows/<WORKFLOW_ID>" \
        | jq '.' > workflows/<WORKFLOW_ID>.json
   ```
   - Use `N8N_API_KEY` from `.trae/skills/xiangyu-n8n-workflow-building/credentials/n8n.md`.
   - Never hand-edit the files directly in n8n’s UI without exporting the new JSON the same day.

2. **Review & Commit**
   - Run `git diff workflows/<id>.json` to confirm only intended nodes changed.
   - Mention the workflow ID + `updatedAt` timestamp in the PR description for traceability.

3. **Deploy changes back to n8n**
   - Preferred: local sandbox → `n8n import:workflow --input workflows/<id>.json` → test → use n8n UI’s “Import from file” on production or `PUT /api/v1/workflows/<id>`.
   - Record the deployed version (`versionId`) in the PR or commit message if a hotfix was applied via API.

4. **Execution smoke test**
   - After deploying, manually trigger the workflow’s HTTP endpoint to ensure Supabase + external services succeed.
   - Capture execution IDs in release notes when possible.

## 3. Reusable Fetch Script
To refresh all tracked workflows at once (already used this session):
```bash
python scripts/fetch_n8n_workflows.py
```
`fetch_n8n_workflows.py` should:
- Read the `WORKFLOW_IDS` list (same as the table above).
- Call the REST endpoint and dump JSON with `ensure_ascii=False, indent=2`.
- Log `Saved <id> -> workflows/<id>.json`.

> Until that script exists, rerun the snippet from section 2.1 (or reuse `.trae/skills/.../runs/*` exports) and keep this table updated.

## 4. Change Checklist
- [ ] Export live workflow JSON → place under `workflows/`.
- [ ] Update documentation or code that references the workflow (e.g., webhook paths, Supabase schema).
- [ ] Run at least one execution after deploying to confirm credits / Supabase writes / external API calls.
- [ ] Link execution ID or timestamp in PR comment for audit.

Following this loop ensures repo snapshots stay authoritative without guessing what’s in n8n production.
