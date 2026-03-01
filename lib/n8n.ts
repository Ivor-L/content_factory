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
    
    // MOCK: Update local DB if productId is present (simulating n8n behavior)
    if (productData.productId) {
        try {
            // Dynamically import prisma to avoid edge runtime issues if any (though this is a node function)
            const { default: prisma } = await import('@/lib/prisma');
            
            const mockWorkflowData = {
                "product_name": productData.name,
                "visual_description": `[Mock Analysis] ${productData.description || 'A great product.'}`,
                "marketing_profile": {
                  "target_audience_vibe": "Tech enthusiasts",
                  "ideal_environment": "Home office",
                  "core_selling_points": [
                    { "type": "Physical", "description": "High quality build", "visual_proof": "Close up shot" },
                    { "type": "Emotional", "description": "Boosts productivity", "visual_proof": "Smiling user" }
                  ]
                }
            };
            
            await prisma.product.update({
                where: { id: productData.productId },
                data: {
                    sellingPoints: JSON.stringify(mockWorkflowData), // Storing full JSON as per new schema agreement
                    sellingPointsText: mockWorkflowData.visual_description,
                }
            });
            console.log(`[Mock] Updated product ${productData.productId} with analysis data`);
        } catch (e) {
            console.error("[Mock] Failed to update local DB", e);
        }
    }

    const mockWorkflowData = {
      "product_name": "手持式多功能蒸汽清洁机",
      "visual_description": "产品主体为白色哑光塑料材质，底部为深灰色磨砂质感，顶部注水口盖和喷嘴为黑色。整体造型圆润，呈水壶状，手柄设计符合人体工学。机身正面下方有红色和绿色指示灯，以及一个电源符号和警示符号。喷嘴处有白色蒸汽冒出，显示其工作状态。电源线为灰色，从底部连接。整体设计简洁现代，体积小巧。",
      "marketing_profile": {
        "target_audience_vibe": "注重家居清洁卫生、追求高效便捷生活方式的都市白领、年轻家庭、租房党、以及有宠物或小孩的家庭。他们可能居住空间有限，需要一款多功能且易于收纳的清洁工具。",
        "ideal_environment": "现代简约风格的家居环境，如厨房台面、浴室瓷砖、沙发缝隙、窗户玻璃、汽车内饰等需要局部深度清洁的场景。也适用于办公室或小型商业场所的日常维护。",
        "core_selling_points": [
          {
            "type": "Physical",
            "description": "强劲高温蒸汽，有效杀菌除螨，深层清洁顽固污渍。",
            "visual_proof": "特写镜头展示蒸汽喷射的强度和范围；对比画面展示清洁前后污渍去除效果（如油污、霉斑）；微距镜头模拟蒸汽杀菌除螨效果（如动画或示意图）。"
          },
          {
            "type": "Physical",
            "description": "多功能喷嘴配件，适用于多种清洁场景，一机多用。",
            "visual_proof": "展示产品配备的不同喷嘴（如刷头、刮板、延长管等），并分别演示其在不同场景下的使用（如清洁厨房油烟机、擦拭玻璃、熨烫衣物、清洁地板缝隙）。"
          },
          {
            "type": "Physical",
            "description": "轻巧便携，手持操作方便，收纳不占空间。",
            "visual_proof": "模特单手轻松操作产品进行清洁的画面；产品被放置在小巧的收纳空间中（如橱柜、抽屉）的特写；与传统大型清洁设备进行对比，突出其便携性。"
          },
          {
            "type": "Emotional",
            "description": "告别繁琐清洁，享受轻松高效的家居生活，带来洁净舒适的居住体验。",
            "visual_proof": "用户轻松愉悦地使用产品清洁，面带微笑；清洁后的家居环境焕然一新，阳光明媚，整洁舒适；用户在清洁后放松享受生活的画面（如喝咖啡、与家人互动）。"
          },
          {
            "type": "Emotional",
            "description": "无需化学清洁剂，环保健康，呵护家人与宠物健康。",
            "visual_proof": "特写镜头展示产品只加水即可工作，旁边放置纯净水瓶；用户在清洁儿童玩具或宠物用品时安心的表情；对比画面展示传统清洁剂的刺激性气味与蒸汽清洁的无味无害。"
          }
        ]
      }
    };

    return {
      sellingPoints: mockWorkflowData.marketing_profile.core_selling_points.map(p => p.description),
      detailedDescription: mockWorkflowData.visual_description,
      workflowData: mockWorkflowData
    };
  }

  try {
    const payload: any = { ...productData };
    if (productData.productId) payload.product_id = productData.productId;
    if (productData.apiKey) payload.api_key = productData.apiKey;
    if (productData.workflowId) payload.workflow_id = productData.workflowId;
    // Map image url to image_url expected by n8n
    if (productData.images && productData.images.length > 0) {
        payload.image_url = productData.images[0];
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

    const data = await response.json();
    
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
    // In case of error, return mock data or rethrow depending on requirement.
    // Here, I'll return mock data for robustness during development.
     return {
      sellingPoints: [
        "High quality material (fallback)",
        "Durable and long-lasting (fallback)",
      ],
      detailedDescription: `Analysis failed, showing fallback description for ${productData.name}.`,
    };
  }
}

export interface ScriptData {
  title: string;
  videoUrl: string;
  description?: string;
}

export interface BreakdownResult {
  intro: string;
  body: string;
  conclusion: string;
}

export async function breakdownScript(scriptData: ScriptData): Promise<BreakdownResult> {
  const webhookUrl = process.env.N8N_SCRIPT_BREAKDOWN_WEBHOOK;

  if (!webhookUrl) {
    console.warn("N8N_SCRIPT_BREAKDOWN_WEBHOOK not set, returning mock data");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return {
      intro: "Hook: Are you struggling with efficient content creation? This video shows exactly how to solve that problem in 3 simple steps.",
      body: "Value Prop: The speaker demonstrates the new AI tool that automates video editing. Key points: 1. Upload raw footage. 2. Select style. 3. Export viral clip.",
      conclusion: "CTA: Click the link in bio to try it for free and don't forget to subscribe for more tips!",
    };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scriptData),
    });

    if (!response.ok) {
        throw new Error(`N8N webhook failed with status ${response.status}`);
    }

    const data = await response.json();
    return {
      intro: data.intro || "Intro not found",
      body: data.body || "Body not found",
      conclusion: data.conclusion || "Conclusion not found",
    };
  } catch (error) {
    console.error("Error calling N8N webhook for script breakdown:", error);
    return {
      intro: "Error: Could not retrieve intro.",
      body: "Error: Could not retrieve body.",
      conclusion: "Error: Could not retrieve conclusion.",
    };
  }
}

export interface ReplicationResult {
  generatedScript: string;
  videoPrompt: string;
}

export async function generateReplication(product: any, script: any): Promise<ReplicationResult> {
  const webhookUrl = process.env.N8N_REPLICATION_WEBHOOK;

  if (!webhookUrl) {
    console.warn("N8N_REPLICATION_WEBHOOK not set, returning mock data");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return {
      generatedScript: `Title: ${product.name} meets ${script.title}\n\nHere is a new script structure inspired by "${script.title}" but tailored for "${product.name}".\n\n1. Hook: ${script.breakdown ? JSON.parse(script.breakdown).intro : "Grab attention"}... but for ${product.name}!\n2. Body: Explain how ${product.name} solves the problem using the structure: ${script.breakdown ? JSON.parse(script.breakdown).body : "Explain value"}.\n3. Call to Action: Buy ${product.name} now!`,
      videoPrompt: `A high-quality commercial video for ${product.name}. The scene opens with...`,
    };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product, script, flow: "flow_farm_copy" }),
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
    console.error("Error calling N8N webhook for replication:", error);
    return {
      generatedScript: "Error: Could not generate script.",
      videoPrompt: "Error: Could not generate video prompt.",
    };
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
