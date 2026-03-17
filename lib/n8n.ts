export interface ProductData {
  name: string;
  description?: string;
  images: string[];
  productId?: string;
  apiKey?: string;
  workflowId?: string;
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
    
    // Map image url to image_url expected by n8n
    if (productData.images && productData.images.length > 0) {
        let imageUrl = productData.images[0];
        // FIX: n8n container cannot resolve api.supabase.atomx.top, so we replace it with the public IP
        // The server is 47.107.158.233
        if (imageUrl.includes('api.supabase.atomx.top')) {
            imageUrl = imageUrl.replace('api.supabase.atomx.top', '47.107.158.233');
        }
        payload.image_url = imageUrl;
    }
    // Remove internal fields
    delete payload.productId;
    delete payload.apiKey;
    delete payload.workflowId;
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
    
    // Check if the response matches the workflow data structure
    let sellingPoints: string[] = [];
    let detailedDescription = "";
    
    if (data.marketing_profile && data.marketing_profile.core_selling_points) {
       sellingPoints = data.marketing_profile.core_selling_points.map((p: any) => p.description);
    } else if (data.sellingPoints) {
       sellingPoints = data.sellingPoints;
    }

    if (data.visual_description) {
      detailedDescription = data.visual_description;
    } else if (data.detailedDescription) {
      detailedDescription = data.detailedDescription;
    }

    return {
      sellingPoints,
      detailedDescription,
      workflowData: data
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
}

export interface BreakdownResult {
  success: boolean;
  message: string;
}

export async function breakdownScript(scriptData: ScriptData & { scriptId: string; apiKey?: string }): Promise<BreakdownResult> {
  const webhookUrl = process.env.N8N_SCRIPT_BREAKDOWN_WEBHOOK;

  if (!webhookUrl) {
    console.warn("N8N_SCRIPT_BREAKDOWN_WEBHOOK not set, returning mock success");
    return { success: true, message: "Mock trigger successful" };
  }

  try {
    // Construct payload for n8n
    // scriptData contains title, videoUrl, scriptId, apiKey
    const payload = {
        script_id: scriptData.scriptId,
        video_url: scriptData.videoUrl,
        api_key: scriptData.apiKey,
        workflow_id: 'flow_script_dna'
    };

    console.log("Triggering n8n breakdown workflow:", payload);

    // Fire and forget (async trigger)
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`N8N webhook failed with status ${response.status}`);
    }
    
    // We don't wait for the full result.
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
}

export interface ReplicationResult {
  generatedScript: string;
  videoPrompt: string;
}

export async function generateOneClickReplication(
  product: any,
  script: any,
  options: ReplicationOptions
): Promise<{ success: boolean; message: string }> {
  // Specific webhook for One-Click mode
  const webhookUrl = "https://hooks.atomx.top/webhook/farm_Prompt_web";

  try {
    // 1. Extract Product Info (产品信息)
    // Try to parse sellingPoints as JSON array, take first item, or use raw string
    let productInfo = "";
    if (product.sellingPoints) {
      try {
        // Attempt to parse if it looks like JSON
        if (product.sellingPoints.trim().startsWith('[') || product.sellingPoints.trim().startsWith('{')) {
             const points = JSON.parse(product.sellingPoints);
             if (Array.isArray(points) && points.length > 0) {
                 const first = points[0];
                 // Check if it's an object with 'text' property or just a string
                 productInfo = typeof first === 'string' ? first : (first.text || JSON.stringify(first));
             } else {
                 productInfo = product.sellingPoints;
             }
        } else {
            productInfo = product.sellingPoints;
        }
      } catch (e) {
        productInfo = product.sellingPoints;
      }
    }

    // 2. Extract Breakdown Report (爆款视频拆解报告)
    // Prefer structured blueprint JSON; fallback to legacy breakdown text
    let breakdownReport = "";
    if (script.blueprint) {
        try {
            breakdownReport = JSON.parse(script.blueprint);
        } catch (error) {
            console.warn("Failed to parse blueprint JSON. Falling back to raw string.", error);
            breakdownReport = script.blueprint;
        }
    } else if (script.breakdown) {
        breakdownReport = script.breakdown;
    }

    // Construct the payload with specific Chinese keys as requested
    const payload: Record<string, unknown> = {
      "产品信息": productInfo,
      "Target Language": options.targetLanguage,
      "爆款视频拆解报告": breakdownReport,
      "时长": options.duration,
      "国家/地区": options.targetCountry,
      
      // Keep some metadata just in case
      "product_id": product.id,
      "script_id": script.id,
      "callback_url": options.callbackUrl,
      "replication_id": options.replicationId,
      "user_id": options.userId
    };

    if (options.apiKey) {
      payload["api_key"] = options.apiKey;
    }

    console.log("Triggering One-Click Replication:", JSON.stringify(payload, null, 2));

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `One-Click Webhook failed with status ${response.status}${
          errorText ? `: ${errorText.slice(0, 500)}` : ''
        }`
      );
    }

    // Log response
    try {
        const text = await response.text();
        console.log("One-Click Webhook response:", text);
    } catch (e) {}

    return { success: true, message: "One-Click Workflow triggered" };
  } catch (error) {
    console.error("Error calling One-Click Webhook:", error);
    throw error;
  }
}

export async function generateReplication(
  product: any, 
  script: any, 
  options: ReplicationOptions
): Promise<{ success: boolean; message: string }> {
  const webhookUrl = process.env.N8N_REPLICATION_WEBHOOK;

  if (!webhookUrl) {
    console.warn("N8N_REPLICATION_WEBHOOK not set, simulating async process");
    // In mock mode, we can't really do async callback easily without a background worker.
    // So we might just return success and let the caller handle the "pending" state.
    return { success: true, message: "Mock trigger successful" };
  }

  try {
    const payload: Record<string, unknown> = {
      product_id: product.id,
      script_id: script.id,
      ...options,
      // Map camelCase to snake_case for n8n
      target_country: options.targetCountry,
      target_language: options.targetLanguage,
      api_key: options.apiKey,
      callback_url: options.callbackUrl,
      replication_id: options.replicationId,
      flow: "flow_farm_copy"
    };

    if (options.productImageUrl) {
      payload.image_url = options.productImageUrl;
      payload.product_image_url = options.productImageUrl;
    }

    // Remove camelCase versions if you want to be strict, or keep them. 
    // n8n usually prefers snake_case.
    delete (payload as any).targetCountry;
    delete (payload as any).targetLanguage;
    delete (payload as any).apiKey;
    delete (payload as any).callbackUrl;
    delete (payload as any).replicationId;
    delete (payload as any).productImageUrl;

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
      body: JSON.stringify({ sellingPoints, flow: "flow_farm_md" }),
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
      body: JSON.stringify({ scriptContent, flow: "flow_farm_zy" }),
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
