import prisma from "@/lib/prisma";

const DEFAULT_CREDIT_CONFIGS = [
  // Canvas 图片
  {
    featureKey: "canvas_image:nano-banana",
    featureName: "Canvas 图片 · Nano Banana",
    category: "canvas_image",
    modelKey: "nano-banana",
    amount: 1,
    enabled: true,
    description: "Canvas 图片生成（nano-banana / Gemini Flash）",
  },
  {
    featureKey: "canvas_image:nano-banana-pro",
    featureName: "Canvas 图片 · Nano Banana Pro",
    category: "canvas_image",
    modelKey: "nano-banana-pro",
    amount: 2,
    enabled: true,
    description: "Canvas 图片生成（nano-banana-pro / Gemini Pro）",
  },
  // Canvas 视频
  {
    featureKey: "canvas_video:veo3",
    featureName: "Canvas 视频 · Veo3",
    category: "canvas_video",
    modelKey: "veo3",
    amount: 5,
    enabled: true,
    description: "Canvas 视频生成（Veo3 标准版）",
  },
  {
    featureKey: "canvas_video:veo3-fast",
    featureName: "Canvas 视频 · Veo3 Fast",
    category: "canvas_video",
    modelKey: "veo3-fast",
    amount: 3,
    enabled: true,
    description: "Canvas 视频生成（Veo3 快速版）",
  },
  {
    featureKey: "canvas_video:sora2",
    featureName: "Canvas 视频 · Sora2",
    category: "canvas_video",
    modelKey: "sora2",
    amount: 5,
    enabled: true,
    description: "Canvas 视频生成（Sora2）",
  },
  {
    featureKey: "canvas_video:grok3",
    featureName: "Canvas 视频 · Grok3",
    category: "canvas_video",
    modelKey: "grok3",
    amount: 4,
    enabled: true,
    description: "Canvas 视频生成（Grok3）",
  },
  // 分镜
  {
    featureKey: "storyboard_split",
    featureName: "分镜拆分",
    category: "storyboard",
    modelKey: null,
    amount: 1,
    enabled: true,
    description: "视频分镜拆解（固定费用）",
  },
  {
    featureKey: "storyboard_video:veo3",
    featureName: "分镜视频生成 · Veo3",
    category: "storyboard",
    modelKey: "veo3",
    amount: 5,
    enabled: true,
    description: "分镜视频生成（Veo3 标准版）",
  },
  {
    featureKey: "storyboard_video:veo3-fast",
    featureName: "分镜视频生成 · Veo3 Fast",
    category: "storyboard",
    modelKey: "veo3-fast",
    amount: 3,
    enabled: true,
    description: "分镜视频生成（Veo3 快速版）",
  },
  // 其他固定费用功能
  {
    featureKey: "image_text_replication",
    featureName: "图文复刻",
    category: "replication",
    modelKey: null,
    amount: 2,
    enabled: true,
    description: "图文内容复刻（固定费用）",
  },
  {
    featureKey: "writing_style_extraction",
    featureName: "写作风格提取",
    category: "writing_style",
    modelKey: null,
    amount: 1,
    enabled: true,
    description: "写作风格提取分析（固定费用）",
  },
  {
    featureKey: "digital_human",
    featureName: "数字人视频",
    category: "digital_human",
    modelKey: null,
    amount: 3,
    enabled: true,
    description: "数字人口播视频生成（固定费用）",
  },
  {
    featureKey: "knowledge_video",
    featureName: "知识视频",
    category: "knowledge_video",
    modelKey: null,
    amount: 2,
    enabled: true,
    description: "知识讲解视频生成（固定费用）",
  },
  // 智能创作
  {
    featureKey: "smart_creation",
    featureName: "智能创作（一键成片）",
    category: "smart_creation",
    modelKey: null,
    amount: 3,
    enabled: true,
    description: "首页智能创作 / 爆款复刻一键成片（固定费用）",
  },
  // 产品与脚本分析
  {
    featureKey: "product_analysis",
    featureName: "产品分析",
    category: "content_generation",
    modelKey: null,
    amount: 2,
    enabled: true,
    description: "上传产品后 AI 分析卖点与描述（固定费用）",
  },
  {
    featureKey: "selling_points_generation",
    featureName: "卖点生成脚本",
    category: "content_generation",
    modelKey: null,
    amount: 1,
    enabled: true,
    description: "基于卖点生成营销脚本（固定费用）",
  },
  {
    featureKey: "script_generation",
    featureName: "脚本生成",
    category: "content_generation",
    modelKey: null,
    amount: 1,
    enabled: true,
    description: "基于脚本内容生成创作内容（固定费用）",
  },
  {
    featureKey: "script_analysis",
    featureName: "脚本分析",
    category: "content_generation",
    modelKey: null,
    amount: 2,
    enabled: true,
    description: "上传脚本后 AI 拆解分析（固定费用）",
  },
  // 时间轴 / 分镜拼接
  {
    featureKey: "storyboard_merge",
    featureName: "分镜视频拼接",
    category: "storyboard",
    modelKey: null,
    amount: 1,
    enabled: true,
    description: "时间轴分镜视频合并拼接（固定费用）",
  },
  {
    featureKey: "storyboard_subtitle",
    featureName: "分镜字幕生成",
    category: "storyboard",
    modelKey: null,
    amount: 1,
    enabled: true,
    description: "分镜视频自动生成字幕（固定费用）",
  },
  // AI 对话助手（按模型计费）
  {
    featureKey: "ai_agent:default",
    featureName: "AI 助手 · 默认模型",
    category: "ai_agent",
    modelKey: "default",
    amount: 1,
    enabled: true,
    description: "AI 对话助手每次会话扣除积分（默认模型）",
  },
  {
    featureKey: "ai_agent:gpt-4o",
    featureName: "AI 助手 · GPT-4o",
    category: "ai_agent",
    modelKey: "gpt-4o",
    amount: 3,
    enabled: true,
    description: "AI 对话助手每次会话扣除积分（GPT-4o）",
  },
  {
    featureKey: "ai_agent:claude-opus",
    featureName: "AI 助手 · Claude Opus",
    category: "ai_agent",
    modelKey: "claude-opus",
    amount: 5,
    enabled: true,
    description: "AI 对话助手每次会话扣除积分（Claude Opus）",
  },
  {
    featureKey: "ai_agent:deepseek-r1",
    featureName: "AI 助手 · DeepSeek R1",
    category: "ai_agent",
    modelKey: "deepseek-r1",
    amount: 2,
    enabled: true,
    description: "AI 对话助手每次会话扣除积分（DeepSeek R1）",
  },
];

async function main() {
  console.log("Seeding credit configs...");
  let created = 0;
  let skipped = 0;

  for (const config of DEFAULT_CREDIT_CONFIGS) {
    const result = await prisma.creditConfig.upsert({
      where: { featureKey: config.featureKey },
      create: config,
      update: {}, // 不覆盖 admin 已修改的值
    });
    if (result.createdAt.getTime() === result.updatedAt.getTime()) {
      created++;
    } else {
      skipped++;
    }
  }

  console.log(`Done: ${created} created, ${skipped} skipped (already exist).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
