# @nextide/cli

NexTide command line interface for Agent Skills Runtime.

Use it to authenticate local AI agents, list NexTide capabilities, run capability jobs, wait for long-running workflows, and export normalized artifacts.

## Install

```bash
npm install -g @nextide/cli
```

For local package smoke testing:

```bash
npm pack ./packages/nextide-cli
npm install -g ./nextide-cli-*.tgz
```

## Login

```bash
nextide auth login --api-base-url https://atomx.top
```

This starts NexTide Device Login and opens the online authorization page.
The stored credential is the user's **NexTide API Key**.

## Doctor

```bash
nextide doctor --api-base-url https://atomx.top
```

Checks API reachability, capability list, Device Login endpoint, stored NexTide API Key, and capability environment metadata.

## Capabilities

```bash
nextide capability list
nextide capability list --examples
nextide capability example viral.midform.video.generate --output .nextide/input/viral-midform.json
```

## Run a capability

Submit and return quickly:

```bash
nextide capability run viral.midform.video.generate \
  --input .nextide/input/viral-midform.json \
  --output .nextide/output/viral-midform-result.json \
  --mode submit
```

Submit and wait for final result:

```bash
nextide capability run viral.midform.video.generate \
  --input .nextide/input/viral-midform.json \
  --output .nextide/output/viral-midform-result.json \
  --mode submit \
  --wait \
  --timeout 1800 \
  --interval 5
```

## Runs

```bash
nextide run status <run-id>
nextide run wait <run-id> --timeout 1800 --interval 5
nextide run result <run-id> --output .nextide/output/result.json
nextide run artifacts <run-id> --output-dir .nextide/output/<run-id>
```

`run artifacts` reads the normalized result, writes JSON/text artifacts to local files, and records remote URL artifacts in `manifest.json`.

## Configuration priority

Runtime configuration priority:

```text
CLI flags > environment variables > ~/.nextide/config.json > defaults
```

Supported flags/env:

```text
--api-base-url / NEXTIDE_API_BASE_URL
--auth-token / NEXTIDE_AUTH_TOKEN
--user-api-key / NEXTIDE_USER_API_KEY
--nexapi-key / NEXTIDE_NEXAPI_KEY legacy only
```

## Security

- Skills and local agents should call stable NexTide capability IDs.
- Do not expose internal n8n webhooks or server secrets.
- CLI auth uses the user's NexTide API Key from `profiles.api_key`.
