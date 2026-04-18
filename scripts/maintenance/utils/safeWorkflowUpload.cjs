const https = require("https");

const ALLOWED_WORKFLOW_KEYS = ["name", "nodes", "connections", "settings"];

const SENSITIVE_KEYS = new Set(
  [
    "api_key",
    "apiKey",
    "apikey",
    "x_api_key",
    "x-api-key",
    "app_id",
    "appId",
    "appid",
    "app_token",
    "appToken",
    "apptoken",
    "app_secret",
    "appSecret",
    "appsecret",
    "supabase_api_key",
    "supabaseApiKey",
    "token",
    "access_token",
    "accessToken",
    "refresh_token",
    "refreshToken",
    "admin_token",
    "adminToken",
    "secret",
    "client_secret",
    "clientSecret",
    "authorization",
    "password",
    "webhook_secret",
    "webhookSecret",
  ].map((key) => normalizeKey(key))
);

function normalizeKey(key) {
  return String(key || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEmptyValue(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

function requestJson({ hostname, path, method, apiKey }, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path,
        method,
        headers: {
          "X-N8N-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(
              new Error(`Request failed with status ${res.statusCode}: ${raw}`)
            );
          }
          if (!raw) return resolve({});
          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve(raw);
          }
        });
      }
    );

    req.on("error", reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

function mergeCredentialRefs(incomingNode, currentNode, stats) {
  const currentCreds = isPlainObject(currentNode.credentials)
    ? currentNode.credentials
    : null;
  if (!currentCreds) return;

  if (!isPlainObject(incomingNode.credentials)) {
    incomingNode.credentials = { ...currentCreds };
    stats.credentialsRecovered += 1;
    return;
  }

  for (const [credType, currentRef] of Object.entries(currentCreds)) {
    const incomingRef = incomingNode.credentials[credType];
    if (!isPlainObject(incomingRef)) {
      incomingNode.credentials[credType] = { ...currentRef };
      stats.credentialsRecovered += 1;
      continue;
    }

    for (const [refKey, refValue] of Object.entries(currentRef)) {
      if (isEmptyValue(incomingRef[refKey]) && !isEmptyValue(refValue)) {
        incomingRef[refKey] = refValue;
        stats.credentialsRecovered += 1;
      }
    }
  }
}

function restoreSensitiveFieldValues(incoming, current, stats) {
  if (Array.isArray(incoming) && Array.isArray(current)) {
    const currentByFieldId = new Map();
    for (const item of current) {
      if (isPlainObject(item) && typeof item.fieldId === "string") {
        currentByFieldId.set(item.fieldId, item);
      }
    }

    for (let i = 0; i < incoming.length; i += 1) {
      const incomingItem = incoming[i];
      const currentItem = current[i];

      if (
        isPlainObject(incomingItem) &&
        typeof incomingItem.fieldId === "string" &&
        isEmptyValue(incomingItem.fieldValue)
      ) {
        const matched = currentByFieldId.get(incomingItem.fieldId);
        if (
          matched &&
          !isEmptyValue(matched.fieldValue) &&
          SENSITIVE_KEYS.has(normalizeKey(incomingItem.fieldId))
        ) {
          incomingItem.fieldValue = matched.fieldValue;
          stats.sensitiveValuesRecovered += 1;
        }
      }

      if (currentItem !== undefined) {
        restoreSensitiveFieldValues(incomingItem, currentItem, stats);
      }
    }
    return;
  }

  if (!isPlainObject(incoming) || !isPlainObject(current)) return;

  for (const key of Object.keys(incoming)) {
    if (!(key in current)) continue;

    const incomingValue = incoming[key];
    const currentValue = current[key];

    if (
      SENSITIVE_KEYS.has(normalizeKey(key)) &&
      isEmptyValue(incomingValue) &&
      !isEmptyValue(currentValue)
    ) {
      incoming[key] = currentValue;
      stats.sensitiveValuesRecovered += 1;
      continue;
    }

    restoreSensitiveFieldValues(incomingValue, currentValue, stats);
  }
}

function protectNodeSecrets(incomingNodes, currentNodes) {
  const stats = {
    credentialsRecovered: 0,
    sensitiveValuesRecovered: 0,
    nodesTouched: 0,
  };

  const currentById = new Map();
  const currentByName = new Map();

  for (const node of currentNodes || []) {
    if (!isPlainObject(node)) continue;
    if (node.id) currentById.set(node.id, node);
    if (node.name) currentByName.set(node.name, node);
  }

  for (const node of incomingNodes || []) {
    if (!isPlainObject(node)) continue;
    const currentNode = (node.id && currentById.get(node.id)) || currentByName.get(node.name);
    if (!currentNode) continue;

    const beforeCred = stats.credentialsRecovered;
    const beforeSensitive = stats.sensitiveValuesRecovered;

    mergeCredentialRefs(node, currentNode, stats);
    restoreSensitiveFieldValues(node.parameters, currentNode.parameters, stats);

    if (
      stats.credentialsRecovered !== beforeCred ||
      stats.sensitiveValuesRecovered !== beforeSensitive
    ) {
      stats.nodesTouched += 1;
    }
  }

  return stats;
}

function buildUpdatePayload(workflow) {
  const payload = {};
  for (const key of ALLOWED_WORKFLOW_KEYS) {
    if (workflow[key] !== undefined) payload[key] = workflow[key];
  }
  return payload;
}

async function safeUploadWorkflow({
  workflowId,
  workflowFromFile,
  apiKey,
  host,
  log = console,
}) {
  if (!workflowId) throw new Error("workflowId is required");
  if (!apiKey) throw new Error("N8N_API_KEY is required");
  if (!host) throw new Error("host is required");
  if (!workflowFromFile || !Array.isArray(workflowFromFile.nodes)) {
    throw new Error("workflowFromFile is invalid or missing nodes");
  }

  const path = `/api/v1/workflows/${workflowId}`;
  const current = await requestJson(
    { hostname: host, path, method: "GET", apiKey },
    undefined
  );

  const merged = {
    ...workflowFromFile,
    nodes: Array.isArray(workflowFromFile.nodes)
      ? workflowFromFile.nodes.map((node) => (isPlainObject(node) ? { ...node } : node))
      : [],
  };

  const stats = protectNodeSecrets(merged.nodes, current.nodes);
  const payload = buildUpdatePayload(merged);

  await requestJson({ hostname: host, path, method: "PUT", apiKey }, payload);

  log.log(
    `[safe-upload] Updated workflow ${workflowId}. nodesTouched=${stats.nodesTouched}, credentialsRecovered=${stats.credentialsRecovered}, sensitiveValuesRecovered=${stats.sensitiveValuesRecovered}`
  );

  return stats;
}

module.exports = {
  safeUploadWorkflow,
};
