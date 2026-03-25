import { AlertTriangle, BookOpen, Compass, Layers3, ListChecks, Megaphone, MessageSquare, ShieldCheck, Sparkles, Target, Type } from "lucide-react";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type WritingStyleProfileOverviewProps = {
  profile?: Record<string, any> | null;
  sampleGaps?: string | null;
  sampleImprovement?: string | null;
  className?: string;
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const toArray = <T,>(value: unknown, mapper: (item: any) => T | null, limit = 12): T[] => {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  const mapped: T[] = [];
  for (const item of list) {
    if (mapped.length >= limit) break;
    const normalized = mapper(item);
    if (normalized == null) continue;
    mapped.push(normalized);
  }
  return mapped;
};

const toTextArray = (value: unknown, limit = 8) =>
  toArray<string>(value, (item) => stringifyValue(item), limit).filter(Boolean);

const stringifyValue = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) return value.map((item) => stringifyValue(item)).filter(Boolean).join(" / ");
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value);
};

export function WritingStyleProfileOverview({
  profile,
  sampleGaps,
  sampleImprovement,
  className,
}: WritingStyleProfileOverviewProps) {
  const hasProfile = profile && Object.keys(profile).length > 0;
  if (!hasProfile) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-4 text-sm text-gray-500 dark:text-gray-400">
        暂无结构化风格，请点击“提炼风格”后再查看。
      </div>
    );
  }

  const domain = asRecord(profile?.domain_inference);
  const styleCore = asRecord(profile?.style_core);
  const tone = asRecord(styleCore.tone);
  const rhythm = asRecord(styleCore.rhythm);
  const lexical = asRecord(styleCore.lexical_signature);
  const structureBank = asRecord(profile?.structure_bank);
  const openingRules = asRecord(profile?.opening_rules);
  const layoutRules = asRecord(profile?.paragraph_and_layout_rules);
  const ctaRules = asRecord(profile?.cta_rules);
  const guardrails = asRecord(profile?.guardrails);
  const exaggerationLimits = asRecord(guardrails.exaggeration_limits);
  const qualityChecklist = Array.isArray(profile?.quality_checklist)
    ? profile?.quality_checklist.filter((item: unknown) => typeof item === "string")
    : [];
  const failureModes = Array.isArray(profile?.failure_modes_and_fixes)
    ? profile?.failure_modes_and_fixes
        .map((item: any) => ({
          failure: stringifyValue(item?.failure),
          fix: stringifyValue(item?.fix),
        }))
        .filter((item) => item.failure || item.fix)
    : [];
  const evidence = asRecord(profile?.evidence);
  const representativeSnippets = Array.isArray(evidence.representative_snippets)
    ? evidence.representative_snippets
        .map((item: any) => ({
          note: stringifyValue(item?.note),
          snippet: stringifyValue(item?.snippet),
        }))
        .filter((item) => item.snippet)
    : [];
  const blueprints = Array.isArray(structureBank.blueprints)
    ? structureBank.blueprints
        .map((item: any, index: number) => ({
          name: stringifyValue(item?.name) || `模板 ${index + 1}`,
          sections: toTextArray(item?.sections, 8),
          notes: stringifyValue(item?.notes),
        }))
        .filter((item) => item.sections.length > 0 || item.notes || item.name)
    : [];
  const templates = Array.isArray(structureBank.templates)
    ? structureBank.templates
        .map((item: any, index: number) => ({
          label: stringifyValue(item?.label) || stringifyValue(item?.name) || `模块 ${index + 1}`,
          pattern: stringifyValue(item?.pattern || item?.template || item?.text),
          notes: stringifyValue(item?.notes),
        }))
        .filter((item) => item.pattern || item.notes)
    : [];

  return (
    <div className={cn("space-y-4", className)}>
      {(sampleGaps || sampleImprovement) && (
        <div className="grid gap-3 md:grid-cols-2">
          {sampleGaps && (
            <InfoBanner
              icon={AlertTriangle}
              tone="amber"
              title="样本缺失点"
              description={sampleGaps}
            />
          )}
          {sampleImprovement && (
            <InfoBanner
              icon={Sparkles}
              tone="sky"
              title="补样本 / 改进建议"
              description={sampleImprovement}
            />
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          icon={Compass}
          title="领域洞察"
          description="样本文档透露的业务定位与读者画像"
        >
          <TagGroup label="主攻主题" items={toTextArray(domain.topics)} />
          <StatList
            items={[
              { label: "内容目标", value: stringifyValue(domain.content_goal) || "-" },
              { label: "读者画像猜测", value: stringifyValue(domain.target_audience_guess) || "-" },
              { label: "高频卡片类型", value: toTextArray(domain.dominant_card_types).join(" / ") || "-" },
            ]}
          />
          {domain.gaps && (
            <MutedNote label="数据提醒" text={stringifyValue(domain.gaps)} />
          )}
          {domain.adaptation_strategy && (
            <MutedNote label="补样策略" text={stringifyValue(domain.adaptation_strategy)} />
          )}
        </SectionCard>

        <SectionCard icon={Target} title="人物与语气" description="口吻、视角、语气限制">
          <StatList
            items={[
              { label: "Persona", value: stringifyValue(styleCore.persona) || "-" },
              { label: "叙述视角", value: stringifyValue(styleCore.pov) || "-" },
            ]}
          />
          <TagGroup label="语气关键词" items={toTextArray(tone.core)} />
          {tone.limits && <MutedNote label="语气禁区" text={stringifyValue(tone.limits)} />}
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard icon={Type} title="节奏与句式" description="段落节奏、句长、突出节奏">
          <StatList
            items={[
              { label: "段落规则", value: stringifyValue(rhythm.paragraph_rule) || "-" },
              {
                label: "短句占比",
                value:
                  rhythm.short_sentence_ratio != null
                    ? `${Math.round(Number(rhythm.short_sentence_ratio) * 100)}%`
                    : "-",
              },
              {
                label: "单句最多字符",
                value:
                  rhythm.max_sentence_chars != null
                    ? `${Number(rhythm.max_sentence_chars)} 字`
                    : "-",
              },
              {
                label: "高亮频率",
                value:
                  rhythm.highlight_line_every_n_paragraphs != null
                    ? `每 ${rhythm.highlight_line_every_n_paragraphs} 段`
                    : "-",
              },
            ]}
          />
          <TagGroup label="高频词" items={toTextArray(lexical.high_frequency_words)} />
          <TagGroup label="避免词" items={toTextArray(lexical.avoid_words)} />
          <TagGroup label="禁用词" items={toTextArray(lexical.banned_words)} />
        </SectionCard>

        <SectionCard icon={Layers3} title="结构范式" description="蓝图与可复用模板">
          {blueprints.length > 0 ? (
            <div className="space-y-3">
              {blueprints.map((bp, index) => (
                <div
                  key={`${bp.name}-${index}`}
                  className="rounded-xl border border-gray-100 dark:border-gray-800 p-3"
                >
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {bp.name}
                  </p>
                  {bp.sections.length > 0 && (
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                      {bp.sections.join(" → ")}
                    </p>
                  )}
                  {bp.notes && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{bp.notes}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <MutedNote text="暂无蓝图" />
          )}
          {templates.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                可填空模板
              </p>
              {templates.map((tpl, index) => (
                <div
                  key={`${tpl.label}-${index}`}
                  className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-3"
                >
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {tpl.label}
                  </p>
                  {tpl.pattern && (
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                      {tpl.pattern}
                    </p>
                  )}
                  {tpl.notes && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{tpl.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard icon={Megaphone} title="开场与段落规则">
          <TagGroup label="首屏硬性约束" items={toTextArray(openingRules.first_screen_constraints)} />
          <TagGroup label="常用钩子" items={toTextArray(openingRules.hook_templates)} />
          <TagGroup label="段落长度" items={toTextArray(layoutRules.paragraph_length_rules)} />
          <TagGroup label="列表/重点框" items={toTextArray(layoutRules.list_rules)} />
          <TagGroup label="强调/举例" items={toTextArray(layoutRules.emphasis_box_rules)} />
          <TagGroup label="案例/比喻" items={toTextArray(layoutRules.examples_rules)} />
        </SectionCard>

        <SectionCard icon={MessageSquare} title="CTA 与互动">
          <TagGroup label="CTA 模版" items={toTextArray(ctaRules.cta_templates)} />
          <TagGroup label="评论引导词" items={toTextArray(ctaRules.comment_keyword_rules)} />
          <TagGroup label="转场句" items={toTextArray(structureBank.transition_patterns)} />
          <TagGroup label="副标题套路" items={toTextArray(structureBank.subtitle_patterns)} />
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard icon={ShieldCheck} title="风控与约束">
          <TagGroup label="风险提示" items={toTextArray(guardrails.claims_and_risk)} />
          {exaggerationLimits.max_per_chars != null && (
            <StatList
              items={[
                {
                  label: "夸张词频上限",
                  value: `${exaggerationLimits.max_per_chars} 次 / ${exaggerationLimits.per_chars || "N"} 字`,
                },
              ]}
            />
          )}
          {Array.isArray(exaggerationLimits.replacement_suggestions) &&
            exaggerationLimits.replacement_suggestions.length > 0 && (
              <div className="mt-2 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  替换建议
                </p>
                {exaggerationLimits.replacement_suggestions.map((item: any, index: number) => (
                  <div
                    key={`replacement-${index}`}
                    className="rounded-xl border border-gray-100 dark:border-gray-800 p-3 text-sm text-gray-700 dark:text-gray-200"
                  >
                    <span className="font-semibold">{stringifyValue(item?.from) || "原词"}</span>
                    <span className="mx-2 text-gray-400">→</span>
                    <span>{stringifyValue(item?.to) || "替换词"}</span>
                  </div>
                ))}
              </div>
            )}
        </SectionCard>

        <SectionCard icon={ListChecks} title="质检清单与修复">
          <TagGroup label="质检 Checklist" items={qualityChecklist} />
          {failureModes.length > 0 && (
            <div className="mt-3 space-y-2">
              {failureModes.map((item, index) => (
                <div
                  key={`failure-${index}`}
                  className="rounded-xl border border-gray-100 dark:border-gray-800 p-3"
                >
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    失败模式 #{index + 1}
                  </p>
                  {item.failure && (
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                      症状：{item.failure}
                    </p>
                  )}
                  {item.fix && (
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                      修复：{item.fix}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard icon={BookOpen} title="代表证据">
        <StatList
          items={[
            {
              label: "样本文档",
              value:
                evidence.sample_count != null ? `${Number(evidence.sample_count)} 篇` : "-",
            },
          ]}
        />
        {representativeSnippets.length > 0 ? (
          <div className="mt-3 space-y-3">
            {representativeSnippets.map((item, index) => (
              <div
                key={`snippet-${index}`}
                className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-3"
              >
                {item.note && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {item.note}
                  </p>
                )}
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{item.snippet}</p>
              </div>
            ))}
          </div>
        ) : (
          <MutedNote text="暂无代表性语句" />
        )}
      </SectionCard>
    </div>
  );
}

type SectionCardProps = {
  icon?: (typeof Compass);
  title: string;
  description?: string;
  children: ReactNode;
};

function SectionCard({ icon: Icon, title, description, children }: SectionCardProps) {
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-gray-400" />}
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
      </div>
      {description && <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>}
      <div className="space-y-3 text-sm text-gray-700 dark:text-gray-200">{children}</div>
    </div>
  );
}

type TagGroupProps = {
  label?: string;
  items: string[];
};

function TagGroup({ label, items }: TagGroupProps) {
  if (!items.length) return null;
  return (
    <div className="space-y-1">
      {label && (
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {label}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {items.map((item, index) => (
          <span
            key={`${item}-${index}`}
            className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-200"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

type StatListProps = {
  items: Array<{ label: string; value?: string | number | null }>;
};

function StatList({ items }: StatListProps) {
  const filtered = items.filter((item) => item.value != null && String(item.value).trim() !== "");
  if (filtered.length === 0) return null;

  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {filtered.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-3"
        >
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {item.label}
          </dt>
          <dd className="mt-1 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MutedNote({ label, text }: { label?: string; text?: string }) {
  if (!text) return null;
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700 p-3 text-xs text-gray-600 dark:text-gray-300">
      {label && <p className="font-semibold mb-1 text-gray-500 dark:text-gray-400">{label}</p>}
      <p className="whitespace-pre-wrap leading-relaxed text-sm">{text}</p>
    </div>
  );
}

type InfoBannerProps = {
  icon: typeof AlertTriangle;
  tone: "amber" | "sky";
  title: string;
  description: string;
};

function InfoBanner({ icon: Icon, tone, title, description }: InfoBannerProps) {
  const base =
    tone === "amber"
      ? "border-amber-100 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
      : "border-sky-100 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100";
  return (
    <div className={cn("rounded-2xl border p-4 text-sm", base)}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <p className="font-semibold">{title}</p>
      </div>
      <p className="mt-2 whitespace-pre-wrap leading-relaxed">{description}</p>
    </div>
  );
}
