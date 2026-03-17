export interface UsageEvent {
  id: string;
  createdAt: string | null;
  description: string | null;
  workflowId: string | null;
  workflowName: string | null;
  reason: string | null;
  amount: number | null;
  delta: number | null;
  balanceAfter: number | null;
  raw?: Record<string, unknown> | null;
}

export interface UsageSummary {
  pageConsumed: number;
  latestBalance: number | null;
  latestAt: string | null;
  eventCount: number;
}

export interface UsagePagination {
  page: number;
  size: number;
  total: number | null;
  base: string | null;
}

export interface UsageResponsePayload {
  ok?: boolean;
  events?: UsageEvent[];
  summary?: UsageSummary;
  pagination?: UsagePagination;
  error?: string;
  status?: number;
  details?: string;
  base?: string | null;
}
