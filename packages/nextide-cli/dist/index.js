#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
const DEFAULT_API_BASE_URL = 'http://localhost:3000';
const CONFIG_DIR = path.join(os.homedir(), '.nextide');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
function parse(argv) {
    const args = [];
    const flags = {};
    for (let i = 0; i < argv.length; i++) {
        const item = argv[i];
        if (item.startsWith('--')) {
            const key = item.slice(2);
            const next = argv[i + 1];
            if (next && !next.startsWith('--')) {
                flags[key] = next;
                i++;
            }
            else {
                flags[key] = true;
            }
        }
        else {
            args.push(item);
        }
    }
    return { args, flags };
}
async function loadConfig() {
    if (!existsSync(CONFIG_PATH))
        return {};
    try {
        return JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
    }
    catch {
        return {};
    }
}
async function saveConfig(config) {
    await mkdir(CONFIG_DIR, { recursive: true });
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}
function valueFlag(flags, key) {
    return typeof flags[key] === 'string' ? flags[key] : undefined;
}
async function resolveRuntime(flags) {
    const config = await loadConfig();
    return {
        config,
        apiBaseUrl: valueFlag(flags, 'api-base-url') || process.env.NEXTIDE_API_BASE_URL || config.apiBaseUrl || DEFAULT_API_BASE_URL,
        authToken: valueFlag(flags, 'auth-token') || process.env.NEXTIDE_AUTH_TOKEN || config.authToken || '',
        userApiKey: valueFlag(flags, 'user-api-key') || process.env.NEXTIDE_USER_API_KEY || config.userApiKey || '',
        nexApiKey: valueFlag(flags, 'nexapi-key') || valueFlag(flags, 'nex-api-key') || process.env.NEXTIDE_NEXAPI_KEY || config.nexApiKey || '',
    };
}
async function requestJson(url, init = {}, runtime) {
    const headers = new Headers(init.headers || {});
    if (!headers.has('content-type') && init.body)
        headers.set('content-type', 'application/json');
    if (runtime?.authToken)
        headers.set('authorization', `Bearer ${runtime.authToken}`);
    if (runtime?.userApiKey)
        headers.set('x-user-api-key', runtime.userApiKey);
    if (runtime?.nexApiKey)
        headers.set('x-nexapi-key', runtime.nexApiKey);
    const res = await fetch(url, { ...init, headers });
    const text = await res.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    }
    catch {
        data = text;
    }
    if (!res.ok) {
        const payload = typeof data === 'object' && data !== null ? data : { message: String(data || '') };
        const code = String(payload.code || payload.error || httpStatusToErrorCode(res.status));
        const message = String(payload.message || payload.error || `HTTP ${res.status}`);
        const explanation = explainError(code, message);
        const err = new Error(`${explanation.title}: ${explanation.message}`);
        err.status = res.status;
        err.code = code;
        err.payload = payload;
        err.explanation = explanation;
        throw err;
    }
    return data;
}
function httpStatusToErrorCode(status) {
    if (status === 401 || status === 403)
        return 'unauthorized';
    if (status === 402 || status === 429)
        return 'quota_exceeded';
    if (status === 404)
        return 'capability_unavailable';
    if (status >= 500)
        return 'workflow_failed';
    return `http_${status}`;
}
function explainError(code, message) {
    const normalized = String(code || '').toLowerCase();
    const raw = String(message || '').trim();
    const map = {
        unauthorized: {
            title: '认证失败',
            message: raw || '缺少或无效的 NexTide 凭证。',
            nextActions: ['运行 nextide auth login', '运行 nextide status 确认已登录', '重新执行该 capability'],
        },
        quota_exceeded: {
            title: '积分不足或额度受限',
            message: raw || '当前账号积分或额度不足。',
            nextActions: ['充值或升级套餐', '减少本次任务规模', '稍后重新执行任务'],
        },
        capability_unavailable: {
            title: '能力不可用',
            message: raw || '该 capability 尚未部署、未启用或不在当前 channel。',
            nextActions: ['确认 capability id 是否正确', '优先使用 stable channel 能力', '等待 Web runner 部署完成后重试'],
        },
        workflow_failed: {
            title: '工作流执行失败',
            message: raw || '上游工作流或服务执行失败。',
            nextActions: ['检查输入链接/素材是否可访问', '降低批量数量后重试', '保留 runId 交给管理员排查'],
        },
        wait_timeout: {
            title: '等待超时',
            message: raw || '任务在指定时间内没有完成。',
            nextActions: ['稍后运行 nextide run status <run-id>', '继续运行 nextide run follow <run-id>', '如果长时间无变化，保留 runId 反馈给管理员'],
        },
        run_store_not_implemented: {
            title: '长任务查询尚未完整接入',
            message: raw || '该 capability 已登记，但 run status/result 查询层尚未完整实现。',
            nextActions: ['在 NexTide UI 中查看对应任务', '等待 runner 查询层部署', '使用相邻 stable 能力'],
        },
    };
    const fallback = map[normalized] || {
        title: '任务失败',
        message: raw || `NexTide 返回错误：${normalized || 'unknown_error'}`,
        nextActions: ['检查输入参数', '稍后重试', '保留 runId 和错误信息用于排查'],
    };
    return { code: normalized || 'unknown_error', ...fallback };
}
function withExplanation(data) {
    const error = data?.error || data?.run?.error;
    if (error && typeof error === 'object') {
        const explanation = explainError(error.code || error.error, error.message);
        return { ...data, explanation };
    }
    return data;
}
function print(data) {
    console.log(JSON.stringify(data, null, 2));
}
async function authLogin(flags) {
    const runtime = await resolveRuntime(flags);
    const code = await requestJson(`${runtime.apiBaseUrl}/api/agent/auth/device/code`, {
        method: 'POST',
        body: JSON.stringify({
            label: valueFlag(flags, 'label') || 'NexTide CLI',
            verificationBaseUrl: valueFlag(flags, 'verification-base-url') || valueFlag(flags, 'web-base-url') || 'https://atomx.top',
            client: { name: '@nextide/cli', platform: process.platform, hostname: os.hostname() },
        }),
    });
    console.log('Open this URL to authorize NexTide CLI:');
    console.log(code.verification_uri_complete || code.verification_uri);
    console.log('');
    console.log(`Code: ${code.user_code}`);
    console.log('Waiting for approval...');
    const interval = Math.max(Number(code.interval || 3), 1) * 1000;
    const expiresAt = Date.now() + Number(code.expires_in || 600) * 1000;
    while (Date.now() < expiresAt) {
        await new Promise((resolve) => setTimeout(resolve, interval));
        try {
            const token = await requestJson(`${runtime.apiBaseUrl}/api/agent/auth/device/token`, {
                method: 'POST',
                body: JSON.stringify({ device_code: code.device_code }),
            });
            if (token.access_token) {
                await saveConfig({
                    ...runtime.config,
                    apiBaseUrl: runtime.apiBaseUrl,
                    userApiKey: token.access_token,
                });
                console.log('Authorized. Config saved to ' + CONFIG_PATH);
                return;
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('authorization_pending') || message.includes('HTTP 428'))
                continue;
            throw error;
        }
    }
    throw new Error('Device login expired. Run nextide auth login again.');
}
async function doctor(flags) {
    const runtime = await resolveRuntime(flags);
    const checks = [];
    async function check(name, fn) {
        try {
            const details = await fn();
            checks.push({ name, ok: true, details });
        }
        catch (error) {
            checks.push({ name, ok: false, details: error instanceof Error ? error.message : String(error) });
        }
    }
    await check('api_base_url', async () => ({ apiBaseUrl: runtime.apiBaseUrl }));
    await check('capability_list', async () => {
        const data = await requestJson(`${runtime.apiBaseUrl}/api/agent/capabilities`, {}, runtime);
        return { count: Array.isArray(data.capabilities) ? data.capabilities.length : 0 };
    });
    await check('device_code_endpoint', async () => {
        const data = await requestJson(`${runtime.apiBaseUrl}/api/agent/auth/device/code`, {
            method: 'POST',
            body: JSON.stringify({ label: 'NexTide CLI Doctor', verificationBaseUrl: 'https://atomx.top', client: { name: '@nextide/cli doctor' } }),
        });
        return { hasDeviceCode: Boolean(data.device_code), verificationUri: data.verification_uri_complete || data.verification_uri };
    });
    await check('stored_nexTide_api_key', async () => {
        if (!runtime.userApiKey)
            throw new Error('No NexTide API Key found. Run nextide auth login.');
        return { present: true };
    });
    await check('capability_environment_metadata', async () => {
        const data = await requestJson(`${runtime.apiBaseUrl}/api/agent/capabilities`, {}, runtime);
        const envHints = (data.capabilities || [])
            .filter((cap) => Array.isArray(cap.requiredEnv) && cap.requiredEnv.length > 0)
            .map((cap) => ({ id: cap.id, requiredEnv: cap.requiredEnv }));
        return { capabilitiesWithEnvHints: envHints.length, envHints };
    });
    await check('capability_credit_config_audit', async () => {
        const data = await requestJson(`${runtime.apiBaseUrl}/api/agent/capabilities?includeCreditAudit=1`, {}, runtime);
        if (data.creditAudit) {
            return data.creditAudit;
        }
        const capabilities = data.capabilities || [];
        const missingFeatureKey = capabilities.filter((cap) => !cap.featureKey).map((cap) => cap.id);
        return {
            ok: missingFeatureKey.length === 0,
            total: capabilities.length,
            missingFeatureKey,
            note: 'Server does not expose creditAudit yet; checked featureKey presence only.',
        };
    });
    const ok = checks.every((item) => item.ok);
    print({ ok, apiBaseUrl: runtime.apiBaseUrl, configPath: CONFIG_PATH, checks });
    if (!ok)
        process.exitCode = 1;
}
async function capabilityList(flags) {
    const runtime = await resolveRuntime(flags);
    const data = await requestJson(`${runtime.apiBaseUrl}/api/agent/capabilities`, {}, runtime);
    if (flags.examples) {
        const capabilities = Array.isArray(data.capabilities) ? data.capabilities : [];
        print({
            capabilities: capabilities.map((cap) => ({
                id: cap.id,
                title: cap.title,
                examples: cap.examples || [],
            })),
        });
        return;
    }
    print(data);
}
async function capabilityExample(args, flags) {
    const id = args[2];
    if (!id)
        throw new Error('capability id is required');
    const runtime = await resolveRuntime(flags);
    const data = await requestJson(`${runtime.apiBaseUrl}/api/agent/capabilities`, {}, runtime);
    const capability = (data.capabilities || []).find((cap) => String(cap.id).toLowerCase() === id.toLowerCase());
    if (!capability)
        throw new Error(`Capability not found: ${id}`);
    const examples = Array.isArray(capability.examples) ? capability.examples : [];
    const indexRaw = valueFlag(flags, 'index') || '0';
    const index = Math.max(0, Number.parseInt(indexRaw, 10) || 0);
    const example = examples[Math.min(index, Math.max(examples.length - 1, 0))];
    const output = valueFlag(flags, 'output');
    const payload = example?.input || buildInputSkeleton(capability.inputSchema || {});
    if (output) {
        await mkdir(path.dirname(output), { recursive: true });
        await writeFile(output, JSON.stringify(payload, null, 2));
    }
    print({ capabilityId: capability.id, exampleName: example?.name || 'generated-from-input-schema', input: payload, output });
}
function buildInputSkeleton(schema) {
    const input = {};
    for (const [key, field] of Object.entries(schema)) {
        if (field.default !== undefined) {
            input[key] = field.default;
            continue;
        }
        if (Array.isArray(field.enum) && field.enum.length > 0) {
            input[key] = field.enum[0];
            continue;
        }
        if (!field.required)
            continue;
        if (field.type === 'number')
            input[key] = 0;
        else if (field.type === 'boolean')
            input[key] = false;
        else if (field.type === 'object')
            input[key] = {};
        else if (String(field.type).endsWith('[]') || field.type === 'array')
            input[key] = [];
        else
            input[key] = `TODO_${key}`;
    }
    return input;
}
async function capabilityRun(args, flags) {
    const id = args[2];
    if (!id)
        throw new Error('capability id is required');
    const inputPath = valueFlag(flags, 'input');
    if (!inputPath)
        throw new Error('--input file is required');
    const outputPath = valueFlag(flags, 'output');
    const mode = valueFlag(flags, 'mode') || 'submit';
    const wait = Boolean(flags.wait) || mode === 'wait';
    const runtime = await resolveRuntime(flags);
    const input = JSON.parse(await readFile(inputPath, 'utf8'));
    const data = await requestJson(`${runtime.apiBaseUrl}/api/agent/capabilities/${encodeURIComponent(id)}/run`, {
        method: 'POST',
        body: JSON.stringify({ input, mode }),
    }, runtime);
    const finalData = wait && data.run?.runId && isPendingStatus(data.run.status)
        ? await pollRun(runtime, data.run.runId, flags)
        : data;
    if (outputPath) {
        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, JSON.stringify(finalData, null, 2));
    }
    print(finalData);
}
async function runStatus(args, flags) {
    const id = args[2];
    if (!id)
        throw new Error('run id is required');
    const runtime = await resolveRuntime(flags);
    print(await requestJson(`${runtime.apiBaseUrl}/api/agent/runs/${encodeURIComponent(id)}`, {}, runtime));
}
async function runWait(args, flags) {
    const id = args[2];
    if (!id)
        throw new Error('run id is required');
    const runtime = await resolveRuntime(flags);
    const data = await pollRun(runtime, id, flags);
    const outputPath = valueFlag(flags, 'output');
    if (outputPath) {
        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, JSON.stringify(data, null, 2));
    }
    print(data);
}
async function runFollow(args, flags) {
    const id = args[2];
    if (!id)
        throw new Error('run id is required');
    const runtime = await resolveRuntime(flags);
    const outputDir = valueFlag(flags, 'output-dir') || path.join('.nextide', 'output', id);
    const data = await pollRun(runtime, id, flags, { log: true });
    const status = data?.run?.status || data?.status;
    const shouldExport = flags.artifacts !== false && status === 'succeeded';
    let artifactExport = undefined;
    if (shouldExport) {
        artifactExport = await exportArtifactsForRun(id, runtime, outputDir, {
            ...flags,
            download: true,
            gallery: true,
            datatable: true,
            'output-dir': outputDir,
        });
    }
    const explanation = status !== 'succeeded'
        ? explainError(data?.error?.code || data?.run?.error?.code || status, data?.error?.message || data?.run?.error?.message)
        : undefined;
    print({ ok: status === 'succeeded', runId: id, status, result: data, artifactExport, outputDir: shouldExport ? outputDir : undefined, explanation });
}
async function pollRun(runtime, runId, flags, options = {}) {
    const timeoutSeconds = Number(valueFlag(flags, 'timeout') || 1800);
    const intervalSeconds = Number(valueFlag(flags, 'interval') || 5);
    const deadline = Date.now() + Math.max(timeoutSeconds, 1) * 1000;
    let last = null;
    let lastStatus = undefined;
    while (Date.now() <= deadline) {
        last = await requestJson(`${runtime.apiBaseUrl}/api/agent/runs/${encodeURIComponent(runId)}`, {}, runtime);
        const status = last.run?.status;
        if (options.log && status !== lastStatus) {
            console.error(`[nextide] run ${runId}: ${String(status || 'unknown')}`);
            lastStatus = status;
        }
        if (!isPendingStatus(status)) {
            if (status === 'succeeded') {
                try {
                    return await requestJson(`${runtime.apiBaseUrl}/api/agent/runs/${encodeURIComponent(runId)}/result`, {}, runtime);
                }
                catch {
                    return last;
                }
            }
            return last;
        }
        await new Promise((resolve) => setTimeout(resolve, Math.max(intervalSeconds, 1) * 1000));
    }
    return withExplanation({
        run: last?.run,
        error: {
            code: 'wait_timeout',
            message: `Timed out waiting for run ${runId}`,
            timeoutSeconds,
        },
    });
}
function isPendingStatus(status) {
    return status === 'queued' || status === 'running' || status === 'waiting_callback';
}
async function runCancel(args, flags) {
    const id = args[2];
    if (!id)
        throw new Error('run id is required');
    const runtime = await resolveRuntime(flags);
    const data = await requestJson(`${runtime.apiBaseUrl}/api/agent/runs/${encodeURIComponent(id)}/cancel`, {
        method: 'POST',
        body: JSON.stringify({}),
    }, runtime);
    const outputPath = valueFlag(flags, 'output');
    if (outputPath) {
        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, JSON.stringify(data, null, 2));
    }
    print(data);
}
async function runResult(args, flags) {
    const id = args[2];
    if (!id)
        throw new Error('run id is required');
    const runtime = await resolveRuntime(flags);
    const data = await requestJson(`${runtime.apiBaseUrl}/api/agent/runs/${encodeURIComponent(id)}/result`, {}, runtime);
    const outputPath = valueFlag(flags, 'output');
    if (outputPath) {
        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, JSON.stringify(data, null, 2));
    }
    print(data);
}
async function runArtifacts(args, flags) {
    const id = args[2];
    if (!id)
        throw new Error('run id is required');
    const runtime = await resolveRuntime(flags);
    const outputDir = valueFlag(flags, 'output-dir') || path.join('.nextide', 'output', id);
    const result = await exportArtifactsForRun(id, runtime, outputDir, flags);
    print(result);
}
async function exportArtifactsForRun(id, runtime, outputDir, flags) {
    const shouldDownload = Boolean(flags.download) || Boolean(flags.gallery);
    const shouldGallery = Boolean(flags.gallery) || flags.html === true || valueFlag(flags, 'html') === 'gallery';
    const shouldDatatable = Boolean(flags.datatable) || Boolean(flags.table);
    const data = await requestJson(`${runtime.apiBaseUrl}/api/agent/runs/${encodeURIComponent(id)}/result`, {}, runtime);
    const artifacts = Array.isArray(data.artifacts) ? data.artifacts : [];
    await mkdir(outputDir, { recursive: true });
    const manifestArtifacts = [];
    for (let index = 0; index < artifacts.length; index++) {
        const artifact = artifacts[index] || {};
        const remote = typeof artifact.url === 'string'
            ? artifact.url
            : typeof artifact.path === 'string' && /^https?:\/\//i.test(artifact.path)
                ? artifact.path
                : '';
        const name = safeArtifactName(artifact.name || defaultArtifactName(artifact, index));
        const localPath = path.join(outputDir, name);
        if (artifact.data !== undefined) {
            const content = artifact.type === 'text'
                ? String(artifact.data)
                : JSON.stringify(artifact.data, null, 2);
            await writeFile(localPath, content);
            manifestArtifacts.push({ ...artifact, localPath, remote: remote || undefined });
        }
        else if (remote && shouldDownload) {
            const downloaded = await downloadArtifact(remote, localPath).catch((error) => ({
                ok: false,
                error: error instanceof Error ? error.message : String(error),
            }));
            manifestArtifacts.push({
                ...artifact,
                localPath: downloaded.ok ? localPath : null,
                remote,
                downloadError: downloaded.ok ? undefined : downloaded.error,
            });
        }
        else if (remote || artifact.path) {
            manifestArtifacts.push({ ...artifact, localPath: null, remote: remote || artifact.path });
        }
        else {
            await writeFile(localPath, JSON.stringify(artifact, null, 2));
            manifestArtifacts.push({ ...artifact, localPath });
        }
    }
    const galleryPath = shouldGallery
        ? await writeGalleryHtml({ outputDir, runId: id, data, artifacts: manifestArtifacts })
        : undefined;
    const previewPath = shouldGallery
        ? await writePreviewHtml({ outputDir, runId: id, data, artifacts: manifestArtifacts })
        : undefined;
    const datatablePath = shouldDatatable
        ? await writeDatatableJson({ outputDir, runId: id, data, artifacts: manifestArtifacts })
        : undefined;
    const summaryPath = await writeSummaryJson({
        outputDir,
        runId: id,
        data,
        artifacts: manifestArtifacts,
        galleryPath,
        previewPath,
        datatablePath,
    });
    const manifest = {
        runId: id,
        exportedAt: new Date().toISOString(),
        apiBaseUrl: runtime.apiBaseUrl,
        artifactCount: artifacts.length,
        artifacts: manifestArtifacts,
        galleryPath,
        previewPath,
        preview: previewPath ? { type: 'html', path: previewPath } : undefined,
        datatablePath,
        datatable: datatablePath ? { type: 'datatable', path: datatablePath } : undefined,
        summaryPath,
        summary: { type: 'summary', path: summaryPath },
        business: data.business,
        run: data.run,
    };
    const manifestPath = path.join(outputDir, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    return { ok: true, runId: id, outputDir, manifestPath, galleryPath, previewPath, preview: previewPath ? { type: 'html', path: previewPath } : undefined, datatablePath, datatable: datatablePath ? { type: 'datatable', path: datatablePath } : undefined, summaryPath, summary: { type: 'summary', path: summaryPath }, artifactCount: artifacts.length, artifacts: manifestArtifacts };
}
function defaultArtifactName(artifact, index) {
    const type = String(artifact.type || 'artifact');
    if (type === 'image')
        return `image-${index + 1}${extensionFromMime(artifact.mimeType) || '.png'}`;
    if (type === 'video')
        return `video-${index + 1}${extensionFromMime(artifact.mimeType) || '.mp4'}`;
    if (type === 'audio')
        return `audio-${index + 1}${extensionFromMime(artifact.mimeType) || '.mp3'}`;
    if (type === 'text')
        return `text-${index + 1}.txt`;
    return `${type}-${index + 1}.json`;
}
function extensionFromMime(mimeType) {
    const mime = String(mimeType || '').toLowerCase();
    if (mime.includes('png'))
        return '.png';
    if (mime.includes('jpeg') || mime.includes('jpg'))
        return '.jpg';
    if (mime.includes('webp'))
        return '.webp';
    if (mime.includes('gif'))
        return '.gif';
    if (mime.includes('mp4'))
        return '.mp4';
    if (mime.includes('mpeg'))
        return '.mp3';
    if (mime.includes('pdf'))
        return '.pdf';
    return '';
}
async function downloadArtifact(url, localPath) {
    const response = await fetch(url);
    if (!response.ok)
        throw new Error(`Download failed (${response.status})`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, buffer);
    return { ok: true };
}
async function writeGalleryHtml(input) {
    const html = renderPreviewHtml(input, ['image']);
    const galleryPath = path.join(input.outputDir, 'gallery.html');
    await writeFile(galleryPath, html);
    return galleryPath;
}
async function writePreviewHtml(input) {
    const html = renderPreviewHtml(input, ['image', 'video', 'audio', 'text', 'json']);
    const previewPath = path.join(input.outputDir, 'preview.html');
    await writeFile(previewPath, html);
    return previewPath;
}
async function writeSummaryJson(input) {
    const summary = buildRunSummary(input);
    const summaryPath = path.join(input.outputDir, 'summary.json');
    await writeFile(summaryPath, JSON.stringify(summary, null, 2));
    return summaryPath;
}
function buildRunSummary(input) {
    const capabilityId = String(input.data?.run?.capabilityId || input.data?.result?.capabilityId || 'nextide.run');
    const runStatus = String(input.data?.run?.status || input.data?.status || input.data?.result?.status || 'unknown');
    const result = asPlainRecord(input.data?.result?.data || input.data?.result || {});
    const title = String(pickValue(result, ['title', 'topic', 'name']) || humanizeTitle(capabilityId));
    const imageCount = input.artifacts.filter((artifact) => String(artifact.type) === 'image').length;
    const videoCount = input.artifacts.filter((artifact) => String(artifact.type) === 'video').length;
    const audioCount = input.artifacts.filter((artifact) => String(artifact.type) === 'audio').length;
    const localFiles = input.artifacts
        .map((artifact) => artifact.localPath)
        .filter((value) => typeof value === 'string' && value.length > 0);
    const remoteUrls = input.artifacts
        .map((artifact) => artifact.remote || artifact.url)
        .filter((value) => typeof value === 'string' && value.length > 0);
    const blocks = [];
    if (input.previewPath)
        blocks.push('html-preview');
    if (input.datatablePath)
        blocks.push('datatable');
    if (!input.previewPath && imageCount > 0)
        blocks.push('image-preview');
    const message = buildRecommendedMessage({ title, runStatus, imageCount, videoCount, audioCount, hasTable: Boolean(input.datatablePath) });
    return {
        runId: input.runId,
        capabilityId,
        title,
        status: runStatus,
        artifactCount: input.artifacts.length,
        counts: { images: imageCount, videos: videoCount, audios: audioCount, files: localFiles.length, remoteUrls: remoteUrls.length },
        primaryPreview: input.previewPath || input.galleryPath || localFiles[0] || remoteUrls[0],
        primaryTable: input.datatablePath,
        localFiles,
        remoteUrls,
        recommendedResponse: {
            message,
            blocks,
            nextActions: recommendedNextActions(capabilityId),
        },
        commands: {
            status: `nextide run status ${input.runId}`,
            result: `nextide run result ${input.runId}`,
            artifacts: `nextide run artifacts ${input.runId} --download --gallery --datatable`,
        },
    };
}
function buildRecommendedMessage(input) {
    const pieces = [`已完成 NexTide 任务：${input.title}`];
    pieces.push(`状态：${input.runStatus}`);
    if (input.imageCount)
        pieces.push(`图片：${input.imageCount} 张`);
    if (input.videoCount)
        pieces.push(`视频：${input.videoCount} 个`);
    if (input.audioCount)
        pieces.push(`音频：${input.audioCount} 个`);
    if (input.hasTable)
        pieces.push('已生成数据表');
    return pieces.join(' · ');
}
function recommendedNextActions(capabilityId) {
    if (capabilityId === 'xhs.card.layout' || capabilityId === 'xhs.infographic.generate')
        return ['生成小红书标题', '生成发布正文', '调整卡片风格', '导出图片给客户'];
    if (capabilityId === 'product.selling_point.analysis')
        return ['转成销售页文案', '转成短视频脚本', '转成小红书种草文', '生成竞品对比表'];
    if (capabilityId.startsWith('social.') || capabilityId === 'xhs.note.collect')
        return ['筛选高互动素材', '提取选题模式', '生成内容对标清单', '继续扩大采集范围'];
    if (capabilityId.includes('video'))
        return ['查看任务状态', '下载视频文件', '生成发布文案', '生成封面标题'];
    if (capabilityId === 'content.wechat.longform.write')
        return ['提炼标题', '生成摘要', '改写开头', '拆成小红书/短视频内容'];
    return ['查看预览', '查看数据表', '下载文件', '继续优化结果'];
}
async function writeDatatableJson(input) {
    const table = buildDatatable(input);
    if (!table.rows.length)
        return undefined;
    const datatablePath = path.join(input.outputDir, 'datatable.json');
    await writeFile(datatablePath, JSON.stringify(table, null, 2));
    return datatablePath;
}
function buildDatatable(input) {
    const capabilityId = String(input.data?.run?.capabilityId || 'NexTide Results');
    const specialized = buildSpecializedDatatable(capabilityId, input.data, input.artifacts);
    if (specialized.rows.length > 0)
        return specialized;
    const candidates = [
        input.data?.result?.items,
        input.data?.result?.data?.items,
        input.data?.result?.data?.savedReferences,
        input.data?.result?.data?.references,
        input.data?.result?.data?.capabilities,
        input.data?.result?.data,
        input.data?.result,
        ...input.artifacts.map((artifact) => artifact.data),
    ];
    for (const candidate of candidates) {
        const rows = rowsFromUnknown(candidate);
        if (rows.length > 0) {
            return {
                title: humanizeTitle(capabilityId),
                columns: inferColumns(rows),
                rows,
            };
        }
    }
    return { title: humanizeTitle(capabilityId), columns: [], rows: [] };
}
function buildSpecializedDatatable(capabilityId, data, artifacts) {
    if (capabilityId === 'xhs.note.collect')
        return buildXhsNoteCollectTable(data);
    if (capabilityId.startsWith('social.'))
        return buildSocialCollectTable(data, artifacts, capabilityId);
    if (capabilityId === 'product.selling_point.analysis')
        return buildProductAnalysisTable(data);
    if (capabilityId === 'viral.breakdown.video_prompts')
        return buildViralBreakdownPromptTable(data, artifacts);
    if (capabilityId === 'content.wechat.longform.write')
        return buildWechatLongformTable(data, artifacts);
    if (capabilityId === 'xhs.infographic.generate')
        return buildInfographicTable(data, artifacts, capabilityId);
    if (['digital-human.video.generate', 'motion.replication.image_to_video', 'viral.midform.video.generate'].includes(capabilityId))
        return buildVideoTaskTable(data, artifacts, capabilityId);
    return { title: humanizeTitle(capabilityId), columns: [], rows: [] };
}
function buildXhsNoteCollectTable(data) {
    const rawItems = pickFirstArray(data?.result?.items, data?.result?.data?.items, data?.result?.data?.savedReferences, data?.result?.savedReferences, data?.result?.data);
    const rows = rawItems.map((item) => {
        const record = asPlainRecord(item);
        const result = asPlainRecord(record.result || record.data || record.reference || record.item);
        const merged = { ...record, ...result };
        return compactRow({
            title: pickValue(merged, ['title', 'noteTitle', 'sourceTitle']),
            sourceUrl: pickValue(merged, ['sourceUrl', 'source_url', 'url', 'noteUrl']),
            status: pickValue(merged, ['status', 'taskStatus']),
            videoUrl: pickValue(merged, ['videoUrl', 'video_url']),
            likes: pickValue(merged, ['likes', 'likeCount', 'likedCount']),
            collects: pickValue(merged, ['collects', 'collectCount', 'collectedCount', 'favorites']),
            comments: pickValue(merged, ['comments', 'commentCount']),
            creatorName: pickValue(merged, ['creatorName', 'author', 'nickname', 'userName']),
            referenceId: pickValue(merged, ['referenceId', 'id', 'viralReferenceId']),
            taskId: pickValue(merged, ['taskId', 'task_id', 'workTaskId']),
        });
    });
    return {
        title: '小红书笔记采集结果',
        columns: columnsForKeys([
            ['title', '标题', 'text'],
            ['sourceUrl', '来源链接', 'text'],
            ['status', '状态', 'badge'],
            ['videoUrl', '视频链接', 'text'],
            ['likes', '点赞', 'number'],
            ['collects', '收藏', 'number'],
            ['comments', '评论', 'number'],
            ['creatorName', '作者', 'text'],
            ['referenceId', '素材ID', 'text'],
            ['taskId', '任务ID', 'text'],
        ], rows),
        rows,
    };
}
function buildSocialCollectTable(data, artifacts, capabilityId) {
    const artifactRows = artifacts.flatMap((artifact) => rowsFromUnknown(artifact.data));
    const rawItems = pickFirstArray(data?.result?.items, data?.result?.data?.items, data?.result?.data?.results, data?.result?.data, artifactRows);
    const rows = rawItems.map((item) => {
        const record = asPlainRecord(item);
        return compactRow({
            platform: pickValue(record, ['platform', 'sourcePlatform']) || platformFromCapability(capabilityId),
            title: pickValue(record, ['title', 'desc', 'description', 'caption', 'text']),
            url: pickValue(record, ['url', 'sourceUrl', 'videoUrl', 'permalink']),
            author: pickValue(record, ['author', 'authorName', 'creatorName', 'username', 'nickname']),
            likes: pickValue(record, ['likes', 'likeCount', 'diggCount']),
            comments: pickValue(record, ['comments', 'commentCount']),
            shares: pickValue(record, ['shares', 'shareCount']),
            views: pickValue(record, ['views', 'viewCount', 'playCount', 'plays']),
            duration: pickValue(record, ['duration', 'durationSeconds']),
            createdAt: pickValue(record, ['createdAt', 'created_at', 'publishTime', 'timestamp']),
        });
    });
    return {
        title: `${platformFromCapability(capabilityId).toUpperCase()} 采集结果`,
        columns: columnsForKeys([
            ['platform', '平台', 'badge'],
            ['title', '标题/描述', 'text'],
            ['url', '链接', 'text'],
            ['author', '作者', 'text'],
            ['likes', '点赞', 'number'],
            ['comments', '评论', 'number'],
            ['shares', '分享', 'number'],
            ['views', '播放/浏览', 'number'],
            ['duration', '时长', 'number'],
            ['createdAt', '发布时间', 'date'],
        ], rows),
        rows,
    };
}
function buildWechatLongformTable(data, artifacts) {
    const result = asPlainRecord(data?.result?.data || data?.result || {});
    const article = String(pickValue(result, ['article', 'content', 'markdown', 'text', 'body']) ||
        artifacts.map((artifact) => artifact.data).find((value) => typeof value === 'string') ||
        '');
    const structuredSections = pickFirstArray(result.sections, result.outline, result.blocks, result.paragraphs, result.items);
    const rows = structuredSections.length > 0
        ? structuredSections.map((item, index) => {
            const record = asPlainRecord(item);
            const content = String(pickValue(record, ['content', 'text', 'body', 'summary']) || '');
            return compactRow({
                section: pickValue(record, ['section', 'index', 'order']) || index + 1,
                heading: pickValue(record, ['heading', 'title', 'subtitle']),
                summary: pickValue(record, ['summary', 'abstract', 'description']),
                content,
                wordCount: pickValue(record, ['wordCount', 'words']) || countCjkWords(content),
                role: pickValue(record, ['role', 'purpose', 'type']) || inferArticleSectionRole(String(pickValue(record, ['heading', 'title']) || ''), index, structuredSections.length),
                callToAction: pickValue(record, ['callToAction', 'cta']),
            });
        })
        : splitArticleIntoSections(article).map((section, index, list) => compactRow({
            section: index + 1,
            heading: section.heading,
            summary: section.content.slice(0, 80),
            content: section.content,
            wordCount: countCjkWords(section.content),
            role: inferArticleSectionRole(section.heading, index, list.length),
            callToAction: inferCallToAction(section.content),
        }));
    return {
        title: '公众号长文结构表',
        columns: columnsForKeys([
            ['section', '段落', 'number'],
            ['heading', '标题', 'text'],
            ['summary', '摘要', 'text'],
            ['content', '正文', 'text'],
            ['wordCount', '字数', 'number'],
            ['role', '功能', 'badge'],
            ['callToAction', '行动召唤', 'text'],
        ], rows),
        rows,
    };
}
function buildViralBreakdownPromptTable(data, artifacts) {
    const result = asPlainRecord(data?.result?.data || data?.result || {});
    const run = asPlainRecord(data?.run || {});
    const promptItems = pickFirstArray(result.prompts, result.videoPrompts, result.video_prompts, result.scenes, result.storyboard, result.shots, result.items, artifacts.flatMap((artifact) => rowsFromUnknown(artifact.data)));
    const rows = promptItems.length > 0
        ? promptItems.map((item, index) => {
            const record = asPlainRecord(item);
            return compactRow({
                scene: pickValue(record, ['scene', 'sceneNumber', 'index']) || index + 1,
                duration: pickValue(record, ['duration', 'durationSeconds', 'seconds']),
                shotType: pickValue(record, ['shotType', 'shot', 'shot_size', 'shotSize']),
                cameraMovement: pickValue(record, ['cameraMovement', 'camera', 'movement']),
                visualPrompt: pickValue(record, ['visualPrompt', 'prompt', 'imagePrompt', 'videoPrompt', 'description']),
                dialogue: pickValue(record, ['dialogue', 'voiceover', 'voiceOver', 'script', 'caption']),
                audioCue: pickValue(record, ['audioCue', 'audio', 'music', 'sound']),
                negativePrompt: pickValue(record, ['negativePrompt', 'negative']),
                platform: pickValue(record, ['platform', 'sourcePlatform']) || pickValue(result, ['platform', 'sourcePlatform']),
                sourceUrl: pickValue(record, ['sourceUrl', 'referenceUrl', 'url']) || pickValue(result, ['sourceUrl', 'referenceUrl']),
            });
        })
        : [];
    const fallbackRow = compactRow({
        scene: rows.length ? undefined : 1,
        visualPrompt: pickValue(result, ['prompt', 'videoPrompt', 'description', 'transcript', 'copy', 'text']),
        dialogue: pickValue(result, ['dialogue', 'script', 'caption']),
        platform: pickValue(result, ['platform', 'sourcePlatform']),
        sourceUrl: pickValue(result, ['sourceUrl', 'referenceUrl', 'referenceVideo']),
        status: pickValue(result, ['status']) || pickValue(run, ['status']),
        note: pickValue(result, ['note']),
    });
    const finalRows = rows.length > 0 ? rows : (Object.keys(fallbackRow).length > 0 ? [fallbackRow] : []);
    return {
        title: '爆款拆解视频提示词表',
        columns: columnsForKeys([
            ['scene', '场景', 'number'],
            ['duration', '时长', 'number'],
            ['shotType', '镜头类型', 'badge'],
            ['cameraMovement', '运镜', 'text'],
            ['visualPrompt', '视觉提示词', 'text'],
            ['dialogue', '台词/旁白', 'text'],
            ['audioCue', '音频提示', 'text'],
            ['negativePrompt', '负面提示词', 'text'],
            ['platform', '平台', 'badge'],
            ['sourceUrl', '来源链接', 'text'],
            ['status', '状态', 'badge'],
            ['note', '说明', 'text'],
        ], finalRows),
        rows: finalRows,
    };
}
function buildInfographicTable(data, artifacts, capabilityId) {
    const result = asPlainRecord(data?.result?.data || data?.result || {});
    const run = asPlainRecord(data?.run || {});
    const business = asPlainRecord(data?.business || {});
    const imageArtifacts = artifacts.filter((artifact) => String(artifact.type) === 'image');
    const pages = pickFirstArray(result.pages, result.cards, result.storyboard, result.items, result.images);
    const rows = pages.length > 0
        ? pages.map((item, index) => {
            if (typeof item === 'string') {
                return compactRow({
                    page: index + 1,
                    imageUrl: item,
                    title: pickValue(result, ['title', 'topic']),
                    taskId: pickValue(result, ['taskId', 'id']) || pickValue(business, ['businessId']),
                    status: pickValue(result, ['status']) || pickValue(run, ['status']) || pickValue(business, ['businessStatus']),
                });
            }
            const record = asPlainRecord(item);
            return compactRow({
                page: pickValue(record, ['page', 'pageNumber', 'index']) || index + 1,
                title: pickValue(record, ['title', 'headline']),
                subtitle: pickValue(record, ['subtitle', 'subTitle']),
                body: pickValue(record, ['body', 'content', 'text', 'copy']),
                visualPrompt: pickValue(record, ['visualPrompt', 'imagePrompt', 'prompt']),
                imageUrl: pickValue(record, ['imageUrl', 'url', 'src']) || pickValue(imageArtifacts[index] || {}, ['remote', 'url']),
                templateId: pickValue(record, ['templateId', 'styleId']) || pickValue(result, ['templateId', 'styleId', 'stylePresetId']),
                taskId: pickValue(record, ['taskId']) || pickValue(result, ['taskId', 'id']) || pickValue(business, ['businessId']),
                status: pickValue(record, ['status']) || pickValue(result, ['status']) || pickValue(run, ['status']) || pickValue(business, ['businessStatus']),
            });
        })
        : imageArtifacts.map((artifact, index) => {
            const metadata = asPlainRecord(artifact.metadata);
            return compactRow({
                page: pickValue(metadata, ['page']) || index + 1,
                title: pickValue(metadata, ['title']) || pickValue(result, ['title', 'topic']),
                imageUrl: pickValue(artifact, ['remote', 'url']),
                templateId: pickValue(metadata, ['templateId']) || pickValue(result, ['templateId', 'styleId', 'stylePresetId']),
                taskId: pickValue(metadata, ['taskId']) || pickValue(result, ['taskId', 'id']) || pickValue(business, ['businessId']),
                status: pickValue(metadata, ['status']) || pickValue(result, ['status']) || pickValue(run, ['status']) || pickValue(business, ['businessStatus']),
            });
        });
    const fallbackRow = compactRow({
        page: rows.length ? undefined : 1,
        title: pickValue(result, ['title', 'topic']),
        body: pickValue(result, ['text', 'content', 'markdown']),
        templateId: pickValue(result, ['templateId', 'styleId', 'stylePresetId']),
        taskId: pickValue(result, ['taskId', 'id']) || pickValue(business, ['businessId']),
        status: pickValue(result, ['status']) || pickValue(run, ['status']) || pickValue(business, ['businessStatus']),
        note: pickValue(result, ['note']),
    });
    const finalRows = rows.length > 0 ? rows : (Object.keys(fallbackRow).length > 0 ? [fallbackRow] : []);
    return {
        title: '小红书图文分镜/页面表',
        columns: columnsForKeys([
            ['page', '页码', 'number'],
            ['title', '标题', 'text'],
            ['subtitle', '副标题', 'text'],
            ['body', '正文', 'text'],
            ['visualPrompt', '视觉提示词', 'text'],
            ['imageUrl', '图片链接', 'text'],
            ['templateId', '模板/风格', 'text'],
            ['taskId', '任务ID', 'text'],
            ['status', '状态', 'badge'],
            ['note', '说明', 'text'],
        ], finalRows),
        rows: finalRows,
    };
}
function buildVideoTaskTable(data, artifacts, capabilityId) {
    const result = asPlainRecord(data?.result?.data || data?.result || {});
    const run = asPlainRecord(data?.run || {});
    const business = asPlainRecord(data?.business || {});
    const videoArtifacts = artifacts.filter((artifact) => String(artifact.type) === 'video');
    const baseRow = compactRow({
        capabilityId,
        taskId: pickValue(result, ['taskId', 'id']) || pickValue(business, ['businessId']) || firstArtifactMetadataValue(videoArtifacts, ['taskId', 'id']),
        status: pickValue(result, ['status']) || pickValue(run, ['status']) || pickValue(business, ['businessStatus']) || firstArtifactMetadataValue(videoArtifacts, ['status']),
        videoUrl: pickValue(result, ['resultUrl', 'videoUrl', 'url']) || pickValue(videoArtifacts[0] || {}, ['remote', 'url']),
        sourceType: pickValue(result, ['sourceType']) || firstArtifactMetadataValue(videoArtifacts, ['sourceType']),
        mode: pickValue(result, ['mode', 'type']) || firstArtifactMetadataValue(videoArtifacts, ['mode']),
        theme: pickValue(result, ['theme', 'creativeStyleRaw', 'creativeStyleNorm']),
        progress: pickValue(result, ['progress', 'percent', 'progressPercent']),
        createdAt: pickValue(run, ['createdAt']) || pickValue(result, ['createdAt', 'created_at']),
        updatedAt: pickValue(run, ['updatedAt', 'finishedAt']) || pickValue(result, ['updatedAt', 'updated_at', 'finishedAt']),
        note: pickValue(result, ['note']),
    });
    const rows = baseRow.videoUrl || baseRow.taskId || baseRow.status
        ? [baseRow]
        : videoArtifacts.map((artifact, index) => {
            const metadata = asPlainRecord(artifact.metadata);
            return compactRow({
                capabilityId,
                taskId: pickValue(metadata, ['taskId', 'id']),
                status: pickValue(metadata, ['status']),
                videoUrl: pickValue(artifact, ['remote', 'url']),
                sourceType: pickValue(metadata, ['sourceType']),
                mode: pickValue(metadata, ['mode']),
                order: index + 1,
            });
        });
    return {
        title: '视频任务结果',
        columns: columnsForKeys([
            ['capabilityId', '能力', 'badge'],
            ['taskId', '任务ID', 'text'],
            ['status', '状态', 'badge'],
            ['videoUrl', '视频链接', 'text'],
            ['sourceType', '源类型', 'badge'],
            ['mode', '模式', 'badge'],
            ['theme', '主题', 'text'],
            ['progress', '进度', 'number'],
            ['createdAt', '创建时间', 'date'],
            ['updatedAt', '更新时间', 'date'],
            ['note', '说明', 'text'],
            ['order', '序号', 'number'],
        ], rows),
        rows,
    };
}
function buildProductAnalysisTable(data) {
    const result = data?.result?.data || data?.result || {};
    const rows = [];
    const sellingPoints = pickFirstArray(result.sellingPoints, result.selling_points, result.workflowData?.sellingPoints, result.workflowData?.selling_points);
    sellingPoints.forEach((item, index) => {
        rows.push(compactRow({ type: '卖点', content: stringifyPoint(item), source: 'sellingPoints', order: index + 1 }));
    });
    const painPoints = pickFirstArray(result.painPoints, result.pain_points, result.workflowData?.painPoints, result.workflowData?.pain_points);
    painPoints.forEach((item, index) => {
        rows.push(compactRow({ type: '痛点', content: stringifyPoint(item), source: 'painPoints', order: index + 1 }));
    });
    const scenarios = pickFirstArray(result.scenarios, result.usageScenarios, result.workflowData?.scenarios, result.workflowData?.usageScenarios);
    scenarios.forEach((item, index) => {
        rows.push(compactRow({ type: '场景', content: stringifyPoint(item), source: 'scenarios', order: index + 1 }));
    });
    const detailed = pickValue(result, ['detailedDescription', 'detailed_description', 'analysis', 'summary']);
    if (detailed)
        rows.push(compactRow({ type: '总结', content: detailed, source: 'analysis', order: rows.length + 1 }));
    return {
        title: '产品卖点分析',
        columns: columnsForKeys([
            ['type', '类型', 'badge'],
            ['content', '内容', 'text'],
            ['source', '来源', 'text'],
            ['order', '序号', 'number'],
        ], rows),
        rows,
    };
}
function pickFirstArray(...values) {
    for (const value of values) {
        if (Array.isArray(value))
            return value;
    }
    return [];
}
function asPlainRecord(value) {
    return typeof value === 'object' && value !== null ? value : {};
}
function pickValue(record, keys) {
    for (const key of keys) {
        const value = record[key];
        if (value !== undefined && value !== null && value !== '')
            return value;
    }
    return undefined;
}
function compactRow(row) {
    return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}
function columnsForKeys(defs, rows) {
    const present = new Set();
    for (const row of rows)
        for (const key of Object.keys(row))
            present.add(key);
    return defs.filter(([key]) => present.has(key)).map(([key, label, type]) => ({ key, label, type }));
}
function platformFromCapability(capabilityId) {
    if (capabilityId.includes('tiktok'))
        return 'tiktok';
    if (capabilityId.includes('instagram'))
        return 'instagram';
    if (capabilityId.includes('facebook'))
        return 'facebook';
    if (capabilityId.includes('comments'))
        return 'comments';
    return 'social';
}
function splitArticleIntoSections(article) {
    const text = article.trim();
    if (!text)
        return [];
    const lines = text.split(/\r?\n/);
    const sections = [];
    let current;
    for (const line of lines) {
        const trimmed = line.trim();
        const headingMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed) || /^([一二三四五六七八九十]+[、.．]\s*.+)$/.exec(trimmed) || /^(\d+[、.．]\s*.+)$/.exec(trimmed);
        if (headingMatch) {
            current = { heading: headingMatch[2] || headingMatch[1] || trimmed, content: [] };
            sections.push(current);
        }
        else if (trimmed) {
            if (!current) {
                current = { heading: sections.length === 0 ? '开头' : `段落 ${sections.length + 1}`, content: [] };
                sections.push(current);
            }
            current.content.push(trimmed);
        }
    }
    if (sections.length <= 1) {
        const paragraphs = text.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
        if (paragraphs.length > 1) {
            return paragraphs.map((content, index) => ({ heading: index === 0 ? '开头' : `段落 ${index + 1}`, content }));
        }
    }
    return sections.map((section) => ({ heading: section.heading, content: section.content.join('\n') })).filter((section) => section.heading || section.content);
}
function countCjkWords(text) {
    const compact = text.replace(/\s+/g, '');
    const cjk = compact.match(/[\u4e00-\u9fff]/g)?.length || 0;
    const latin = text.match(/[A-Za-z0-9]+/g)?.length || 0;
    return cjk + latin;
}
function inferArticleSectionRole(heading, index, total) {
    const lower = heading.toLowerCase();
    if (index === 0 || /开头|引言|导语|前言|hook/.test(lower))
        return '开头';
    if (index === total - 1 || /结尾|总结|行动|购买|报名|联系|cta/.test(lower))
        return '收束/转化';
    if (/案例|故事|经历|场景/.test(lower))
        return '案例';
    if (/方法|步骤|怎么|策略|清单/.test(lower))
        return '方法';
    if (/为什么|原因|问题|痛点/.test(lower))
        return '论证';
    return '正文';
}
function inferCallToAction(content) {
    const match = content.match(/([^。！？\n]*(关注|私信|评论|购买|报名|预约|扫码|点击|领取|下载)[^。！？\n]*[。！？]?)/);
    return match?.[1]?.trim();
}
function firstArtifactMetadataValue(artifacts, keys) {
    for (const artifact of artifacts) {
        const metadata = asPlainRecord(artifact.metadata);
        const value = pickValue(metadata, keys);
        if (value !== undefined)
            return value;
    }
    return undefined;
}
function stringifyPoint(value) {
    if (typeof value === 'string')
        return value;
    if (typeof value === 'number' || typeof value === 'boolean')
        return String(value);
    if (typeof value === 'object' && value !== null) {
        const record = value;
        const preferred = pickValue(record, ['content', 'text', 'title', 'name', 'point', 'description']);
        if (preferred)
            return String(preferred);
    }
    return JSON.stringify(value);
}
function rowsFromUnknown(value) {
    if (!value)
        return [];
    if (Array.isArray(value))
        return normalizeRows(value);
    if (typeof value === 'object') {
        const record = value;
        for (const key of ['items', 'rows', 'data', 'savedReferences', 'references', 'capabilities', 'results']) {
            const rows = rowsFromUnknown(record[key]);
            if (rows.length > 0)
                return rows;
        }
        const flat = flattenRow(record);
        return Object.keys(flat).length > 1 ? [flat] : [];
    }
    return [];
}
function normalizeRows(items) {
    return items
        .map((item) => typeof item === 'object' && item !== null ? flattenRow(item) : { value: item })
        .filter((row) => Object.keys(row).length > 0)
        .slice(0, 1000);
}
function flattenRow(record) {
    const row = {};
    for (const [key, value] of Object.entries(record)) {
        if (value === undefined || value === null)
            continue;
        if (Array.isArray(value)) {
            row[key] = value.length <= 3 && value.every((item) => typeof item !== 'object') ? value.join(', ') : JSON.stringify(value);
        }
        else if (typeof value === 'object') {
            const nested = value;
            const nestedKeys = Object.keys(nested);
            if (nestedKeys.length <= 6 && nestedKeys.every((nestedKey) => typeof nested[nestedKey] !== 'object')) {
                for (const nestedKey of nestedKeys)
                    row[`${key}.${nestedKey}`] = nested[nestedKey];
            }
            else {
                row[key] = JSON.stringify(value);
            }
        }
        else {
            row[key] = value;
        }
    }
    return row;
}
function inferColumns(rows) {
    const keys = [];
    for (const row of rows.slice(0, 50)) {
        for (const key of Object.keys(row)) {
            if (!keys.includes(key))
                keys.push(key);
        }
    }
    return keys.slice(0, 24).map((key) => ({ key, label: labelFromKey(key), type: inferColumnType(key, rows.map((row) => row[key])) }));
}
function inferColumnType(key, values) {
    const lower = key.toLowerCase();
    const present = values.filter((value) => value !== undefined && value !== null);
    if (present.length === 0)
        return 'text';
    if (present.every((value) => typeof value === 'boolean'))
        return 'boolean';
    if (present.every((value) => typeof value === 'number'))
        return lower.includes('rate') || lower.includes('percent') ? 'percent' : 'number';
    if (lower.includes('status') || lower.includes('type') || lower.includes('category') || lower.includes('platform'))
        return 'badge';
    if (lower.includes('date') || lower.endsWith('at') || lower.includes('time'))
        return 'date';
    return 'text';
}
function labelFromKey(key) {
    return key
        .replace(/[_-]/g, ' ')
        .replace(/\./g, ' · ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}
function humanizeTitle(value) {
    return value
        .replace(/[._-]/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}
function renderPreviewHtml(input, types) {
    const title = String(input.data?.result?.data?.title || input.data?.run?.capabilityId || input.runId);
    const artifacts = input.artifacts.filter((artifact) => types.includes(String(artifact.type)) && (artifact.localPath || artifact.remote || artifact.data !== undefined));
    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0b0b0f; color: #f7f7f8; }
  main { max-width: 1120px; margin: 0 auto; padding: 32px 20px 56px; }
  h1 { font-size: 24px; margin: 0 0 8px; }
  .meta { color: #a1a1aa; margin-bottom: 24px; font-size: 14px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; }
  figure, .card { margin: 0; background: #18181b; border: 1px solid #27272a; border-radius: 16px; overflow: hidden; }
  img, video { display: block; width: 100%; height: auto; background: #000; }
  audio { width: calc(100% - 24px); margin: 12px; }
  figcaption, .caption { padding: 10px 12px; color: #d4d4d8; font-size: 13px; word-break: break-all; }
  pre { margin: 0; padding: 12px; overflow: auto; color: #e4e4e7; font-size: 12px; }
  a { color: #bef264; }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">Run: ${escapeHtml(input.runId)} · Artifacts: ${artifacts.length}</div>
  <section class="grid">
    ${artifacts.map((artifact, index) => renderArtifactCard(artifact, index)).join('\n')}
  </section>
</main>
</body>
</html>`;
}
function renderArtifactCard(artifact, index) {
    const type = String(artifact.type || 'artifact');
    if (type === 'image')
        return renderImageFigure(artifact, index);
    if (type === 'video')
        return renderVideoFigure(artifact, index);
    if (type === 'audio')
        return renderAudioCard(artifact, index);
    return renderDataCard(artifact, index);
}
function artifactSrc(artifact) {
    return typeof artifact.localPath === 'string' && artifact.localPath
        ? path.basename(artifact.localPath)
        : String(artifact.remote || artifact.url || '');
}
function artifactCaption(artifact, fallback) {
    const name = String(artifact.name || fallback);
    const remote = String(artifact.remote || artifact.url || '');
    return `${escapeHtml(name)}${remote ? ` · <a href="${escapeHtml(remote)}" target="_blank">remote</a>` : ''}`;
}
function renderImageFigure(artifact, index) {
    const src = artifactSrc(artifact);
    const name = String(artifact.name || `image-${index + 1}`);
    return `<figure>
  <img src="${escapeHtml(src)}" alt="${escapeHtml(name)}" />
  <figcaption>${artifactCaption(artifact, name)}</figcaption>
</figure>`;
}
function renderVideoFigure(artifact, index) {
    const src = artifactSrc(artifact);
    const name = String(artifact.name || `video-${index + 1}`);
    return `<figure>
  <video src="${escapeHtml(src)}" controls playsinline preload="metadata"></video>
  <figcaption>${artifactCaption(artifact, name)}</figcaption>
</figure>`;
}
function renderAudioCard(artifact, index) {
    const src = artifactSrc(artifact);
    const name = String(artifact.name || `audio-${index + 1}`);
    return `<div class="card">
  <audio src="${escapeHtml(src)}" controls preload="metadata"></audio>
  <div class="caption">${artifactCaption(artifact, name)}</div>
</div>`;
}
function renderDataCard(artifact, index) {
    const name = String(artifact.name || `artifact-${index + 1}`);
    const localPath = typeof artifact.localPath === 'string' ? artifact.localPath : '';
    const content = artifact.data !== undefined ? JSON.stringify(artifact.data, null, 2) : (localPath ? path.basename(localPath) : JSON.stringify(artifact, null, 2));
    return `<div class="card">
  <div class="caption">${artifactCaption(artifact, name)}</div>
  <pre>${escapeHtml(content)}</pre>
</div>`;
}
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function safeArtifactName(value) {
    const raw = String(value || 'artifact.json').trim() || 'artifact.json';
    return raw.replace(/[\\/:*?"<>|]/g, '-').replace(/^\.+$/, 'artifact.json');
}
async function main() {
    const parsed = parse(process.argv.slice(2));
    const [cmd, sub] = parsed.args;
    if (!cmd || cmd === 'help' || parsed.flags.help) {
        console.log(`NexTide CLI\n\nCommands:\n  nextide auth login\n  nextide status\n  nextide doctor\n  nextide capability list [--examples]\n  nextide capability example <id> --output input.json\n  nextide capability run <id> --input input.json --output out.json --mode submit [--wait]\n  nextide run status <run-id>\n  nextide run wait <run-id> --timeout 1800 --interval 5\n  nextide run follow <run-id> --timeout 1800 --interval 5 --output-dir .nextide/output/run_xxx\n  nextide run cancel <run-id> --output cancel.json\n  nextide run result <run-id> --output result.json\n  nextide run artifacts <run-id> --output-dir .nextide/output/run_xxx [--download] [--gallery] [--datatable]`);
        return;
    }
    if (cmd === 'auth' && sub === 'login')
        return authLogin(parsed.flags);
    if (cmd === 'doctor')
        return doctor(parsed.flags);
    if (cmd === 'status') {
        const runtime = await resolveRuntime(parsed.flags);
        print({ ok: true, apiBaseUrl: runtime.apiBaseUrl, hasUserApiKey: Boolean(runtime.userApiKey), hasAuthToken: Boolean(runtime.authToken), configPath: CONFIG_PATH });
        return;
    }
    if (cmd === 'capability' && sub === 'list')
        return capabilityList(parsed.flags);
    if (cmd === 'capability' && sub === 'example')
        return capabilityExample(parsed.args, parsed.flags);
    if (cmd === 'capability' && sub === 'run')
        return capabilityRun(parsed.args, parsed.flags);
    if (cmd === 'run' && sub === 'status')
        return runStatus(parsed.args, parsed.flags);
    if (cmd === 'run' && sub === 'wait')
        return runWait(parsed.args, parsed.flags);
    if (cmd === 'run' && sub === 'follow')
        return runFollow(parsed.args, parsed.flags);
    if (cmd === 'run' && sub === 'cancel')
        return runCancel(parsed.args, parsed.flags);
    if (cmd === 'run' && sub === 'result')
        return runResult(parsed.args, parsed.flags);
    if (cmd === 'run' && sub === 'artifacts')
        return runArtifacts(parsed.args, parsed.flags);
    throw new Error(`Unknown command: ${parsed.args.join(' ')}`);
}
main().catch((error) => {
    const rich = error;
    if (rich.explanation) {
        console.error(`${rich.explanation.title}: ${rich.explanation.message}`);
        console.error('\n你可以：');
        rich.explanation.nextActions.forEach((action, index) => console.error(`${index + 1}. ${action}`));
        if (rich.code)
            console.error(`\n错误码：${rich.code}`);
    }
    else {
        console.error(error instanceof Error ? error.message : error);
    }
    process.exit(1);
});
