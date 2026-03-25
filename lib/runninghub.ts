const RUNNINGHUB_BASE_URL = process.env.RUNNINGHUB_BASE_URL?.replace(/\/$/, "") ||
  "https://www.runninghub.cn";

export type RunningHubNodePatch = {
  nodeId: string;
  fieldName: string;
  fieldValue: string | number | boolean;
};

type RunningHubResponse<T> = {
  code?: number;
  msg?: string;
  data?: T;
};

async function runningHubRequest<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const url = `${RUNNINGHUB_BASE_URL}${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: "www.runninghub.cn",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const result = (await response.json().catch(() => ({}))) as RunningHubResponse<T>;
  const success = response.ok && result.code === 0;
  if (!success) {
    const message = result.msg || "RunningHub request failed";
    throw new Error(`${message}`);
  }
  return result.data as T;
}

export async function createRunningHubTask(params: {
  apiKey: string;
  workflowId: string;
  nodeInfoList: RunningHubNodePatch[];
  webhookUrl?: string;
  workflow?: string;
  addMetadata?: boolean;
}) {
  return runningHubRequest<{ taskId: string; taskStatus?: string }>(
    "/task/openapi/create",
    {
      apiKey: params.apiKey,
      workflowId: params.workflowId,
      nodeInfoList: params.nodeInfoList,
      webhookUrl: params.webhookUrl,
      workflow: params.workflow,
      addMetadata: params.addMetadata ?? true,
    },
  );
}

export async function fetchRunningHubStatus(params: { apiKey: string; taskId: string }) {
  return runningHubRequest<{ taskStatus?: string; status?: string; data?: unknown }>(
    "/task/openapi/status",
    {
      apiKey: params.apiKey,
      taskId: params.taskId,
    },
  );
}

export type RunningHubOutput = {
  fileUrl?: string;
  fileType?: string;
  nodeId?: string;
  taskCostTime?: number;
  [key: string]: unknown;
};

export async function fetchRunningHubOutputs(params: { apiKey: string; taskId: string }) {
  return runningHubRequest<RunningHubOutput[]>("/task/openapi/outputs", {
    apiKey: params.apiKey,
    taskId: params.taskId,
  });
}
