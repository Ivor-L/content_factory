'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Search, Trash2, Download, BookOpen, Save, Eye, PencilLine } from 'lucide-react';
import MarkdownIt from 'markdown-it';
import { supabase } from '@/lib/supabaseClient';
import { Modal } from '@/components/Modal';
import { splitMarkdownDocument } from '@/lib/markdown-frontmatter';

type SkillItem = {
  id: string;
  name: string;
  description?: string;
  source?: string;
  tags?: string[];
};

type MarketplaceSkill = {
  skillId: string;
  name: string;
  description?: string;
  source?: string;
  installs?: number;
  installed?: boolean;
  tags?: string[];
};

type SkillDetail = SkillItem & {
  content: string;
};

export default function SkillsPage() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);
  const [marketLoading, setMarketLoading] = useState(false);
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [marketSkills, setMarketSkills] = useState<MarketplaceSkill[]>([]);
  const [activeTab, setActiveTab] = useState<'mine' | 'market'>('mine');
  const [search, setSearch] = useState('');
  const [marketSearch, setMarketSearch] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newContent, setNewContent] = useState('');
  const [selectedSkillName, setSelectedSkillName] = useState('');
  const [detailError, setDetailError] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [editorSnapshot, setEditorSnapshot] = useState<{ content: string } | null>(null);
  const [saveHint, setSaveHint] = useState('');
  const [detailMode, setDetailMode] = useState<'edit' | 'preview'>('preview');
  const [readmeOpen, setReadmeOpen] = useState(false);
  const [readmeLoading, setReadmeLoading] = useState(false);
  const [readmeTitle, setReadmeTitle] = useState('');
  const [readmeContent, setReadmeContent] = useState('');
  const [readmeError, setReadmeError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthToken(data.session?.access_token ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthToken(session?.access_token ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadSkills = useCallback(async () => {
    if (!authToken) return;
    setLoading(true);
    try {
      const res = await fetch('/api/skills', {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => ({})) as { skills?: SkillItem[] };
      if (res.ok && Array.isArray(payload.skills)) {
        setSkills(payload.skills);
      } else {
        setSkills([]);
      }
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  const loadSkillDetail = useCallback(async (name: string) => {
    if (!authToken || !name) return;
    setDetailLoading(true);
    setDetailError('');
    setSaveHint('');
    try {
      const res = await fetch(`/api/skills?name=${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => ({})) as { skill?: SkillDetail; error?: string };
      if (!res.ok || !payload.skill) {
        throw new Error(payload.error || '加载技能详情失败');
      }
      const skill = payload.skill;
      const content = skill.content || '';
      setSelectedSkillName(skill.name);
      setEditorContent(content);
      setEditorSnapshot({ content });
      setDetailMode('preview');
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : '加载技能详情失败');
      setEditorContent('');
      setEditorSnapshot(null);
      setDetailMode('preview');
    } finally {
      setDetailLoading(false);
    }
  }, [authToken]);

  const loadMarketplace = useCallback(async () => {
    if (!authToken) return;
    setMarketLoading(true);
    try {
      const query = marketSearch.trim();
      const url = query ? `/api/skills/marketplace/search?q=${encodeURIComponent(query)}` : '/api/skills/marketplace/search';
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => ({})) as { skills?: MarketplaceSkill[] };
      if (res.ok && Array.isArray(payload.skills)) {
        setMarketSkills(payload.skills);
      }
    } finally {
      setMarketLoading(false);
    }
  }, [authToken, marketSearch]);

  useEffect(() => {
    if (!authToken) return;
    void loadSkills();
  }, [authToken, loadSkills]);

  useEffect(() => {
    if (activeTab !== 'mine') return;
    if (skills.length === 0) {
      setSelectedSkillName('');
      setEditorContent('');
      setEditorSnapshot(null);
      setDetailError('');
      setDetailMode('preview');
      return;
    }
    if (!selectedSkillName || !skills.some((skill) => skill.name === selectedSkillName)) {
      void loadSkillDetail(skills[0].name);
    }
  }, [activeTab, loadSkillDetail, selectedSkillName, skills]);

  useEffect(() => {
    if (!authToken) return;
    void loadMarketplace();
  }, [authToken, loadMarketplace]);

  const filteredSkills = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return skills;
    return skills.filter((skill) => `${skill.name} ${skill.description || ''}`.toLowerCase().includes(keyword));
  }, [skills, search]);

  const selectedSkill = useMemo(
    () => skills.find((skill) => skill.name === selectedSkillName) ?? null,
    [skills, selectedSkillName],
  );

  const isDirty = useMemo(() => {
    if (!editorSnapshot) return false;
    return editorSnapshot.content !== editorContent;
  }, [editorContent, editorSnapshot]);

  const markdownParser = useMemo(
    () =>
      new MarkdownIt({
        html: false,
        linkify: true,
        breaks: true,
      }),
    [],
  );

  const previewDocument = useMemo(() => splitMarkdownDocument(editorContent || ''), [editorContent]);
  const previewHtml = useMemo(
    () => markdownParser.render(previewDocument.body || ''),
    [markdownParser, previewDocument.body],
  );

  const createSkill = useCallback(async () => {
    if (!authToken) return;
    if (!newName.trim() || !newContent.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim(),
          content: newContent,
        }),
      });
      const payload = await res.json().catch(() => ({})) as { skill?: SkillItem };
      if (!res.ok) return;
      setNewName('');
      setNewDescription('');
      setNewContent('');
      setShowCreateForm(false);
      await loadSkills();
      if (payload.skill?.name) {
        await loadSkillDetail(payload.skill.name);
      }
      await loadMarketplace();
    } finally {
      setSaving(false);
    }
  }, [authToken, loadMarketplace, loadSkillDetail, loadSkills, newContent, newDescription, newName]);

  const removeSkill = useCallback(async (name: string) => {
    if (!authToken) return;
    const res = await fetch(`/api/skills?name=${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) return;
    if (name === selectedSkillName) {
      setSelectedSkillName('');
      setEditorContent('');
      setEditorSnapshot(null);
      setDetailError('');
    }
    await loadSkills();
    await loadMarketplace();
  }, [authToken, loadMarketplace, loadSkills, selectedSkillName]);

  const saveSelectedSkill = useCallback(async () => {
    if (!authToken || !selectedSkillName || !editorContent.trim()) return;
    setDetailSaving(true);
    setSaveHint('');
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: selectedSkillName,
          content: editorContent,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || '保存失败');
      }
      await loadSkills();
      await loadSkillDetail(selectedSkillName);
      setSaveHint('已保存');
    } catch (error) {
      setSaveHint(error instanceof Error ? error.message : '保存失败');
    } finally {
      setDetailSaving(false);
    }
  }, [authToken, editorContent, loadSkillDetail, loadSkills, selectedSkillName]);

  const installSkill = useCallback(async (skillId: string) => {
    if (!authToken) return;
    const res = await fetch('/api/skills/marketplace/install', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ skillId }),
    });
    if (!res.ok) return;
    await loadSkills();
    await loadMarketplace();
  }, [authToken, loadMarketplace, loadSkills]);

  const uninstallSkill = useCallback(async (name: string) => {
    if (!authToken) return;
    const res = await fetch('/api/skills/marketplace/remove', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ skill: name }),
    });
    if (!res.ok) return;
    await loadSkills();
    await loadMarketplace();
  }, [authToken, loadMarketplace, loadSkills]);

  const openReadme = useCallback(async (skill: MarketplaceSkill) => {
    if (!authToken) return;
    setReadmeOpen(true);
    setReadmeTitle(skill.name);
    setReadmeContent('');
    setReadmeError('');
    setReadmeLoading(true);
    try {
      const res = await fetch(`/api/skills/marketplace/readme?skillId=${encodeURIComponent(skill.skillId)}`, {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => ({})) as {
        skill?: { content?: string };
        error?: string;
      };
      if (!res.ok) {
        throw new Error(payload.error || '加载技能说明失败');
      }
      setReadmeContent(payload.skill?.content || '暂无说明内容');
    } catch (error) {
      setReadmeError(error instanceof Error ? error.message : '加载技能说明失败');
    } finally {
      setReadmeLoading(false);
    }
  }, [authToken]);

  return (
    <div className="w-full px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">技能中心</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">管理 Agent 可调用 skills，并从市场安装默认技能。</p>
      </div>

      <div className="mb-4 max-w-[360px]">
        <div className="relative grid grid-cols-2 rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-700 dark:bg-gray-800">
          <span
            className={`pointer-events-none absolute bottom-0.5 left-0.5 top-0.5 w-[calc(50%-0.125rem)] rounded-md bg-white shadow-sm transition-transform duration-200 dark:bg-gray-900 ${
              activeTab === 'mine' ? 'translate-x-0' : 'translate-x-full'
            }`}
          />
          <button
            type="button"
            onClick={() => setActiveTab('mine')}
            className={`relative z-10 rounded-md px-2.5 py-1.5 text-xs transition ${
              activeTab === 'mine'
                ? 'font-medium text-gray-900 dark:text-gray-100'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            我的技能
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('market');
              void loadMarketplace();
            }}
            className={`relative z-10 rounded-md px-2.5 py-1.5 text-xs transition ${
              activeTab === 'market'
                ? 'font-medium text-gray-900 dark:text-gray-100'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            技能市场
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {activeTab === 'mine' ? (
          <>
            <div className="grid gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
              <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-400">INSTALLED</p>
                  <div className="flex items-center gap-2">
                    {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                    <button
                      type="button"
                      onClick={() => setShowCreateForm((prev) => !prev)}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {showCreateForm ? '收起添加' : '新建技能'}
                    </button>
                  </div>
                </div>
                <div className="mb-3 flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700">
                  <Search className="h-4 w-4 text-gray-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="搜索技能..."
                    className="w-full bg-transparent text-sm text-gray-800 outline-none dark:text-gray-100"
                  />
                </div>
                <div className="max-h-[560px] overflow-y-auto">
                  {filteredSkills.map((skill) => {
                    const active = skill.name === selectedSkillName;
                    return (
                      <div
                        key={skill.id}
                        className={`rounded-md border-b px-2 py-2 transition ${
                          active
                            ? 'border-gray-300 bg-gray-100 dark:border-gray-700 dark:bg-gray-800/60'
                            : 'border-gray-200 dark:border-gray-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => void loadSkillDetail(skill.name)}
                            className="flex-1 text-left"
                          >
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{skill.name}</p>
                            <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{skill.description || '暂无描述'}</p>
                          </button>
                          {skill.source === 'user' && (
                            <button
                              type="button"
                              onClick={() => void removeSkill(skill.name)}
                              className="inline-flex h-7 w-7 items-center justify-center text-gray-500 transition hover:text-red-600"
                              aria-label={`删除技能 ${skill.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {!loading && filteredSkills.length === 0 && (
                    <div className="px-3 py-5 text-xs text-gray-500 dark:text-gray-400">
                      暂无技能
                    </div>
                  )}
                </div>

                {showCreateForm && (
                  <div className="mt-4 space-y-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">新增自定义技能</p>
                    <input
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                      placeholder="技能名称（如 my-wiki-audit）"
                      className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    />
                    <input
                      value={newDescription}
                      onChange={(event) => setNewDescription(event.target.value)}
                      placeholder="技能描述"
                      className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    />
                    <textarea
                      value={newContent}
                      onChange={(event) => setNewContent(event.target.value)}
                      placeholder="技能内容（Markdown）"
                      className="min-h-[130px] w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    />
                    <button
                      type="button"
                      onClick={() => void createSkill()}
                      disabled={saving || !newName.trim() || !newContent.trim()}
                      className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      保存技能
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                {!selectedSkillName ? (
                  <div className="flex min-h-[560px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                    请从左侧选择一个技能查看详情
                  </div>
                ) : detailLoading ? (
                  <div className="flex min-h-[560px] items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    加载技能详情中...
                  </div>
                ) : detailError ? (
                  <div className="flex min-h-[560px] items-center justify-center text-sm text-red-600 dark:text-red-400">
                    {detailError}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">/{selectedSkillName}</p>
                        <span className="rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0 text-[11px] text-orange-600 dark:border-orange-500/30 dark:bg-orange-900/20 dark:text-orange-300">
                          {selectedSkill?.source || 'unknown'}
                        </span>
                      </div>
                      <div className="inline-flex items-center gap-1 rounded-md border border-gray-200 p-1 dark:border-gray-700">
                        <button
                          type="button"
                          onClick={() => setDetailMode('edit')}
                          title="编辑模式"
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${
                            detailMode === 'edit'
                              ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                          }`}
                        >
                          <PencilLine className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailMode('preview')}
                          title="预览模式"
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${
                            detailMode === 'preview'
                              ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                          }`}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <div className="mx-1 h-6 w-px bg-gray-200 dark:bg-gray-700" />
                        <button
                          type="button"
                          onClick={() => void saveSelectedSkill()}
                          title="保存"
                          disabled={detailSaving || !editorContent.trim() || !isDirty}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          {detailSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeSkill(selectedSkillName)}
                          title={selectedSkill?.source === 'user' ? '删除技能' : '内置技能不可删除'}
                          disabled={selectedSkill?.source !== 'user'}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-300 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {detailMode === 'edit' ? (
                      <>
                        <textarea
                          value={editorContent}
                          onChange={(event) => {
                            setEditorContent(event.target.value);
                            setSaveHint('');
                          }}
                          placeholder="完整技能文档（含 frontmatter + Markdown）"
                          className="h-[78vh] max-h-[78vh] w-full resize-none overflow-auto rounded-md border border-gray-200 px-3 py-2 font-mono text-sm leading-6 outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                        />
                      </>
                    ) : (
                      <div className="flex h-[78vh] max-h-[78vh] flex-col gap-3 overflow-hidden">
                        <p className="text-xs text-gray-500 dark:text-gray-400">预览模式（Markdown）</p>
                        <div
                          className="prose max-w-none flex-1 overflow-auto rounded-md border border-gray-200 p-5 text-[15px] leading-8 text-gray-800 prose-headings:font-semibold prose-headings:text-gray-900 prose-h1:mb-5 prose-h1:text-3xl prose-h1:leading-tight prose-h2:mt-10 prose-h2:mb-4 prose-h2:border-b prose-h2:border-gray-200 prose-h2:pb-2 prose-h2:text-2xl prose-h2:leading-tight prose-h3:mt-8 prose-h3:mb-3 prose-h3:text-xl prose-p:my-4 prose-p:leading-8 prose-ul:my-4 prose-ul:space-y-2 prose-ol:my-4 prose-ol:space-y-2 prose-li:leading-8 prose-blockquote:my-6 prose-blockquote:border-l-4 prose-blockquote:border-gray-300 prose-blockquote:pl-4 prose-blockquote:text-gray-700 prose-strong:font-semibold prose-code:rounded prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-pre:my-6 prose-pre:rounded-md prose-pre:border prose-pre:border-gray-200 dark:prose-invert dark:border-gray-700 dark:prose-headings:text-gray-100 dark:prose-h2:border-gray-700 dark:prose-blockquote:border-gray-600 dark:prose-blockquote:text-gray-300 dark:prose-code:bg-gray-800 dark:prose-pre:border-gray-700"
                          dangerouslySetInnerHTML={{ __html: previewHtml || '<p>暂无内容</p>' }}
                        />
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <p className="text-gray-500 dark:text-gray-400">
                        点击左侧技能可查看完整详情；使用右上角图标在预览和编辑间切换。
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!editorSnapshot) return;
                            setEditorContent(editorSnapshot.content);
                            setSaveHint('');
                          }}
                          disabled={!isDirty || detailSaving}
                          className="rounded-md border border-gray-200 px-2.5 py-1 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          重置
                        </button>
                        {saveHint && (
                          <span className={saveHint === '已保存' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                            {saveHint}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="mb-1 flex items-center justify-end">
              {marketLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
            </div>
            <div className="mb-3 flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                value={marketSearch}
                onChange={(event) => setMarketSearch(event.target.value)}
                placeholder="搜索市场技能..."
                className="w-full bg-transparent text-sm text-gray-800 outline-none dark:text-gray-100"
              />
            </div>
            <div className="max-h-[580px] space-y-2 overflow-y-auto">
              {marketSkills.map((skill) => (
                <div key={skill.skillId} className="rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{skill.name}</p>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{skill.description || '暂无描述'}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {(skill.tags || []).map((tag) => (
                          <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void openReadme(skill)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        说明
                      </button>
                      {skill.installed ? (
                        <button
                          type="button"
                          onClick={() => void uninstallSkill(skill.name)}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          卸载
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void installSkill(skill.skillId)}
                          className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs text-white hover:bg-black dark:bg-gray-100 dark:text-gray-900"
                        >
                          <Download className="h-3.5 w-3.5" />
                          安装
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {!marketLoading && marketSkills.length === 0 && (
                <div className="rounded-md border border-dashed border-gray-300 px-3 py-5 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  未找到技能
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <BookOpen className="h-3.5 w-3.5" />
              当前市场为内置默认技能，后续可扩展外部源。
            </div>
          </>
        )}
      </div>
      <Modal
        isOpen={readmeOpen}
        onClose={() => setReadmeOpen(false)}
        title={`技能说明 · ${readmeTitle || '-'}`}
        maxWidth="max-w-4xl"
      >
        {readmeLoading ? (
          <div className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载说明...
          </div>
        ) : readmeError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{readmeError}</p>
        ) : (
          <pre className="whitespace-pre-wrap break-words rounded-md border border-gray-200 bg-gray-50 p-4 text-xs leading-6 text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
            {readmeContent || '暂无说明内容'}
          </pre>
        )}
      </Modal>
    </div>
  );
}
