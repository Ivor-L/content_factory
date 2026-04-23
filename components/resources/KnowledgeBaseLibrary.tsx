"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Folder,
  FolderPlus,
  PencilLine,
  Loader2,
  FileText,
  Hash,
  UploadCloud,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

type KnowledgeFolder = {
  id: string;
  name: string;
  description?: string | null;
  updatedAt?: string;
  _count?: {
    files: number;
    chunks: number;
    conversations: number;
  };
};

type KnowledgeFile = {
  id: string;
  title: string;
  status?: string;
  _count?: {
    chunks: number;
  };
};

type KnowledgeBaseLibraryProps = {
  showHeader?: boolean;
};

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900/15 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-white/20";

export function KnowledgeBaseLibrary({ showHeader = true }: KnowledgeBaseLibraryProps) {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [folders, setFolders] = useState<KnowledgeFolder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [descriptionInput, setDescriptionInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = uploadInputRef.current;
    if (!input) return;
    // Enable folder picker in Chromium-based browsers while keeping fallback compatibility.
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
  }, []);

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

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedId) ?? null,
    [folders, selectedId],
  );

  const fetchFolders = useCallback(async () => {
    if (!authToken) return;
    setLoadingFolders(true);
    try {
      const res = await fetch("/api/knowledge/folders?limit=200", {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: "no-store",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "加载知识库失败");
      const rows = Array.isArray(payload.data) ? (payload.data as KnowledgeFolder[]) : [];
      setFolders(rows);
      setSelectedId((prev) => prev ?? rows[0]?.id ?? null);
      if (rows.length === 0) setSelectedId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载知识库失败");
    } finally {
      setLoadingFolders(false);
    }
  }, [authToken]);

  const fetchFiles = useCallback(
    async (folderId: string) => {
      if (!authToken || !folderId) {
        setFiles([]);
        return;
      }
      setLoadingFiles(true);
      try {
        const res = await fetch(`/api/knowledge/folders/${folderId}/files?limit=300`, {
          headers: { Authorization: `Bearer ${authToken}` },
          cache: "no-store",
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || "加载文件失败");
        setFiles(Array.isArray(payload.data) ? payload.data : []);
      } catch (error) {
        setFiles([]);
        toast.error(error instanceof Error ? error.message : "加载文件失败");
      } finally {
        setLoadingFiles(false);
      }
    },
    [authToken],
  );

  useEffect(() => {
    if (!authToken) return;
    void fetchFolders();
  }, [authToken, fetchFolders]);

  useEffect(() => {
    if (!selectedId) {
      setFiles([]);
      return;
    }
    void fetchFiles(selectedId);
  }, [selectedId, fetchFiles]);

  const openCreate = () => {
    setNameInput("");
    setDescriptionInput("");
    setShowCreate(true);
  };

  const openEdit = () => {
    if (!selectedFolder) return;
    setNameInput(selectedFolder.name);
    setDescriptionInput(selectedFolder.description ?? "");
    setShowEdit(true);
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!authToken) {
      toast.error("请先登录");
      return;
    }
    const name = nameInput.trim();
    if (!name) {
      toast.error("请输入文件夹名称");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/knowledge/folders", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description: descriptionInput.trim() || undefined,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "创建失败");
      setShowCreate(false);
      toast.success("知识库文件夹已创建");
      await fetchFolders();
      if (payload?.data?.id) setSelectedId(payload.data.id as string);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!authToken || !selectedFolder) return;
    const name = nameInput.trim();
    if (!name) {
      toast.error("请输入文件夹名称");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/knowledge/folders/${selectedFolder.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description: descriptionInput.trim() || "",
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "更新失败");
      setShowEdit(false);
      toast.success("知识库文件夹已更新");
      await fetchFolders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = "";
    if (selectedFiles.length === 0 || !selectedId || !authToken) return;

    setUploading(true);
    try {
      const failedFiles: string[] = [];
      let successCount = 0;
      const CONCURRENCY = 4;

      const uploadOneFile = async (file: File) => {
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath?.trim();
        const formData = new FormData();
        formData.append("file", file);
        formData.append("title", relativePath || file.name);
        formData.append("sourceType", "manual");

        const res = await fetch(`/api/knowledge/folders/${selectedId}/upload`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
          body: formData,
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || "上传失败");
      };

      for (let index = 0; index < selectedFiles.length; index += CONCURRENCY) {
        const batch = selectedFiles.slice(index, index + CONCURRENCY);
        const results = await Promise.allSettled(batch.map((file) => uploadOneFile(file)));
        results.forEach((result, resultIndex) => {
          const file = batch[resultIndex];
          if (result.status === "fulfilled") {
            successCount += 1;
            return;
          }
          failedFiles.push(file.name);
        });
      }

      if (successCount > 0) {
        toast.success(`已上传 ${successCount} 个文件并完成分块`);
        await Promise.all([fetchFiles(selectedId), fetchFolders()]);
      }
      if (failedFiles.length > 0) {
        const preview = failedFiles.slice(0, 3).join("、");
        const extra = failedFiles.length > 3 ? ` 等 ${failedFiles.length} 个文件` : "";
        toast.error(`部分文件上传失败：${preview}${extra}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-5">
      {showHeader && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">知识库</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            每个文件夹对应一个助手知识空间，可在首页对话中直接选择使用。
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          <FolderPlus className="h-4 w-4" />
          新建文件夹
        </button>
        <button
          type="button"
          onClick={openEdit}
          disabled={!selectedFolder}
          className="inline-flex items-center gap-2 rounded-2xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <PencilLine className="h-4 w-4" />
          编辑
        </button>
        <button
          type="button"
          onClick={() => uploadInputRef.current?.click()}
          disabled={!selectedFolder || uploading}
          className="inline-flex items-center gap-2 rounded-2xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          上传文件夹
        </button>
        <input
          ref={uploadInputRef}
          type="file"
          className="hidden"
          onChange={handleUploadSelect}
          multiple
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <section className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">文件夹列表</h3>
            {loadingFolders && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          </div>

          {folders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              还没有知识库文件夹，先创建一个吧。
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {folders.map((folder) => {
                const active = selectedId === folder.id;
                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => setSelectedId(folder.id)}
                    className={cn(
                      "rounded-3xl border p-4 text-left transition",
                      active
                        ? "border-gray-400 bg-gray-100 shadow-sm dark:border-gray-500 dark:bg-gray-800"
                        : "border-gray-200 bg-gray-50 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800/50 dark:hover:border-gray-600",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Folder className="mt-0.5 h-4 w-4 text-gray-500 dark:text-gray-300" />
                      <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-gray-600 dark:bg-white/10 dark:text-gray-300">
                        {folder._count?.files ?? 0} 文件
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-1 text-base font-semibold text-gray-900 dark:text-white">
                      {folder.name}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                      {folder.description || "暂无描述"}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">文件树</h3>
            {loadingFiles && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          </div>

          {!selectedFolder ? (
            <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              请选择左侧文件夹查看文件树。
            </div>
          ) : files.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              当前文件夹暂无文件。
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/40"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                    <FileText className="h-4 w-4 text-gray-500 dark:text-gray-300" />
                    <span className="line-clamp-1">{file.title}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center gap-1">
                      <Hash className="h-3 w-3" />
                      {file._count?.chunks ?? 0} chunks
                    </span>
                    <span>{file.status ?? "READY"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {(showCreate || showEdit) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-gray-900">
            <h4 className="text-base font-semibold text-gray-900 dark:text-white">
              {showCreate ? "新建知识库文件夹" : "编辑知识库文件夹"}
            </h4>
            <form
              className="mt-4 space-y-3"
              onSubmit={showCreate ? handleCreate : handleEdit}
            >
              <div className="space-y-1">
                <label className="text-xs text-gray-500 dark:text-gray-400">名称</label>
                <input
                  value={nameInput}
                  onChange={(event) => setNameInput(event.target.value)}
                  className={inputClass}
                  placeholder="如：oscar"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500 dark:text-gray-400">描述（可选）</label>
                <textarea
                  value={descriptionInput}
                  onChange={(event) => setDescriptionInput(event.target.value)}
                  className={cn(inputClass, "min-h-[96px] resize-y")}
                  placeholder="这个知识库的用途和内容范围"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(false);
                    setShowEdit(false);
                  }}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {showCreate ? "创建" : "保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
