import { promises as fs, existsSync } from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import sharp from "sharp";
import { tenants } from "../lib/tenants/config";

const execFileAsync = (cmd: string, args: string[], options: { cwd?: string }) =>
  new Promise<void>((resolve, reject) => {
    execFile(cmd, args, options, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

const BASE_EXTENSION_DIR = path.resolve("workflows/nextide-extension-v0.1.2");
const OUTPUT_DIR = path.resolve("public/extensions");

const ICON_SIZES = [16, 32, 48, 128];

type TenantPackage = {
  slug: string;
  displayName: string;
  iconSource: string;
  productionApiBase: string;
};

const TARGET_TENANT_SLUGS = ["nextide", "jubaopen"] as const;

// Production API base URLs per tenant (hardcoded into the distributed extension)
const TENANT_PRODUCTION_URLS: Record<string, string> = {
  nextide: "https://app.atomx.top",
  jubaopen: "https://atomx.top/jubaopen",
};

function resolveIconSource(rawPath?: string): string {
  if (!rawPath) {
    throw new Error("Tenant is missing logo/browserLogo for extension packaging");
  }

  const normalized = rawPath.replace(/^\/+/, "");
  const candidatePaths = [
    path.resolve(normalized),
    path.resolve("public", normalized),
  ];

  for (const candidate of candidatePaths) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Icon asset not found: ${rawPath}`);
}

const PACKAGES: TenantPackage[] = TARGET_TENANT_SLUGS.map((slug) => {
  const tenant = tenants[slug];
  if (!tenant) {
    throw new Error(`Unknown tenant slug: ${slug}`);
  }

  return {
    slug,
    displayName: tenant.name,
    iconSource: resolveIconSource(tenant.browserLogo || tenant.logo),
    productionApiBase: TENANT_PRODUCTION_URLS[slug] ?? "https://app.atomx.top",
  } satisfies TenantPackage;
});

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function createIcons(workDir: string, iconSource: string) {
  const absoluteSource = path.isAbsolute(iconSource) ? iconSource : path.resolve(iconSource);
  const imagesDir = path.join(workDir, "images");

  await ensureDir(imagesDir);

  await Promise.all(
    ICON_SIZES.map(async (size) => {
      const outputPath = path.join(imagesDir, `icon-${size}.png`);
      await sharp(absoluteSource)
        .resize(size, size, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(outputPath);
    }),
  );

  // Maintain legacy filenames for compatibility
  await fs.copyFile(path.join(imagesDir, "icon-128.png"), path.join(imagesDir, "icon.png"));
  await fs.copyFile(path.join(imagesDir, "icon-48.png"), path.join(imagesDir, "logo.png"));
}

async function updateManifest(workDir: string, displayName: string) {
  const manifestPath = path.join(workDir, "manifest.json");
  const raw = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(raw);
  const baseTitle = `${displayName}助手`;
  const versionSuffix = manifest.version ? ` v${manifest.version}` : "";
  const title = `${baseTitle}${versionSuffix}`;

  manifest.name = title;
  manifest.short_name = baseTitle;
  manifest.icons = {
    "16": "images/icon-16.png",
    "32": "images/icon-32.png",
    "48": "images/icon-48.png",
    "128": "images/icon-128.png",
  };
  manifest.action = {
    ...(manifest.action || {}),
    default_title: title,
    default_icon: "images/icon-48.png",
  };
  manifest.description = `${displayName}助手是专为内容创作者设计的浏览器伴侣，帮助你在浏览小红书时快速采集并同步内容到内容工厂。`;

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

async function patchForProduction(workDir: string, pkg: TenantPackage) {
  const apiBase = pkg.productionApiBase;
  const hostDisplay = apiBase.replace("https://", "");

  // ── Patch content.js ────────────────────────────────────────────────────────
  const contentJsPath = path.join(workDir, "content.js");
  let js = await fs.readFile(contentJsPath, "utf8");

  // 1. Replace DEFAULT_API_BASE + remove DEV_TUNNEL_BASE / tunnel preset
  js = js.replace(
    `const DEFAULT_API_BASE = "https://app.atomx.top";\n  const DEV_TUNNEL_BASE = "https://nextide.cpolar.top/nextide";\n  const API_PRESETS = {\n    prod: { id: "prod", label: "正式环境", description: "app.atomx.top", url: DEFAULT_API_BASE },\n    tunnel: { id: "tunnel", label: "隧道 (cpolar)", description: "nextide.cpolar.top/nextide", url: DEV_TUNNEL_BASE }\n  };`,
    `const DEFAULT_API_BASE = ${JSON.stringify(apiBase)};\n  const API_PRESETS = {\n    prod: { id: "prod", label: "正式环境", description: ${JSON.stringify(hostDisplay)}, url: DEFAULT_API_BASE }\n  };`,
  );

  // 2. Update ApiConfigModal header description
  js = js.replace(
    `children: "填写 API Key 与回调地址后即可同步数据"`,
    `children: "填写 API Key 后即可同步数据"`,
  );

  // 3. Remove the entire "回调地址" section from ApiConfigModal
  const callbackDivStart =
    `      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2 text-left", children: [\n` +
    `        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs font-semibold text-gray-600", htmlFor: "callback-input", children: "回调地址" }),`;
  const callbackDivEnd =
    `        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] text-gray-400", children: "请选择与租户对应的回调域名，或手动填写自定义地址。" })\n` +
    `      ] }),\n`;
  const callbackStart = js.indexOf(callbackDivStart);
  const callbackEnd = callbackStart !== -1 ? js.indexOf(callbackDivEnd, callbackStart) + callbackDivEnd.length : -1;
  if (callbackStart !== -1 && callbackEnd > callbackStart) {
    js = js.slice(0, callbackStart) + js.slice(callbackEnd);
  } else {
    console.warn(`[${pkg.slug}] Could not locate callback URL section in content.js — skipping removal`);
  }

  await fs.writeFile(contentJsPath, js);

  // ── Patch options.html ───────────────────────────────────────────────────────
  const optionsHtmlPath = path.join(workDir, "options.html");
  let html = await fs.readFile(optionsHtmlPath, "utf8");

  // Remove the API Base URL label + input + hint
  html = html.replace(
    /\s*<label for="apiBase">API Base URL<\/label>\s*<input id="apiBase"[^>]*\/>\s*<p class="hint">[^<]*<\/p>/,
    "",
  );

  // Replace the entire <script> block with a production version
  const scriptStart = html.indexOf("<script>");
  const scriptEnd = html.indexOf("</script>") + "</script>".length;
  if (scriptStart !== -1 && scriptEnd > scriptStart) {
    const productionScript = buildOptionsScript(apiBase, pkg.displayName);
    html = html.slice(0, scriptStart) + productionScript + html.slice(scriptEnd);
  }

  await fs.writeFile(optionsHtmlPath, html);
}

function buildOptionsScript(apiBase: string, displayName: string): string {
  return `<script>
      const HARDCODED_API_BASE = ${JSON.stringify(apiBase)};
      const apiKeyInput = document.getElementById("apiKey");
      const saveStatusEl = document.getElementById("saveStatus");
      const testResultEl = document.getElementById("testResult");
      const testBtn = document.getElementById("testBtn");

      document.getElementById("panel-title").textContent = ${JSON.stringify(`${displayName}助手配置`)};
      apiKeyInput.placeholder = ${JSON.stringify(`从 ${displayName} 「设置」页面复制`)};

      // Auto-save hardcoded base URL and load stored API key
      document.addEventListener("DOMContentLoaded", () => {
        chrome.storage.sync.get(["apiKey"], (data) => {
          apiKeyInput.value = data.apiKey || "";
          // Always keep the production URL in storage
          chrome.storage.sync.set({ apiBaseUrl: HARDCODED_API_BASE });
        });
      });

      document.getElementById("options-form").addEventListener("submit", (event) => {
        event.preventDefault();
        chrome.storage.sync.set(
          { apiBaseUrl: HARDCODED_API_BASE, apiKey: apiKeyInput.value.trim() },
          () => {
            saveStatusEl.style.display = "inline";
            setTimeout(() => { saveStatusEl.style.display = "none"; }, 2500);
          }
        );
      });

      testBtn.addEventListener("click", async () => {
        const base = HARDCODED_API_BASE.replace(/\\/$/, "");
        const key = apiKeyInput.value.trim();
        if (!key) { showTestResult(false, "请先填写 API Key"); return; }

        testBtn.disabled = true;
        testBtn.textContent = "测试中…";
        testResultEl.style.display = "none";

        const url = base + "/api/viral-references/import";
        const payload = [{ sourceType: "note", data: { noteId: "__test__", title: "连接测试" } }];

        try {
          const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              type: "PROXY_REQ",
              payload: { url, options: { method: "POST", headers: { "Content-Type": "application/json", "x-user-api-key": key }, body: JSON.stringify(payload) } },
            }, (resp) => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              else resolve(resp);
            });
          });

          if (!response || !response.success) {
            showTestResult(false, "无法连接到服务器，请检查网络");
          } else {
            const { status, data } = response.response;
            if (status === 401) {
              let detail = "API Key 不正确或未在系统中配置";
              try { const json = JSON.parse(data); if (json.error) detail = json.error; } catch {}
              showTestResult(false, "认证失败 (401): " + detail);
            } else if (status < 500) {
              showTestResult(true, "连接成功 ✓ API Key 有效");
            } else {
              showTestResult(false, "服务器错误 (" + status + ")");
            }
          }
        } catch (e) {
          showTestResult(false, "连接失败: " + e.message);
        } finally {
          testBtn.disabled = false;
          testBtn.textContent = "测试连接";
        }
      });

      function showTestResult(ok, msg) {
        testResultEl.className = ok ? "ok" : "fail";
        testResultEl.textContent = msg;
        testResultEl.style.display = "block";
      }
    </script>`;
}

async function buildPackage(pkg: TenantPackage) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `cf-ext-${pkg.slug}-`));
  await fs.cp(BASE_EXTENSION_DIR, tempDir, { recursive: true });

  await createIcons(tempDir, pkg.iconSource);
  await updateManifest(tempDir, pkg.displayName);
  await patchForProduction(tempDir, pkg);

  await ensureDir(OUTPUT_DIR);
  const zipPath = path.join(OUTPUT_DIR, `${pkg.slug}-assistant.zip`);

  await execFileAsync("zip", ["-qr", zipPath, "."], { cwd: tempDir });
  await fs.rm(tempDir, { recursive: true, force: true });

  console.log(`✔ Built ${pkg.displayName} assistant → ${path.relative(process.cwd(), zipPath)}`);
}

async function main() {
  await ensureDir(OUTPUT_DIR);
  for (const pkg of PACKAGES) {
    await buildPackage(pkg);
  }
}

main().catch((error) => {
  console.error("Failed to build extensions:", error);
  process.exit(1);
});
