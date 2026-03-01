/**
 * n8n Catalog Builder v2.0
 * 多包支持：nodes-base + @n8n/nodes-langchain
 * nodeType 输出 MCP 工具格式（nodes-base.xxx / nodes-langchain.xxx）
 *
 * 用法: node catalog-build.mjs <nodesBaseDist> <langchainDist> <outputDir> <version> <commit> <buildTime>
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// ── 参数解析 ──────────────────────────────────────────────────

const [nodesBaseDist, langchainDist, outputDir, version, commit, buildTime] = process.argv.slice(2);

if (!nodesBaseDist || !langchainDist || !outputDir) {
  console.error('用法: node catalog-build.mjs <nodesBaseDist> <langchainDist> <outputDir> <version> <commit> <buildTime>');
  process.exit(1);
}

// ── 包定义 ────────────────────────────────────────────────────
// mcpPrefix: MCP get_node 调用时使用的前缀

const PACKAGES = [
  { name: 'nodes-base', distDir: nodesBaseDist, mcpPrefix: 'nodes-base' },
  { name: 'nodes-langchain', distDir: langchainDist, mcpPrefix: 'nodes-langchain' },
];

// ── 工具函数 ──────────────────────────────────────────────────

function loadJSON(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function collectNodeJsonFiles(dir) {
  const results = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        results.push(...collectNodeJsonFiles(full));
      } else if (entry.endsWith('.node.json')) {
        try { results.push(JSON.parse(readFileSync(full, 'utf-8'))); }
        catch { /* 跳过损坏的 JSON */ }
      }
    }
  } catch { /* 目录不可访问 */ }
  return results;
}

// ── 认证方式推导 ──────────────────────────────────────────────

const CONNECTION_KEYWORDS = [
  'postgres', 'mysql', 'redis', 'mongo', 'sql', 'mariadb', 'crate',
  'questdb', 'oracle', 'cockroach', 'timescale', 'supabase',
];
const PROTOCOL_KEYWORDS = ['ftp', 'sftp', 'ssh', 'smtp', 'imap'];

function inferAuthType(credKey, credData) {
  const lower = credKey.toLowerCase();
  const ext = credData.extends || [];

  if (ext.includes('oAuth2Api') || ext.includes('googleOAuth2Api') || ext.includes('microsoftOAuth2Api'))
    return 'OAuth2';
  if (ext.includes('oAuth1Api')) return 'OAuth1';
  if (lower.includes('oauth2')) return 'OAuth2';
  if (lower.includes('oauth')) return 'OAuth';
  if (ext.includes('httpBasicAuth')) return 'Basic Auth';
  if (CONNECTION_KEYWORDS.some(kw => lower.includes(kw))) return 'Connection';
  if (PROTOCOL_KEYWORDS.some(kw => lower.includes(kw))) return 'Connection';
  if (lower.includes('header')) return 'Header Auth';
  return 'API Key';
}

// ── langchain 节点自动分类 ────────────────────────────────────
// 根据 sourcePath 第三级目录推导分类

const LANGCHAIN_CATEGORY_MAP = {
  agents: 'AI Agents',
  chains: 'AI Chains',
  llms: 'AI Models',
  embeddings: 'AI Embeddings',
  memory: 'AI Memory',
  vector_store: 'AI Vector Stores',
  document_loaders: 'AI Document Loaders',
  text_splitters: 'AI Text Splitters',
  output_parser: 'AI Output Parsers',
  tools: 'AI Tools',
  retrievers: 'AI Retrievers',
  rerankers: 'AI Rerankers',
  mcp: 'AI MCP',
  trigger: 'AI Triggers',
  vendors: 'AI Models',
  code: 'AI Tools',
  Guardrails: 'AI Tools',
  ModelSelector: 'AI Models',
  ToolExecutor: 'AI Tools',
};

function langchainCategory(sourcePath) {
  const dir = sourcePath.split('/')[2] || '';
  return LANGCHAIN_CATEGORY_MAP[dir] || 'AI Other';
}

// ── 数据加载 + 合并 ──────────────────────────────────────────

const allNodes = [];
const allCreds = {};
const nodeJsonMap = new Map();

for (const pkg of PACKAGES) {
  const nodesRegistry = loadJSON(join(pkg.distDir, 'known/nodes.json'));
  const credsRegistry = loadJSON(join(pkg.distDir, 'known/credentials.json'));

  Object.assign(allCreds, credsRegistry);

  const nodeJsons = collectNodeJsonFiles(join(pkg.distDir, 'nodes'));
  for (const nj of nodeJsons) {
    if (nj.node) nodeJsonMap.set(nj.node, nj);
  }

  for (const [nodeKey, nodeData] of Object.entries(nodesRegistry)) {
    const className = nodeData.className;
    const isTrigger = className.endsWith('Trigger');
    const sourcePath = nodeData.sourcePath || '';

    const mcpNodeType = `${pkg.mcpPrefix}.${nodeKey}`;

    const jsonNodeType = pkg.name === 'nodes-base'
      ? `n8n-nodes-base.${nodeKey}`
      : `@n8n/n8n-nodes-langchain.${nodeKey}`;

    const meta = nodeJsonMap.get(jsonNodeType);

    const categories = (meta?.categories || []).map(c => c.trim());
    const docsUrl = meta?.resources?.primaryDocumentation?.[0]?.url || '';

    let displayCategory;
    if (pkg.name === 'nodes-langchain') {
      displayCategory = isTrigger ? 'AI Triggers' : langchainCategory(sourcePath);
    } else if (isTrigger) {
      displayCategory = 'Triggers';
    } else if (categories.includes('Core Nodes')) {
      displayCategory = 'Core Nodes';
    } else {
      displayCategory = categories[0] || 'Other';
    }

    allNodes.push({
      nodeKey,
      className,
      mcpNodeType,
      pkg: pkg.name,
      isTrigger,
      displayName: className.replace(/V\d+$/, ''),
      displayCategory,
      docsUrl,
    });
  }

  console.log(`${pkg.name}: ${Object.keys(nodesRegistry).length} 节点, ${Object.keys(credsRegistry).length} 凭证`);
}

// ── 构建凭证反查表 ───────────────────────────────────────────

const nodeCredMap = new Map();

for (const [credKey, credData] of Object.entries(allCreds)) {
  const authType = inferAuthType(credKey, credData);
  for (const nodeKey of (credData.supportedNodes || [])) {
    if (!nodeCredMap.has(nodeKey)) nodeCredMap.set(nodeKey, []);
    nodeCredMap.get(nodeKey).push({ key: credKey, className: credData.className, authType });
  }
}

for (const node of allNodes) {
  const creds = nodeCredMap.get(node.nodeKey) || [];
  node.credNames = creds.map(c => c.className).join(', ') || '—';
}

// ── 按分类分组 ───────────────────────────────────────────────

const categoryGroups = new Map();

for (const node of allNodes) {
  const cat = node.displayCategory;
  if (!categoryGroups.has(cat)) categoryGroups.set(cat, []);
  categoryGroups.get(cat).push(node);
}

const sortedCategories = [...categoryGroups.keys()].sort((a, b) => {
  const aIsAI = a.startsWith('AI ');
  const bIsAI = b.startsWith('AI ');
  if (a === 'Triggers') return -1;
  if (b === 'Triggers') return 1;
  if (a === 'Core Nodes') return -1;
  if (b === 'Core Nodes') return 1;
  if (aIsAI && !bIsAI) return 1;
  if (!aIsAI && bIsAI) return -1;
  return a.localeCompare(b);
});

for (const [, group] of categoryGroups) {
  group.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// ── 生成 nodes-catalog.md ────────────────────────────────────

let catalog = '';

catalog += `# n8n 节点目录\n\n`;
catalog += `> n8n v${version} (${commit}) | 生成于 ${buildTime}\n`;
catalog += `> 共 ${allNodes.length} 个节点，${sortedCategories.length} 个分类\n`;
catalog += `> 包含 nodes-base + @n8n/nodes-langchain 双包\n\n`;

catalog += `## 分类概览\n\n`;
catalog += `| 分类 | 数量 |\n`;
catalog += `|------|------|\n`;
for (const cat of sortedCategories) {
  catalog += `| ${cat} | ${categoryGroups.get(cat).length} |\n`;
}
catalog += `\n`;

for (const cat of sortedCategories) {
  const group = categoryGroups.get(cat);
  catalog += `## ${cat} (${group.length})\n\n`;
  catalog += `| 节点 | nodeType | 凭证 | 文档 |\n`;
  catalog += `|------|----------|------|------|\n`;

  for (const node of group) {
    const docsLink = node.docsUrl ? `[docs](${node.docsUrl})` : '—';
    catalog += `| ${node.displayName} | \`${node.mcpNodeType}\` | ${node.credNames} | ${docsLink} |\n`;
  }

  catalog += `\n`;
}

writeFileSync(join(outputDir, 'nodes-catalog.md'), catalog, 'utf-8');
console.log(`nodes-catalog.md: ${allNodes.length} 个节点, ${sortedCategories.length} 个分类`);

// ── 生成 credentials-map.md ─────────────────────────────────

let credsMap = '';
const totalCreds = Object.keys(allCreds).length;

credsMap += `# n8n 凭证映射\n\n`;
credsMap += `> n8n v${version} (${commit}) | 生成于 ${buildTime}\n`;
credsMap += `> 共 ${totalCreds} 种凭证\n\n`;

credsMap += `| 凭证类型 | 凭证 Key | 支持的节点 | 认证方式 |\n`;
credsMap += `|---------|---------|-----------|----------|\n`;

const sortedCreds = Object.entries(allCreds).sort((a, b) =>
  a[1].className.localeCompare(b[1].className)
);

for (const [credKey, credData] of sortedCreds) {
  const supportedNodes = (credData.supportedNodes || [])
    .map(nk => {
      const n = allNodes.find(n => n.nodeKey === nk);
      return n ? n.displayName : nk;
    })
    .join(', ');

  const authType = inferAuthType(credKey, credData);

  credsMap += `| ${credData.className} | \`${credKey}\` | ${supportedNodes || '—'} | ${authType} |\n`;
}

writeFileSync(join(outputDir, 'credentials-map.md'), credsMap, 'utf-8');
console.log(`credentials-map.md: ${totalCreds} 种凭证`);
