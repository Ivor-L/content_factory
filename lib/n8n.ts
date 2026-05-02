export interface ProductData {
  name: string;
  description?: string;
  images: string[];
  productId?: string;
  apiKey?: string;
  workflowId?: string;
  workflowName?: string;
}

export interface AnalysisResult {
  sellingPoints: string[];
  detailedDescription: string;
  workflowData?: any; // Store the full structured data for workflow
}

export async function analyzeProduct(productData: ProductData): Promise<AnalysisResult> {
  const webhookUrl = process.env.N8N_PRODUCT_ANALYSIS_WEBHOOK;

  if (!webhookUrl) {
    console.warn("N8N_PRODUCT_ANALYSIS_WEBHOOK not set, returning mock data");
    // Simulate delay
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    return {
      sellingPoints: [
        "High quality material (Mock)",
        "Durable and long-lasting (Mock)",
      ],
      detailedDescription: `[Mock] Analysis result for ${productData.name}.`,
    };
  }

  try {
    const payload: any = { ...productData };
    if (productData.productId) payload.product_id = productData.productId;
    if (productData.apiKey) payload.api_key = productData.apiKey;
    if (productData.workflowId) payload.workflow_id = productData.workflowId;
    if (productData.workflowName) payload.workflow_name = productData.workflowName;
    
    // Map image url to image_url expected by n8n
    if (productData.images && productData.images.length > 0) {
        payload.image_url = productData.images[0];
    }
    // Remove internal fields
    delete payload.productId;
    delete payload.apiKey;
    delete payload.workflowId;
    delete payload.workflowName;
    delete payload.images; // n8n expects image_url

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`N8N webhook failed with status ${response.status}`);
    }

    // Async trigger mode: We don't wait for the full result
    // If n8n workflow is set to "Respond to Webhook Node" immediately, it will return here.
    // If it waits for the end, this will block.
    // We assume the workflow has been updated to respond immediately or we just return "Started" here
    // But to support both legacy (wait for result) and new (async) flows, we check the response.
    
    let data;
    try {
        data = await response.json();
    } catch (e) {
        // Response might be empty or text
        console.log('N8N response is not JSON or empty');
        data = {};
    }

    // Unwrap common n8n response patterns:
    // n8n often returns [{...}] (array) or {data: [...]} wrappers
    let item: any = data;
    if (Array.isArray(item) && item.length > 0) {
      item = item[0];
    }
    // Some n8n nodes wrap output in { data: [...] } or { output: {...} }
    if (item && typeof item === 'object' && !item.marketing_profile) {
      const inner = item.data ?? item.output ?? item.result;
      if (inner) {
        const unwrapped = Array.isArray(inner) ? inner[0] : inner;
        if (unwrapped && typeof unwrapped === 'object' && unwrapped.marketing_profile) {
          item = unwrapped;
        }
      }
    }

    // Detect async "workflow started" response — do not treat as real analysis data
    if (item && item.status === 'started') {
      console.log('[analyzeProduct] n8n returned async "started" response, skipping storage');
      return { sellingPoints: [], detailedDescription: '', workflowData: null };
    }

    // Check if the response matches the workflow data structure
    let sellingPoints: string[] = [];
    let detailedDescription = "";

    if (item.marketing_profile && item.marketing_profile.core_selling_points) {
       sellingPoints = item.marketing_profile.core_selling_points.map((p: any) => p.description);
    } else if (item.sellingPoints) {
       sellingPoints = item.sellingPoints;
    }

    if (item.visual_description) {
      detailedDescription = item.visual_description;
    } else if (item.detailedDescription) {
      detailedDescription = item.detailedDescription;
    } else if (item.selling_points_text) {
      // n8n workflow outputs a plain text field with the full analysis
      detailedDescription = item.selling_points_text;
    }

    console.log('[analyzeProduct] n8n response item keys:', item ? Object.keys(item) : 'null', '| detailedDescription length:', detailedDescription.length);

    return {
      sellingPoints,
      detailedDescription,
      workflowData: item  // Store unwrapped item, not raw data
    };
  } catch (error) {
    console.error("Error calling N8N webhook:", error);
    throw error; // Let the caller handle the error
  }
}

export interface ScriptData {
  title: string;
  videoUrl: string;
  description?: string;
  productName?: string;
  productDescription?: string;
  productSellingPoints?: string;
  scriptContent?: string;
  callbackUrl?: string;
  adminToken?: string;
  workflowId?: string;
  targetLanguage?: string;
  targetCountry?: string;
  supabaseUrl?: string;
  supabaseApiKey?: string;
  supabaseBucket?: string;
}

export interface BreakdownResult {
  success: boolean;
  message: string;
}

export async function breakdownScript(scriptData: ScriptData & { scriptId: string; apiKey?: string; scriptPurpose?: 'one-click' | 'storyboard' | 'extract-copy' }): Promise<BreakdownResult> {
  const { scriptPurpose = 'one-click' } = scriptData;

  const scriptBreakdownWebhook =
    process.env.N8N_SCRIPT_BREAKDOWN_WEBHOOK ||
    'https://hooks.atomx.top/webhook/script_extract_web';

  let webhookUrl: string = scriptBreakdownWebhook;
  let defaultWorkflowId = 'flow_script_dna';

  if (scriptPurpose === 'storyboard') {
    webhookUrl =
      process.env.N8N_STORYBOARD_BREAKDOWN_WEBHOOK ||
      'https://hooks.atomx.top/webhook/storyboard_disassembly_web';
    defaultWorkflowId = 'flow_storyboard_disassembly';
  } else if (scriptPurpose === 'extract-copy') {
    webhookUrl = process.env.N8N_EXTRACT_COPY_WEBHOOK || 'https://hooks.atomx.top/webhook/extract_copy';
    defaultWorkflowId = 'flow_extract_copy';
  }

  if (!webhookUrl) {
    console.warn("N8N webhook not set, returning mock success");
    return { success: true, message: "Mock trigger successful" };
  }

  try {
    const normalizeText = (value: string | null | undefined): string => String(value ?? '').trim();
    const normalizeUrl = (value: string | null | undefined): string => normalizeText(value).replace(/\/$/, '');

    const appUrl = normalizeUrl(
      process.env.N8N_CALLBACK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    );
    const callbackPath = scriptPurpose === 'storyboard'
      ? '/api/webhook/storyboard-breakdown'
      : '/api/webhook/replication/script';
    const callbackUrl = normalizeUrl(scriptData.callbackUrl || (appUrl ? `${appUrl}${callbackPath}` : ''));
    const workflowId = normalizeText(scriptData.workflowId || defaultWorkflowId) || defaultWorkflowId;
    const targetLanguage =
      normalizeText(scriptData.targetLanguage || process.env.N8N_DEFAULT_TARGET_LANGUAGE || 'en') || 'en';
    const targetCountry =
      normalizeText(scriptData.targetCountry || process.env.N8N_DEFAULT_TARGET_COUNTRY || 'US') || 'US';
    const supabaseUrl = normalizeUrl(
      scriptData.supabaseUrl ||
      process.env.N8N_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      'https://supabase-api.atomx.top'
    );
    const supabaseApiKey =
      normalizeText(
        scriptData.supabaseApiKey ||
        process.env.N8N_SUPABASE_API_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        ''
      );
    const supabaseBucket =
      normalizeText(
        scriptData.supabaseBucket ||
        process.env.N8N_SUPABASE_BUCKET ||
        process.env.NEXT_PUBLIC_SUPABASE_BUCKET ||
        'uploads'
      ) || 'uploads';
    const productName = String(scriptData.productName || scriptData.title || '');
    const productDescription = String(scriptData.productDescription ?? scriptData.description ?? '');
    const productSellingPoints = String(scriptData.productSellingPoints ?? '');
    const scriptContent = String(scriptData.scriptContent ?? '');
    const adminToken = normalizeText(scriptData.adminToken || process.env.ADMIN_TOKEN || '');

    const payload: Record<string, unknown> = {
      task_id: scriptData.scriptId,
      taskId: scriptData.scriptId,
      record_id: scriptData.scriptId,
      script_id: scriptData.scriptId,
      video_url: scriptData.videoUrl,
      videoUrl: scriptData.videoUrl,
      product_name: productName,
      productName,
      product_description: productDescription,
      productDescription,
      product_selling_points: productSellingPoints,
      productSellingPoints,
      script_content: scriptContent,
      scriptContent,
      callback_url: callbackUrl,
      callbackUrl,
      api_key: scriptData.apiKey,
      apiKey: scriptData.apiKey,
      admin_token: adminToken,
      adminToken,
      workflow_id: workflowId,
      workflowId,
      app_url: appUrl,
      target_language: targetLanguage,
      targetLanguage,
      target_country: targetCountry,
      targetCountry,
      supabase_url: supabaseUrl,
      supabaseUrl,
      supabase_api_key: supabaseApiKey,
      supabaseApiKey,
      supabase_bucket: supabaseBucket,
      supabaseBucket,
    };

    const safePayloadLog = {
      ...payload,
      api_key: payload.api_key ? '[REDACTED]' : undefined,
      apiKey: payload.apiKey ? '[REDACTED]' : undefined,
      admin_token: payload.admin_token ? '[REDACTED]' : undefined,
      adminToken: payload.adminToken ? '[REDACTED]' : undefined,
      supabase_api_key: payload.supabase_api_key ? '[REDACTED]' : undefined,
      supabaseApiKey: payload.supabaseApiKey ? '[REDACTED]' : undefined,
    };
    console.log("Triggering n8n breakdown workflow:", safePayloadLog);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`N8N webhook failed with status ${response.status}`);
    }

    return { success: true, message: "Workflow triggered" };
  } catch (error) {
    console.error("Error calling N8N webhook for script breakdown:", error);
    throw error;
  }
}

export interface ReplicationOptions {
  targetCountry: string;
  targetLanguage: string;
  duration: string;
  quantity: string;
  apiKey?: string;
  callbackUrl?: string;
  userId?: string;
  replicationId?: string;
  productImageUrl?: string | null;
  referenceId?: string | null;
  creatorId?: string | null;
  referenceSnapshot?: Record<string, unknown> | null;
  creatorSnapshot?: Record<string, unknown> | null;
  soraProvider?: 'kie' | 'yunwu';
  productInfo?: unknown;
  blueprint?: unknown;
  productName?: string | null;
  cityStyle?: string | null;
  workflowIdForCredits?: string | null;
  aspectRatio?: string | null;
  model?: string | null;
  nFrames?: string | number | null;
  imageToken?: string | null;
  promptOverrides?: Record<string, unknown> | null;
  recipeId?: string | null;
  recipeVersion?: string | null;
}

export interface ReplicationResult {
  generatedScript: string;
  videoPrompt: string;
}

export async function generateReplication(
  product: any,
  script: any,
  options: ReplicationOptions
): Promise<{ success: boolean; message: string }> {
  const soraProvider = options.soraProvider ?? 'kie';
  const webhookUrl = process.env.N8N_REPLICATION_WEBHOOK;
  const normalizedWorkflowIdForCredits =
    typeof options.workflowIdForCredits === 'string' && options.workflowIdForCredits.trim()
      ? options.workflowIdForCredits.trim()
      : 'flow_farm_copy';
  const toPayloadString = (value: unknown): string => {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  if (!webhookUrl) {
    console.warn("N8N_REPLICATION_WEBHOOK not set, simulating async process");
    return { success: true, message: "Mock trigger successful" };
  }

  try {
    const payload: Record<string, unknown> = {
      product_id: product.id,
      script_id: script.id,
      ...options,
      target_country: options.targetCountry,
      target_language: options.targetLanguage,
      api_key: options.apiKey,
      callback_url: options.callbackUrl,
      replication_id: options.replicationId,
      workflow_id: normalizedWorkflowIdForCredits,
      sora_provider: soraProvider,
      sora_workflow_id: soraProvider === 'yunwu' ? 'jUuV6hsG464jDTHq' : 'vvc2rzlS2PF4F2Tn',
      sora_callback_workflow_id: soraProvider === 'yunwu' ? 'dctPumNGHBoSokUx' : 'zPJavUam1LbqiAeg',
    };

    if (options.productInfo) {
      const serializedProductInfo = toPayloadString(options.productInfo);
      payload['产品信息'] = serializedProductInfo;
      payload.product_info = serializedProductInfo;
    }

    if (options.blueprint) {
      const serializedBlueprint = toPayloadString(options.blueprint);
      payload['爆款视频拆解报告'] = serializedBlueprint;
      payload.blueprint = serializedBlueprint;
      payload.source_blueprint = serializedBlueprint;
    }

    payload.country_region = options.targetCountry;
    if (options.cityStyle) {
      payload.city_style = options.cityStyle;
    } else if (!payload.city_style) {
      payload.city_style = '';
    }

    payload.product_name = options.productName ?? payload.product_name ?? product.name ?? '';
    payload.workflow_id_for_credits =
      options.workflowIdForCredits ?? payload.workflow_id_for_credits ?? normalizedWorkflowIdForCredits;
    payload.n_frames = options.nFrames ?? payload.n_frames ?? options.duration;
    payload.aspect_ratio = options.aspectRatio ?? payload.aspect_ratio ?? 'portrait';
    payload.model = options.model ?? payload.model ?? 'veo_3_1-fast';
    payload.image_1_token = options.imageToken ?? payload.image_1_token ?? '';

    if (options.promptOverrides) {
      payload.prompt_overrides = options.promptOverrides;
    }
    if (options.recipeId) {
      payload.recipe_id = options.recipeId;
    }
    if (options.recipeVersion) {
      payload.recipe_version = options.recipeVersion;
    }

    if (options.productImageUrl) {
      payload.image_url = options.productImageUrl;
      payload.product_image_url = options.productImageUrl;
    }

    if (options.referenceSnapshot) {
      payload.reference = options.referenceSnapshot;
      payload.reference_id = options.referenceId ?? (options.referenceSnapshot as any)?.id;
    } else if (options.referenceId) {
      payload.reference_id = options.referenceId;
    }

    if (options.creatorSnapshot) {
      payload.creator = options.creatorSnapshot;
      payload.creator_id = options.creatorId ?? (options.creatorSnapshot as any)?.id;
    } else if (options.creatorId) {
      payload.creator_id = options.creatorId;
    }

    delete (payload as any).targetCountry;
    delete (payload as any).targetLanguage;
    delete (payload as any).apiKey;
    delete (payload as any).callbackUrl;
    delete (payload as any).replicationId;
    delete (payload as any).productImageUrl;
    delete (payload as any).referenceSnapshot;
    delete (payload as any).creatorSnapshot;
    delete (payload as any).soraProvider;
    delete (payload as any).productInfo;
    delete (payload as any).blueprint;
    delete (payload as any).productName;
    delete (payload as any).cityStyle;
    delete (payload as any).workflowIdForCredits;
    delete (payload as any).aspectRatio;
    delete (payload as any).model;
    delete (payload as any).nFrames;
    delete (payload as any).imageToken;
    delete (payload as any).promptOverrides;
    delete (payload as any).recipeId;
    delete (payload as any).recipeVersion;

    console.log("Triggering n8n replication workflow:", payload);

    // Fire and forget - or wait for acknowledgment
    // We wait for the initial response to ensure n8n received the request.
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`N8N webhook failed with status ${response.status}`);
    }

    // We don't wait for the full result as it is async.
    // n8n might return a "Workflow started" message or similar.
    // We just ignore the body or log it.
    try {
        const text = await response.text();
        console.log("n8n response:", text);
    } catch (e) {
        // Ignore JSON parse errors if response is empty
    }

    return { success: true, message: "Workflow triggered" };
  } catch (error) {
    console.error("Error calling N8N webhook for replication:", error);
    throw error;
  }
}

export async function generateFromSellingPoints(sellingPoints: string): Promise<ReplicationResult> {
  const webhookUrl = process.env.N8N_GENERATION_SELLING_POINTS_WEBHOOK;

  if (!webhookUrl) {
    console.warn("N8N_GENERATION_SELLING_POINTS_WEBHOOK not set, returning mock data");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return {
      generatedScript: `Title: Generated from Selling Points\n\nBased on your selling points:\n${sellingPoints}\n\n1. Hook: Discover the power of these features!\n2. Body: Here is why you need this product...\n3. Call to Action: Get it today!`,
      videoPrompt: `A commercial highlighting these key features: ${sellingPoints.substring(0, 50)}...`,
    };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sellingPoints, workflow_id: "flow_farm_md" }),
    });

    if (!response.ok) {
      throw new Error(`N8N webhook failed with status ${response.status}`);
    }

    const data = await response.json();
    return {
      generatedScript: data.generatedScript || "Generated script not found",
      videoPrompt: data.videoPrompt || "Video prompt not found",
    };
  } catch (error) {
    console.error("Error calling N8N webhook for selling points generation:", error);
    return {
      generatedScript: "Error: Could not generate script.",
      videoPrompt: "Error: Could not generate video prompt.",
    };
  }
}

export async function generateFromScript(scriptContent: string): Promise<ReplicationResult> {
  const webhookUrl = process.env.N8N_GENERATION_SCRIPT_WEBHOOK;

  if (!webhookUrl) {
    console.warn("N8N_GENERATION_SCRIPT_WEBHOOK not set, returning mock data");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return {
      generatedScript: `Title: Refined Script\n\nOriginal:\n${scriptContent}\n\nRefined Version:\n1. Hook: Enhanced hook based on your script.\n2. Body: Polished body content.\n3. Call to Action: Stronger CTA.`,
      videoPrompt: `A video scene matching the script context: ${scriptContent.substring(0, 50)}...`,
    };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scriptContent, workflow_id: "flow_farm_zy" }),
    });

    if (!response.ok) {
      throw new Error(`N8N webhook failed with status ${response.status}`);
    }

    const data = await response.json();
    return {
      generatedScript: data.generatedScript || "Generated script not found",
      videoPrompt: data.videoPrompt || "Video prompt not found",
    };
  } catch (error) {
    console.error("Error calling N8N webhook for script generation:", error);
    return {
      generatedScript: "Error: Could not generate script.",
      videoPrompt: "Error: Could not generate video prompt.",
    };
  }
}

export interface CopyRemixTriggerOptions {
  replicationId: string;
  scriptId?: string | null;
  videoUrl: string;
  apiKey?: string;
  callbackUrl: string;
  workflowId?: string;
  styleId?: string | null;
  styleSnapshot?: Record<string, unknown> | null;
  styleProfile?: Record<string, unknown> | null;
  userId?: string | null;
  originalCopy?: string | null;
  ideaText?: string | null;
  wordCount?: number;
  language?: string | null;
  sourceTitle?: string | null;
  sourceText?: string | null;
}

export async function triggerCopyRemix(
  options: CopyRemixTriggerOptions,
): Promise<{ success: boolean; message: string }> {
  const webhookUrl =
    process.env.N8N_COPY_REMIX_WEBHOOK ||
    "https://hooks.atomx.top/webhook/2chuang_web_v2";

  if (!webhookUrl) {
    throw new Error("N8N copy remix webhook is not configured");
  }

  const payload: Record<string, unknown> = {
    replication_id: options.replicationId,
    video_url: options.videoUrl,
    callback_url: options.callbackUrl,
    source: "copy_remix",
  };

  if (options.scriptId) payload.script_id = options.scriptId;
  if (options.apiKey) payload.api_key = options.apiKey;
  if (options.workflowId) payload.workflow_id = options.workflowId;
  if (options.styleId) payload.style_id = options.styleId;
  if (options.styleSnapshot) payload.style_snapshot = options.styleSnapshot;
  if (options.styleProfile) {
    payload.style_profile = options.styleProfile;
    payload.style_profile_json = options.styleProfile;
  }
  if (options.userId) payload.user_id = options.userId;
  if (options.originalCopy) payload.original_copy = options.originalCopy;
  if (options.ideaText) payload.idea_text = options.ideaText;
  if (typeof options.wordCount === "number" && Number.isFinite(options.wordCount)) {
    payload.word_count = options.wordCount;
    payload.target_word_count = options.wordCount;
  }
  if (options.language) {
    payload.language = options.language;
    payload.target_language = options.language;
    payload.targetLanguage = options.language;
  }
  if (options.sourceTitle) {
    payload.source_title = options.sourceTitle;
    payload.sourceTitle = options.sourceTitle;
  }
  if (options.sourceText) {
    payload.source_text = options.sourceText;
    payload.sourceText = options.sourceText;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Copy remix webhook failed: ${response.status} ${text}`);
  }

  return { success: true, message: "Copy remix workflow triggered" };
}

export interface DHScriptTriggerOptions {
  scriptId: string;
  replicationId: string;
  characterId: string;
  userId: string;
  apiKey?: string;
  callbackUrl: string;
  appUrl: string;
}

/**
 * 触发数字人文案生成工作流（Stage 1）
 * n8n 工作流：爆款复刻-数字人-文案生成（VLmEBDKfCe3dyNWj）
 * webhook 路径：replication_dh_script
 */
export async function triggerDHScriptGeneration(
  options: DHScriptTriggerOptions,
): Promise<{ success: boolean; message: string }> {
  const webhookUrl =
    process.env.N8N_DH_SCRIPT_WEBHOOK ||
    "https://hooks.atomx.top/webhook/replication_dh_script";

  const payload = {
    script_id: options.scriptId,
    replication_id: options.replicationId,
    character_id: options.characterId,
    user_id: options.userId,
    api_key: options.apiKey,
    callback_url: options.callbackUrl,
    app_url: options.appUrl,
    admin_token: process.env.ADMIN_TOKEN,
    workflow_id: "VLmEBDKfCe3dyNWj",
  };

  console.log("[triggerDHScriptGeneration] triggering:", {
    replicationId: options.replicationId,
    scriptId: options.scriptId,
    characterId: options.characterId,
  });

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`DH Script webhook failed: ${response.status} ${text}`);
  }

  return { success: true, message: "DH Script workflow triggered" };
}

// ─────────────────────────────────────────────────────────────────────────────
// 智能创作：文案生成
// ─────────────────────────────────────────────────────────────────────────────

export interface CreativeScriptTriggerOptions {
  replicationId: string;
  userId: string;
  ideaText: string;
  wordCount?: number;
  styleRules?: Record<string, any> | null;
  styleId?: string | null;
  language?: string | null;
  apiKey?: string;
  callbackUrl: string;
  appUrl: string;
}

const CREATIVE_WEBHOOK_FALLBACK = "https://hooks.atomx.top/webhook/chuangzuo_web";

function normalizeCreativeWebhookCandidate(raw: string | null | undefined): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  return trimmed
    .replace(/\/webhook\/creative_script_gen\/?$/i, "/webhook/chuangzuo_web")
    .replace(/\/webhook\/xhs_text2img_web\/?$/i, "/webhook/chuangzuo_web")
    .replace(/\/webhook\/xhs_chuangzuo\/?$/i, "/webhook/chuangzuo_web")
    .replace(/\/webhook\/xhs_chuangzuo_web\/?$/i, "/webhook/chuangzuo_web");
}

function resolveCreativeWebhookUrl(): string {
  const candidates = [
    process.env.N8N_CHUANGZUO_WEBHOOK,
    process.env.N8N_CREATIVE_SCRIPT_WEBHOOK,
    process.env.N8N_XHS_CHUANGZUO_WEBHOOK,
    process.env.N8N_XHS_TEXT2IMG_WEBHOOK,
    CREATIVE_WEBHOOK_FALLBACK,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeCreativeWebhookCandidate(candidate);
    if (normalized) return normalized;
  }
  return CREATIVE_WEBHOOK_FALLBACK;
}

/**
 * 触发智能创作文案生成工作流
 * n8n 工作流：0gGQzB4rz5tNYcYF
 * n8n 内部根据 user_id 自动查询历史文案（HistoryDoc）+ 案例故事（StoryAsset）作为上下文
 * 结果通过 callback_url 回调 /api/webhook/replication/script
 */
export async function triggerCreativeScriptGeneration(
  options: CreativeScriptTriggerOptions,
): Promise<{ success: boolean; message: string }> {
  const webhookUrl = resolveCreativeWebhookUrl();
  const billingWorkflowId =
    process.env.N8N_CREATIVE_SCRIPT_WORKFLOW_ID?.trim() || "flow_writing";

  const payload = {
    task_id: options.replicationId,
    replication_id: options.replicationId,
    user_id: options.userId,
    idea_text: options.ideaText,
    word_count: options.wordCount,
    style_rules: options.styleRules ?? null,
    style_id: options.styleId ?? null,
    language: options.language ?? null,
    api_key: options.apiKey,
    callback_url: options.callbackUrl,
    app_url: options.appUrl,
    admin_token: process.env.ADMIN_TOKEN,
    workflow_id: billingWorkflowId,
  };

  console.log("[triggerCreativeScriptGeneration] triggering:", {
    replicationId: options.replicationId,
    userId: options.userId,
    ideaText: options.ideaText?.slice(0, 50),
    webhookUrl,
  });

  let response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok && webhookUrl !== CREATIVE_WEBHOOK_FALLBACK) {
    const failText = await response.text().catch(() => response.statusText);
    console.warn(
      `[triggerCreativeScriptGeneration] primary webhook failed (${response.status}), retrying fallback`,
      { primary: webhookUrl, fallback: CREATIVE_WEBHOOK_FALLBACK }
    );
    response = await fetch(CREATIVE_WEBHOOK_FALLBACK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const fallbackText = await response.text().catch(() => response.statusText);
      throw new Error(
        `Creative Script webhook failed: primary ${webhookUrl} -> ${failText}; fallback ${response.status} ${fallbackText}`
      );
    }
  }

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Creative Script webhook failed: ${response.status} ${text}`);
  }

  return { success: true, message: "Creative Script workflow triggered" };
}

export interface SceneImageAsset {
  url?: string | null;
  base64?: string | null;
  mimeType?: string | null;
}

export interface ReplicationSceneTriggerInput {
  taskId: string;
  script: {
    id: string;
    title: string;
    breakdown?: string | null;
    blueprint?: string | null;
  };
  product?: {
    id?: string;
    name?: string | null;
    description?: string | null;
    analysisResult?: string | null;
  };
  character: {
    id: string;
    name?: string | null;
  };
  prompt: string;
  ratio?: string;
  apiKey?: string;
  productImage?: SceneImageAsset;
  characterImage?: SceneImageAsset;
}

export async function triggerReplicationSceneGeneration(
  input: ReplicationSceneTriggerInput
) {
  const webhookUrl =
    process.env.N8N_REPLICATION_SCENE_WEBHOOK?.trim() ||
    'https://hooks.atomx.top/webhook/zReh7LF4U6UdA10R';

  if (!webhookUrl) {
    console.warn('No replication scene webhook configured, skipping trigger.');
    return { skipped: true };
  }

  const payload: Record<string, unknown> = {
    task_id: input.taskId,
    script_id: input.script.id,
    script_title: input.script.title,
    script_breakdown: input.script.breakdown,
    script_blueprint: input.script.blueprint,
    product_id: input.product?.id,
    product_name: input.product?.name,
    product_description: input.product?.description,
    product_analysis: input.product?.analysisResult,
    character_id: input.character.id,
    character_name: input.character.name,
    prompt: input.prompt,
    ratio: input.ratio || '9:16',
    api_key: input.apiKey,
    product_image_url: input.productImage?.url,
    product_image_b64: input.productImage?.base64,
    product_mime_type: input.productImage?.mimeType,
    person_image_url: input.characterImage?.url,
    person_image_b64: input.characterImage?.base64,
    person_mime_type: input.characterImage?.mimeType,
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(
      `Replication scene workflow failed: ${response.status} ${errorText}`
    );
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { success: true, data };
}

// ─── Image-Text Replication ───────────────────────────────────────────────

export interface ImageTextBreakdownInput {
  taskId: string;
  sourceTitle?: string | null;
  sourceText?: string | null;
  sourceImages?: string[];
  sourcePlatform?: string | null;
  apiKey?: string;
  callbackUrl: string;
  adminToken: string;
}

export async function triggerImageTextBreakdown(
  input: ImageTextBreakdownInput,
): Promise<void> {
  const webhookUrl = process.env.N8N_IMAGE_TEXT_BREAKDOWN_WEBHOOK;
  if (!webhookUrl) {
    console.warn("[n8n] N8N_IMAGE_TEXT_BREAKDOWN_WEBHOOK not set — skipping");
    return;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task_id: input.taskId,
      workflow_id: "flow_image_text_breakdown",
      source_title: input.sourceTitle ?? "",
      source_text: input.sourceText ?? "",
      source_images: input.sourceImages ?? [],
      source_platform: input.sourcePlatform ?? "",
      api_key: input.apiKey ?? "",
      apiKey: input.apiKey ?? "",
      callback_url: input.callbackUrl,
      admin_token: input.adminToken,
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`[n8n] image-text breakdown trigger failed: ${response.status} ${err}`);
  }
}

export interface ImageTextGenerateInput {
  taskId: string;
  analysisResult: unknown;
  stylePresetSpec?: unknown;       // null = replicate original style
  topicHint?: string | null;
  imageCount: number;
  apiKey?: string;
  callbackUrl: string;
  adminToken: string;
  /** Base URL for n8n to upload generated images to Supabase storage */
  imageUploadUrl?: string;
}

export async function triggerImageTextGenerate(
  input: ImageTextGenerateInput,
): Promise<void> {
  const webhookUrl = process.env.N8N_IMAGE_TEXT_GENERATE_WEBHOOK;
  if (!webhookUrl) {
    console.warn("[n8n] N8N_IMAGE_TEXT_GENERATE_WEBHOOK not set — skipping");
    return;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task_id: input.taskId,
      workflow_id: "h9C7tASreNSsXxaS",
      analysis_result: input.analysisResult,
      style_preset_spec: input.stylePresetSpec ?? null,
      topic_hint: input.topicHint ?? "",
      image_count: input.imageCount,
      api_key: input.apiKey ?? "",
      apiKey: input.apiKey ?? "",
      callback_url: input.callbackUrl,
      admin_token: input.adminToken,
      image_upload_url: input.imageUploadUrl ?? "",
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`[n8n] image-text generate trigger failed: ${response.status} ${err}`);
  }
}

export interface T2VShot {
  shot_idx: number;
  speech_text: string;
  estimated_duration: number;
  image_prompt: string;
  video_prompt: string;
}

export async function triggerT2V(params: {
  taskId: string;
  title: string;
  scriptText: string;
  apiKey?: string;
  callbackUrl: string;
  creativeStyleRaw?: string;
  creativeStyleNorm?: string;
  styleProfileText?: string;
  allowText?: boolean;
}): Promise<{ ok: boolean }> {
  const webhookUrl = process.env.N8N_T2V_WEBHOOK || 'https://hooks.atomx.top/webhook/t2v_web';

  const allowText = params.allowText ?? false;

  let styleProfileJson: unknown = null;
  if (params.styleProfileText) {
    try {
      styleProfileJson = JSON.parse(params.styleProfileText);
    } catch {
      styleProfileJson = params.styleProfileText;
    }
  }

  const payload = {
    task_id: params.taskId,
    title: params.title,
    topic: params.title,
    script_text: params.scriptText,
    callback_url: params.callbackUrl,
    '基础信息': {
      api_key: params.apiKey || '',
    },
    creative_style_raw: params.creativeStyleRaw ?? '',
    creative_style_norm: params.creativeStyleNorm ?? '写实',
    style_profile_json: styleProfileJson,
    route: allowText ? 'A' : 'B',
    allow_text_raw: allowText ? '是' : '否',
    allow_text_bool: allowText,
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`[n8n] t2v trigger failed: ${response.status} ${err}`);
  }

  return { ok: true };
}

export async function triggerAutoEdit(params: {
  taskId: string;
  voiceId: string;
  minimaxKey: string;
  videoUrls: string[];
  textArray: string[];
  callbackUrl: string;
  bgmUrl?: string;
  speed?: number;
  wantSubtitles?: boolean;
}): Promise<{ ok: boolean }> {
  const webhookUrl = process.env.N8N_AUTO_EDIT_WEBHOOK || 'https://hooks.atomx.top/webhook/cup_web';

  const payload = {
    task_id: params.taskId,
    voice_id: params.voiceId,
    minimax_key: params.minimaxKey,
    video: params.videoUrls,
    text_array: params.textArray,
    callback_url: params.callbackUrl,
    bgm_url: params.bgmUrl ?? '',
    speed: params.speed ?? 1.2,
    want_subtitles: params.wantSubtitles ?? true,
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`[n8n] auto-edit trigger failed: ${response.status} ${err}`);
  }

  return { ok: true };
}
