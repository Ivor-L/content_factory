import prisma from '@/lib/prisma';
import type { AgentCapabilityDefinition } from '@/lib/agent-capabilities/types';

export interface AgentCapabilityCreditAuditItem {
  id: string;
  title: string;
  featureKey?: string;
  hasFeatureKey: boolean;
  configExists: boolean;
  configEnabled?: boolean;
  amount?: number;
  category?: string;
  modelKey?: string | null;
  fallbackEstimatedCredits?: number;
  status: 'ok' | 'missing_feature_key' | 'missing_credit_config' | 'disabled_credit_config';
}

export async function auditAgentCapabilityCreditConfigs(capabilities: AgentCapabilityDefinition[]) {
  const featureKeys = Array.from(
    new Set(
      capabilities
        .flatMap((capability) => {
          if (!capability.featureKey) return [];
          const modelKey = capability.creditModelKey || capability.workflowId || capability.workflowName;
          return modelKey ? [capability.featureKey, `${capability.featureKey}:${modelKey}`] : [capability.featureKey];
        }),
    ),
  );
  const configs = featureKeys.length
    ? await prisma.creditConfig.findMany({ where: { featureKey: { in: featureKeys } } })
    : [];
  const configMap = new Map(configs.map((config) => [config.featureKey, config]));

  const items: AgentCapabilityCreditAuditItem[] = capabilities.map((capability) => {
    if (!capability.featureKey) {
      return {
        id: capability.id,
        title: capability.title,
        hasFeatureKey: false,
        configExists: false,
        fallbackEstimatedCredits: capability.estimatedCredits,
        status: 'missing_feature_key',
      };
    }

    const modelConfigKey = capability.creditModelKey || capability.workflowId || capability.workflowName
      ? `${capability.featureKey}:${capability.creditModelKey || capability.workflowId || capability.workflowName}`
      : null;
    const config = (modelConfigKey ? configMap.get(modelConfigKey) : null) || configMap.get(capability.featureKey);
    if (!config) {
      return {
        id: capability.id,
        title: capability.title,
        featureKey: capability.featureKey,
        hasFeatureKey: true,
        configExists: false,
        fallbackEstimatedCredits: capability.estimatedCredits,
        status: 'missing_credit_config',
      };
    }

    return {
      id: capability.id,
      title: capability.title,
      featureKey: capability.featureKey,
      hasFeatureKey: true,
      configExists: true,
      configEnabled: config.enabled,
      amount: config.amount,
      category: config.category,
      modelKey: config.modelKey,
      fallbackEstimatedCredits: capability.estimatedCredits,
      status: config.enabled ? 'ok' : 'disabled_credit_config',
    };
  });

  return {
    ok: items.every((item) => item.status === 'ok'),
    total: items.length,
    okCount: items.filter((item) => item.status === 'ok').length,
    missingFeatureKey: items.filter((item) => item.status === 'missing_feature_key'),
    missingCreditConfig: items.filter((item) => item.status === 'missing_credit_config'),
    disabledCreditConfig: items.filter((item) => item.status === 'disabled_credit_config'),
    items,
  };
}
