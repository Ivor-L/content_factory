export type AgentCapabilityRunMode = 'wait' | 'submit';

export type AgentCapabilityStatus =
  | 'available'
  | 'planned'
  | 'disabled';

export type AgentCapabilityRunStatus =
  | 'queued'
  | 'running'
  | 'waiting_callback'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timeout';

export type AgentCapabilityExecutionType =
  | 'internal_api'
  | 'n8n_workflow'
  | 'local_agent'
  | 'planned';

export type AgentCapabilityCategory =
  | 'xhs'
  | 'video'
  | 'social'
  | 'product'
  | 'writing'
  | 'earn'
  | 'plugin'
  | 'system';

export type AgentCapabilityCostLevel = 'free' | 'low' | 'medium' | 'high' | 'variable';

export type AgentCapabilityAuthRequirement =
  | 'nexTideApiKey'
  | 'webSession'
  | 'serverEnv'
  | 'none';

export interface AgentCapabilityExample {
  name: string;
  description?: string;
  input: Record<string, unknown>;
}

export interface AgentCapabilitySchemaField {
  type: string;
  required?: boolean;
  description: string;
  enum?: string[];
  default?: unknown;
}

export interface AgentCapabilityDefinition {
  id: string;
  version?: string;
  category?: AgentCapabilityCategory;
  skillName: string;
  title: string;
  description: string;
  status: AgentCapabilityStatus;
  executionType: AgentCapabilityExecutionType;
  costLevel?: AgentCapabilityCostLevel;
  requiredAuth?: AgentCapabilityAuthRequirement[];
  requiredEnv?: string[];
  examples?: AgentCapabilityExample[];
  docsUrl?: string;
  requiredPlan?: string;
  estimatedCredits?: number;
  rateLimit?: {
    perMinute?: number;
    perHour?: number;
  };
  internalApiPath?: string;
  method?: 'POST' | 'GET';
  async: boolean;
  maxWaitSeconds: number;
  estimatedDurationSeconds?: number;
  workflowId?: string;
  workflowName?: string;
  featureKey?: string;
  creditModelKey?: string;
  tags: string[];
  inputSchema: Record<string, AgentCapabilitySchemaField>;
  outputSchema: Record<string, AgentCapabilitySchemaField>;
}

export interface AgentCapabilityRunInput {
  input?: Record<string, unknown>;
  mode?: AgentCapabilityRunMode;
  idempotencyKey?: string;
  client?: {
    agent?: string;
    skill?: string;
    version?: string;
  };
}

export interface AgentCapabilityRunArtifact {
  type: string;
  url?: string;
  path?: string;
  name?: string;
  mimeType?: string;
  data?: unknown;
  metadata?: Record<string, unknown>;
}

export interface AgentCapabilityRunBusiness {
  type?: string;
  id?: string;
  taskId?: string;
  status?: string;
  storyboardTaskId?: string;
  [key: string]: unknown;
}

export interface AgentCapabilityRunResult {
  runId: string;
  capabilityId: string;
  status: AgentCapabilityRunStatus;
  mode: AgentCapabilityRunMode;
  createdAt: string;
  finishedAt?: string;
  result?: unknown;
  artifacts?: AgentCapabilityRunArtifact[];
  usage?: {
    credits?: number;
    provider?: string;
    durationMs?: number;
  };
  error?: {
    code: string;
    message: string;
    details?: unknown;
  } | null;
  statusCommand?: string;
  resultCommand?: string;
}
