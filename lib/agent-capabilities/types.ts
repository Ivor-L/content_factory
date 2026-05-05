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

export interface AgentCapabilitySchemaField {
  type: string;
  required?: boolean;
  description: string;
  enum?: string[];
  default?: unknown;
}

export interface AgentCapabilityDefinition {
  id: string;
  skillName: string;
  title: string;
  description: string;
  status: AgentCapabilityStatus;
  executionType: AgentCapabilityExecutionType;
  internalApiPath?: string;
  method?: 'POST' | 'GET';
  async: boolean;
  maxWaitSeconds: number;
  estimatedDurationSeconds?: number;
  workflowId?: string;
  workflowName?: string;
  featureKey?: string;
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

export interface AgentCapabilityRunResult {
  runId: string;
  capabilityId: string;
  status: AgentCapabilityRunStatus;
  mode: AgentCapabilityRunMode;
  createdAt: string;
  finishedAt?: string;
  result?: unknown;
  artifacts?: Array<{
    type: string;
    url?: string;
    path?: string;
    name?: string;
  }>;
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
