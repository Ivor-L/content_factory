import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  Plus,
  Loader2,
  RefreshCcw,
  PenSquare,
  CheckCircle2,
  AlertTriangle,
  X,
  ArrowLeft,
} from 'lucide-react';
import {
  api,
  MissingApiKeyError,
  type CreativeTaskSummary,
  type CreativeTaskDetail,
  type CreativeStageKey,
} from '../utils/api';
import { creativeStageOrder, creativeStages } from '../constants/creativeStages';

const defaultForm = {
  title: '',
  ideaText: '',
  channel: 'xhs',
  targetOutput: '图文',
};

type ViewMode = 'list' | 'detail';

type StageSection = {
  title: string;
  items: string[];
};

const KEY_LABELS: Record<string, string> = {
  notes: '提示',
  summary: '摘要',
  clarity: '观点清晰度',
  recommendedRoute: '建议路线',
  keyQuestions: '关键问题',
  nextActions: '下一步行动',
  insights: '洞察',
  stories: '故事/案例',
  dataPoints: '数据点',
  gaps: '缺口',
  coreTopic: '核心命题',
  promise: '读者收益',
  heroSentence: '灵魂句',
  angles: '可能角度',
  titles: '标题建议',
  outlineBullets: '要点',
  sections: '段落结构',
  transitions: '过渡',
  headline: '文章标题',
};

const STATUS_COLORS: Record<string, { label: string; color: string; bg: string }> = {
  clear: { label: '观点清晰', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  fuzzy: { label: '需要澄清', color: 'text-amber-600', bg: 'bg-amber-50' },
};

const ROUTE_MAP: Record<string, string> = {
  mining: '思维挖掘',
  diagnosis: '诊断',
  topic: '选题确定',
  framework: '框架讨论',
  draft: '内容产出',
};

function normalizeValue(value: any, options?: { key?: string }): string {
  if (value == null) return '';
  if (typeof value === 'string') {
    if (options?.key === 'clarity') {
      const mapped = STATUS_COLORS[value.toLowerCase()];
      return mapped?.label || value;
    }
    if (options?.key === 'recommendedRoute') {
      return ROUTE_MAP[value] || value;
    }
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item)).filter(Boolean).join('；');
  }
  if (typeof value === 'object') {
    const parts = Object.entries(value)
      .map(([key, val]) => {
        const label = KEY_LABELS[key] || key;
        const text = normalizeValue(val, { key });
        return text ? `${label}: ${text}` : '';
      })
      .filter(Boolean);
    return parts.join('｜');
  }
  return '';
}

function buildStageSections(output: any): StageSection[] {
  if (!output) return [];

  let parsed: any = output;
  if (typeof output === 'string') {
    const trimmed = output.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return [{ title: 'AI 输出', items: [trimmed] }];
    }
  }

  if (typeof parsed === 'string' || typeof parsed === 'number' || typeof parsed === 'boolean') {
    return [{ title: 'AI 输出', items: [String(parsed)] }];
  }

  if (Array.isArray(parsed)) {
    const items = parsed.map((item) => normalizeValue(item)).filter(Boolean);
    return items.length ? [{ title: 'AI 输出', items }] : [];
  }

  if (typeof parsed === 'object') {
    const sections: StageSection[] = [];
    for (const [key, value] of Object.entries(parsed)) {
      if (value == null) continue;
      if (key === 'clarity' || key === 'recommendedRoute') {
        const textValue = normalizeValue(value, { key });
        if (textValue) {
          sections.push({ title: KEY_LABELS[key] || key, items: [textValue] });
        }
        continue;
      }

      if (Array.isArray(value)) {
        const items = value.map((item) => normalizeValue(item)).filter(Boolean);
        if (items.length) {
          sections.push({ title: KEY_LABELS[key] || key, items });
        }
        continue;
      }
      if (typeof value === 'object') {
        if (Array.isArray((value as any).items)) {
          const items = (value as any).items.map((item: any) => normalizeValue(item)).filter(Boolean);
          if (items.length) {
            sections.push({ title: KEY_LABELS[key] || key, items });
          }
        } else {
          const normalized = normalizeValue(value, { key });
          if (normalized) {
            sections.push({ title: KEY_LABELS[key] || key, items: [normalized] });
          }
        }
        continue;
      }
      const textValue = normalizeValue(value);
      if (textValue) {
        sections.push({ title: KEY_LABELS[key] || key, items: [textValue] });
      }
    }
    const fallback = normalizeValue(parsed);
    return sections.length
      ? sections
      : fallback
        ? [{ title: 'AI 输出', items: [fallback] }]
        : [];
  }

  return [];
}

export default function Content() {
  const [tasks, setTasks] = useState<CreativeTaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CreativeTaskDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState(defaultForm);
  const [creating, setCreating] = useState(false);
  const [stageGenerating, setStageGenerating] = useState<CreativeStageKey | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const loadDetail = useCallback(
    async (taskId: string, showSpinner = true) => {
      if (!taskId) return;
      if (showSpinner) setDetailLoading(true);
      try {
        const data = await api.getCreativeTaskDetail(taskId);
        setDetail(data);
        setActiveStageKey(data?.stage ?? null);
      } catch (error) {
        if (error instanceof MissingApiKeyError) {
          setApiKeyMissing(true);
        } else {
          console.error(error);
          alert('获取任务详情失败。');
        }
      } finally {
        if (showSpinner) setDetailLoading(false);
      }
    },
    []
  );

  const refreshTasks = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getCreativeTasks();
      setTasks(list);
      setApiKeyMissing(false);
      if (viewMode === 'detail' && selectedTaskId) {
        const stillExists = list.some((task) => task.id === selectedTaskId);
        if (stillExists) {
          await loadDetail(selectedTaskId, false);
        } else {
          setDetail(null);
          setSelectedTaskId(null);
          setViewMode('list');
        }
      } else if (list.length === 0) {
        setDetail(null);
        setSelectedTaskId(null);
        setViewMode('list');
      }
    } catch (error) {
      if (error instanceof MissingApiKeyError) {
        setApiKeyMissing(true);
      } else {
        console.error(error);
        alert('加载任务失败，请稍后重试。');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedTaskId, loadDetail, viewMode]);

  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

  const handleCreateTask = async () => {
    if (!createForm.ideaText.trim()) {
      alert('请输入创作灵感或需求。');
      return;
    }
    setCreating(true);
    try {
      const created = await api.createCreativeTask({
        title: createForm.title || undefined,
        ideaText: createForm.ideaText,
        channel: createForm.channel || undefined,
        targetOutput: createForm.targetOutput || undefined,
      });
      setCreateModalOpen(false);
      setCreateForm(defaultForm);
      await refreshTasks();
      if (created?.id) {
        setSelectedTaskId(created.id);
        setViewMode('detail');
        await loadDetail(created.id);
      }
    } catch (error) {
      if (error instanceof MissingApiKeyError) {
        setApiKeyMissing(true);
      } else {
        console.error(error);
        alert('创建任务失败，请检查 API Key 或稍后再试。');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleStageGenerate = async (stage: CreativeStageKey) => {
    if (!detail) return;
    setStageGenerating(stage);
    try {
      await api.generateCreativeStage(detail.id, stage);
      await loadDetail(detail.id);
    } catch (error) {
      if (error instanceof MissingApiKeyError) {
        setApiKeyMissing(true);
      } else {
        console.error(error);
        alert('AI 生成失败，请稍后重试。');
      }
    } finally {
      setStageGenerating((prev) => (prev === stage ? null : prev));
    }
  };

  const handleSelectTask = async (taskId: string) => {
    setSelectedTaskId(taskId);
    setViewMode('detail');
    await loadDetail(taskId);
  };

  const handleBackToList = () => {
    setViewMode('list');
    setDetail(null);
    setSelectedTaskId(null);
  };

  const stageMeta = useMemo(() => detail?.metadata?.stages || {}, [detail]);
  const [activeStageKey, setActiveStageKey] = useState<CreativeStageKey | null>(null);

useEffect(() => {
  if (detail?.stage) {
    setActiveStageKey(detail.stage);
  }
}, [detail?.stage]);

  const currentStage = useMemo(() => {
    if (!detail) return null;
    return activeStageKey ?? detail.stage;
  }, [detail, activeStageKey]);

  const currentSections = useMemo(() => {
    if (!detail) return [];
    const stage = currentStage ?? detail.stage;
    return buildStageSections(stageMeta[stage]?.aiOutput);
  }, [currentStage, detail, stageMeta]);

  const renderStageStatus = useCallback(
    (stage: CreativeStageKey) => {
      const meta = stageMeta[stage];
      if (!meta?.status || meta.status === 'pending') {
        return <span className="text-xs text-text-secondary">未开始</span>;
      }
      if (meta.status === 'in_progress') {
        return (
          <span className="text-xs text-amber-500 flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" /> 生成中
          </span>
        );
      }
      if (meta.status === 'blocked') {
        return (
          <span className="text-xs text-red-500 flex items-center gap-1">
            <AlertTriangle size={12} /> 待处理
          </span>
        );
      }
      return (
        <span className="text-xs text-emerald-600 flex items-center gap-1">
          <CheckCircle2 size={12} /> 已完成
        </span>
      );
    },
    [stageMeta]
  );

  return (
    <div className="space-y-6 pb-28">
      {viewMode === 'list' && (
        <>
          <div className="bg-white rounded-[2rem] p-6 soft-shadow space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center">
                <Sparkles size={24} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-primary">多阶段内容创作</h1>
                <p className="text-sm text-text-secondary">沿用 Web 端流程：诊断 → 挖掘 → 选题 → 框架 → 成稿</p>
              </div>
            </div>
            <p className="text-xs text-text-secondary">
              所有阶段会自动关联素材，如需 AI 协助可随时点击任务详情中的「AI 生成」。
            </p>
          </div>

          {apiKeyMissing && (
            <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-2xl p-4 text-sm">
              请先在「个人中心」里绑定租户 API Key，才能调取写作助手后端能力。
            </div>
          )}

          <div className="bg-white rounded-[2rem] p-6 soft-shadow space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-primary">我的任务</h2>
              <button
                onClick={() => void refreshTasks()}
                className="text-text-secondary hover:text-primary flex items-center gap-1 text-sm"
              >
                <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} /> 刷新
              </button>
            </div>
            {loading ? (
              <div className="py-6 text-center text-text-secondary text-sm">加载中...</div>
            ) : tasks.length === 0 ? (
              <div className="py-6 text-center text-text-secondary text-sm">还没有任务，点击右下角加号开始创作。</div>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => void handleSelectTask(task.id)}
                    className="w-full text-left p-4 rounded-2xl bg-secondary hover:bg-secondary/70 transition-all"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-primary line-clamp-1">
                          {task.title || task.ideaText || '未命名任务'}
                        </p>
                        <p className="text-xs text-text-secondary mt-1">
                          当前阶段：{creativeStages[task.stage].title} · {new Date(task.updatedAt).toLocaleString()}
                        </p>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-white text-primary font-semibold">
                        {task.status === 'completed' ? '已完成' : '处理中'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {viewMode === 'detail' && detail && (
        <div className="bg-white rounded-[2rem] p-6 soft-shadow space-y-4">
          <div className="flex items-center justify-between">
            <button
              onClick={handleBackToList}
              className="flex items-center gap-1 text-sm text-text-secondary hover:text-primary"
            >
              <ArrowLeft size={16} /> 返回列表
            </button>
            <button
              onClick={() => void loadDetail(detail.id)}
              className="text-text-secondary hover:text-primary flex items-center gap-1 text-sm"
            >
              <RefreshCcw size={16} className={detailLoading ? 'animate-spin' : ''} /> 刷新
            </button>
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-bold text-primary">{detail.title || detail.ideaText || '未命名任务'}</h2>
            <p className="text-xs text-text-secondary">
              目标输出：{detail.targetOutput || '图文'} · 当前阶段：{creativeStages[detail.stage].title}
            </p>
          </div>

          <div className="bg-white rounded-[2rem] p-4 border border-primary/5 shadow-sm">
            <div className="grid grid-cols-2 gap-3">
              {creativeStageOrder.map((stage, index) => {
                const status = stageMeta[stage]?.status;
                const isActive = currentStage === stage;
                const isCompleted = status === 'completed' || creativeStageOrder.indexOf(detail.stage) > index;
                const ring = isActive ? 'border-primary bg-primary/10' : 'border-white bg-secondary';
                const textClass = isActive ? 'text-primary font-bold' : 'text-text-secondary';
                const dotClass = isCompleted ? 'bg-primary' : 'bg-text-secondary/40';
                return (
                  <button
                    key={stage}
                    onClick={() => setActiveStageKey(stage)}
                    className={`flex items-center gap-3 rounded-2xl border px-3 py-2 transition-all ${
                      isActive ? 'bg-primary/5 border-primary/30' : 'bg-secondary border-transparent'
                    }`}
                  >
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${ring}`}>
                      {index + 1}
                    </span>
                    <div className="flex flex-col items-start">
                      <span className={`text-xs ${textClass}`}>{creativeStages[stage].title}</span>
                      <span className="text-[10px] text-text-secondary flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                        {status === 'completed'
                          ? '已完成'
                          : status === 'in_progress'
                            ? '生成中'
                            : '待处理'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {apiKeyMissing && (
            <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-2xl p-3 text-xs">
              请先在个人中心绑定 API Key，才能继续调度 AI。
            </div>
          )}

          <div className="bg-secondary rounded-[2rem] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-primary">
                  {creativeStages[currentStage ?? detail.stage].title}
                </p>
                <p className="text-[11px] text-text-secondary">
                  {creativeStages[currentStage ?? detail.stage].description}
                </p>
              </div>
              {renderStageStatus(currentStage ?? detail.stage)}
            </div>

            {currentSections.length === 0 ? (
              <p className="bg-white rounded-2xl p-4 text-xs text-text-secondary">暂无 AI 输出。</p>
            ) : (
              <div className="space-y-3">
                {currentSections.map((section, idx) => (
                  <div key={`${currentStage}-${section.title}-${idx}`} className="bg-white rounded-2xl p-4 space-y-1">
                    <p className="text-xs font-bold text-primary">{section.title}</p>
                    <ul className="space-y-1 text-xs text-text-secondary">
                      {section.items.map((item, itemIdx) => (
                        <li key={itemIdx} className="leading-5">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => currentStage && handleStageGenerate(currentStage)}
              disabled={!currentStage || stageGenerating === currentStage || apiKeyMissing}
              className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 ${
                !currentStage || stageGenerating === currentStage
                  ? 'bg-white text-text-secondary'
                  : 'bg-primary text-white hover:bg-black/80'
              }`}
            >
              {stageGenerating === currentStage ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {stageGenerating === currentStage ? '生成中...' : 'AI 生成当前阶段'}
            </button>
          </div>
        </div>
      )}

      {viewMode === 'list' && (
        <div className="fixed right-6 bottom-32 z-30">
          <button
            onClick={() => setCreateModalOpen(true)}
            className="w-14 h-14 rounded-full bg-primary text-white soft-shadow flex items-center justify-center hover:bg-black/80 transition-colors"
          >
            <Plus size={24} />
          </button>
        </div>
      )}

      {createModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-t-[2rem] sm:rounded-[2rem] p-6 space-y-4 relative animate-in slide-in-from-bottom-2 sm:zoom-in">
            <button
              onClick={() => setCreateModalOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-secondary text-text-secondary flex items-center justify-center hover:text-primary"
            >
              <X size={16} />
            </button>
            <div className="flex items-center gap-2">
              <PenSquare size={18} className="text-primary" />
              <h3 className="text-lg font-bold text-primary">新建创作任务</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-text-secondary mb-1 block">任务标题（可选）</label>
                <input
                  type="text"
                  value={createForm.title}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
                  className="w-full bg-secondary rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="用于区分不同创作"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-text-secondary mb-1 block">创作灵感 / 需求</label>
                <textarea
                  value={createForm.ideaText}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, ideaText: e.target.value }))}
                  className="w-full bg-secondary rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[100px]"
                  placeholder="要写什么？希望输出什么角度/平台？"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-text-secondary mb-1 block">渠道</label>
                  <input
                    type="text"
                    value={createForm.channel}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, channel: e.target.value }))}
                    className="w-full bg-secondary rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="如：xhs、douyin"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-text-secondary mb-1 block">目标形态</label>
                  <input
                    type="text"
                    value={createForm.targetOutput}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, targetOutput: e.target.value }))}
                    className="w-full bg-secondary rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="如：图文、口播稿"
                  />
                </div>
              </div>
              <button
                onClick={() => void handleCreateTask()}
                disabled={creating}
                className={`w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 ${
                  creating ? 'bg-secondary text-text-secondary' : 'bg-primary hover:bg-black/80'
                }`}
              >
                {creating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {creating ? '创建中...' : '开始创作'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
