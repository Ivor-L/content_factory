import type { AgentCapabilityDefinition } from './types';
import { enrichCapabilities } from './registry/enrich';
import { PRODUCT_CAPABILITIES } from './registry/product';
import { SOCIAL_CAPABILITIES } from './registry/social';
import { VIDEO_CAPABILITIES } from './registry/video';
import { WRITING_CAPABILITIES } from './registry/writing';
import { XHS_CAPABILITIES } from './registry/xhs';

export const NEXTIDE_CAPABILITIES: AgentCapabilityDefinition[] = enrichCapabilities([
  ...XHS_CAPABILITIES,
  ...VIDEO_CAPABILITIES,
  ...SOCIAL_CAPABILITIES,
  ...PRODUCT_CAPABILITIES,
  ...WRITING_CAPABILITIES,
]);

export function listAgentCapabilities(): AgentCapabilityDefinition[] {
  return NEXTIDE_CAPABILITIES;
}

export function getAgentCapability(id: string): AgentCapabilityDefinition | undefined {
  const normalized = id.trim().toLowerCase();
  return NEXTIDE_CAPABILITIES.find((capability) => capability.id.toLowerCase() === normalized);
}
