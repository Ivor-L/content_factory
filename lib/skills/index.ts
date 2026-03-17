export type SkillName = "writing-assistant" | "content-agency";

export interface SkillDefinition {
  name: SkillName;
  repo: string;
  entry: string;
  description: string;
}

export const skillRegistry: Record<SkillName, SkillDefinition> = {
  "writing-assistant": {
    name: "writing-assistant",
    repo: "https://github.com/yunshu0909/yunshu_skillshub",
    entry: "writing-assistant",
    description:
      "写作助手：根据观点清晰度自动走 诊断→挖掘→选题→框架→内容，阶段 03 提供结构化框架讨论指引。",
  },
  "content-agency": {
    name: "content-agency",
    repo: "https://github.com/antonia-sz/content-agency",
    entry: "content-agency",
    description:
      "AI Agent：多角色内容创作专家团，按渠道输出可直接发布的稿件与执行建议。",
  },
};
