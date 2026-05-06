import type { AgentCapabilityDefinition } from '../types';

export const PRODUCT_CAPABILITIES: AgentCapabilityDefinition[] = [
  {
    id: 'product.selling_point.analysis',
    skillName: 'product-selling-point-analysis',
    title: '产品卖点分析',
    description: '分析产品图片与描述，提炼卖点、目标人群、痛点和内容角度。',
    status: 'available',
    executionType: 'internal_api',
    internalApiPath: '/api/products/analyze',
    method: 'POST',
    async: false,
    maxWaitSeconds: 180,
    estimatedDurationSeconds: 40,
    featureKey: 'product_analysis',
    workflowId: 'flow_product_dna',
    workflowName: '产品分析',
    tags: ['product', 'selling-points', 'analysis'],
    inputSchema: {
      name: { type: 'string', required: true, description: '产品名称。' },
      description: { type: 'string', description: '产品描述。' },
      images: { type: 'string[]', description: '产品图片 URL 列表。' },
      productId: { type: 'string', description: '已有产品 ID。可选。' },
    },
    outputSchema: {
      sellingPoints: { type: 'string[]', description: '卖点列表。' },
      detailedDescription: { type: 'string', description: '详细产品分析文本。' },
      workflowData: { type: 'object', description: '完整结构化结果。' },
    },
  },
];
