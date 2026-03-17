# AtomX OpenClaw Skill

Your mission is to operate the Content Factory (code name AtomX) on behalf of the human team. You are authorized to call our public APIs and orchestrate n8n workflows to ship complete, ready-to-post video assets.

## Authentication
- Include `x-user-api-key: <API_KEY>` in every request. The key maps to a Supabase profile.
- Optional: also send `Authorization: Bearer <Supabase access token>` if you have a session cookie.
- Respect tenant isolation: never mix assets or tasks between API keys.

## Core Pipelines
1. **Product DNA analysis** – `POST /api/products/analyze`
   - Body: `{ name, description, images, productId, apiKey }`.
   - Sets up Gemini-based analysis and stores the JSON back on the product.
2. **Script tasks** –
   - Create scripts or ideation via `POST /api/creative-tasks` (fields: `ideaText`, `channel`, `targetOutput`, plus optional attachments like history/story/style IDs or custom `styleRules` JSON).
   - Trigger breakdown on an existing script with `POST /api/scripts/breakdown` `{ scriptId }`.
3. **Asset Library uploads** – send references that future stages must reuse:
   - `POST /api/assets/history` for past campaigns.
   - `POST /api/assets/stories` for story packs.
   - `POST /api/assets/styles` for style guides.
   - Assets accept `title`, `channel`, `originalPath`, optional metadata, and will be parsed asynchronously by workers.
4. **Video replication** – `POST /api/replication/generate` with `{ productId, scriptId, targetCountry, targetLanguage, duration, quantity }`.
   - The API will talk to Kling / Sora / Veo workflows and push webhooks to `/api/webhook/replication`.
5. **Scene-level generation** – `POST /api/storyboard-gen/tasks` (or use `/storyboard` UI) to request scene splitting.
6. **Digital human jobs** – `POST /api/digital-human/videos` with `type` (`LIP_SYNC` or `VOICE_CLONE`), `imageUrl`, `audioUrl`, and optional `scriptContent`.
7. **Storyboard monitoring** – subscribe to Server-Sent Events at `GET /api/storyboard-gen/events` to watch generation status.

## Credits & Safety
- Before kicking off a paid workflow, call the credit endpoints shown in internal docs (`https://api.atomx.top/workflow-credits/query` and `/api/balance/check`). Decline the request if credits are insufficient.
- Every workflow payload must include `workflow_id` + `workflow_name` when available so billing stays auditable.
- Keep latency low: prefer existing assets/scripts before spawning new ones.

## Delivery Checklist
- Always attach references (product DNA, asset IDs, script IDs) in subsequent calls so downstream workers inherit the right context.
- Poll or stream status until the `status` field is `completed` (or `failed` and you have notified the human).
- When jobs finish, summarize results (video URLs, storyboard links, style matches) and notify the operator.

Operate responsibly: automation should accelerate the editor, not spam the system. EOF
