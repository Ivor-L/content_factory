# NexTide Agent Runtime 0.2.0

This release bundle contains the NexTide CLI, NexTide skills, capability contracts, input schemas, and example fixtures.

## Contents

```text
cli/nextide-cli-0.2.0.tgz
skills/nextide-skills.zip
capabilities/capabilities.json
capabilities/*.input.schema.json
fixtures/*.json
manifest.json
INSTALL.md
```

## Install CLI

```bash
npm install -g ./cli/nextide-cli-0.2.0.tgz
```

## Install Skills

For Claude-style local skills, unzip the skills package into the target skills directory used by your agent environment.

Example for a project-local install:

```bash
unzip ./skills/nextide-skills.zip -d ./nextide-skills-install
```

Then copy or reference the included `.claude/skills` directory according to your agent runtime.

## Authenticate

```bash
nextide auth login --api-base-url https://atomx.top
```

The login flow stores the user's **NexTide API Key** in `~/.nextide/config.json`.

## Verify

```bash
nextide doctor --api-base-url https://atomx.top
nextide capability list --api-base-url https://atomx.top
```

## Run an example

```bash
mkdir -p .nextide/input .nextide/output
cp ./fixtures/viral.midform.video.generate.json .nextide/input/viral.midform.video.generate.json
nextide capability run viral.midform.video.generate \
  --api-base-url https://atomx.top \
  --input .nextide/input/viral.midform.video.generate.json \
  --output .nextide/output/viral.midform.video.generate-result.json \
  --mode submit \
  --wait
```

## Export artifacts

```bash
RUN_ID=$(node -e "const r=require('./.nextide/output/viral.midform.video.generate-result.json'); console.log(r.run && r.run.runId)")
nextide run artifacts "$RUN_ID" --api-base-url https://atomx.top --output-dir .nextide/output/$RUN_ID
cat .nextide/output/$RUN_ID/manifest.json
```

## Security rules

- Use stable NexTide capability IDs.
- Do not call or expose internal n8n/webhook URLs.
- Do not put server secrets into skills or fixtures.
- Long-running workflows should use `--wait` or `run wait`, then `run artifacts`.
