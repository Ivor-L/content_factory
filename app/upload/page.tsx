"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");

  // ✅ 新增：租户 api_key / workflow_id（用户粘贴）
  const [apiKey, setApiKey] = useState("");
  const [workflowId, setWorkflowId] = useState("");

  const [msg, setMsg] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [productId, setProductId] = useState("");

  // ✅ 方案A：浏览器直接调用 n8n webhook（注意 CORS）
  // 你现在 n8n 里看到的是 /webhook/product_dna_web，就填这个
  const N8N_WEBHOOK_URL = "https://hooks.flowonn.com/webhook/product_dna_web";

  const onUpload = async () => {
    try {
      setMsg("");
      setPublicUrl("");
      setProductId("");

      if (!file) return setMsg("先选图片");
      if (!name.trim()) return setMsg("先填产品名称");
      if (!apiKey.trim()) return setMsg("先粘贴租户 api_key");
      if (!workflowId.trim()) return setMsg("先填写 workflow_id");

      setMsg("上传中...");

      const ext = file.name.split(".").pop() || "png";
      const path = `products/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

      // 1) 上传到 Supabase Storage bucket: assets
      const { error: upErr } = await supabase.storage
        .from("assets")
        .upload(path, file, {
          upsert: false,
          contentType: file.type,
          cacheControl: "3600",
        });

      if (upErr) return setMsg(`上传失败: ${upErr.message}`);

      // 2) 生成 public url
      const { data } = supabase.storage.from("assets").getPublicUrl(path);
      const url = data.publicUrl;
      setPublicUrl(url);

      // 3) 写入 products 表
      setMsg("写入 products 表...");

      const { data: inserted, error: dbErr } = await supabase
        .from("products")
        .insert({ name: name.trim(), image_url: url })
        .select("id")
        .single();

      if (dbErr) return setMsg(`写入 products 失败: ${dbErr.message}`);

      setProductId(inserted.id);

      // 4) 调用 n8n：补齐 api_key / workflow_id
      setMsg("已保存 products，正在调用 n8n 生成卖点...");

      const resp = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: inserted.id,
          image_url: url,
          product_name: name.trim(),
          api_key: apiKey.trim(),
          workflow_id: workflowId.trim(),
        }),
      });

      const respText = await resp.text();

      if (!resp.ok) {
        return setMsg(
          `已保存 products，但调用 n8n 失败（${resp.status}）：${respText.slice(0, 400)}`
        );
      }

      setMsg("已提交卖点分析任务 ✅（稍后写回 products）");
    } catch (e: any) {
      setMsg(`异常: ${e?.message ?? String(e)}`);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <h1 className="text-4xl font-black">上传产品图片</h1>

      <div className="space-y-2">
        <div className="text-sm font-medium">产品名称</div>
        <input
          className="w-full border rounded px-4 py-3"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：手持蒸汽清洁器"
        />
      </div>

      {/* ✅ 新增：api_key 输入 */}
      <div className="space-y-2">
        <div className="text-sm font-medium">租户 api_key（用户粘贴）</div>
        <input
          className="w-full border rounded px-4 py-3"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk_xxx..."
        />
        <div className="text-xs text-gray-500">
          注意：方案A会在浏览器 Network 里看到 api_key，只适合内测。
        </div>
      </div>

      {/* ✅ 新增：workflow_id 输入 */}
      <div className="space-y-2">
        <div className="text-sm font-medium">workflow_id</div>
        <input
          className="w-full border rounded px-4 py-3"
          value={workflowId}
          onChange={(e) => setWorkflowId(e.target.value)}
          placeholder="workflow_xxx"
        />
      </div>

      <div className="flex items-center gap-4">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          className="px-6 py-3 rounded bg-black text-white"
          onClick={onUpload}
        >
          上传到 assets
        </button>
      </div>

      {msg && <div className="text-sm">{msg}</div>}

      {publicUrl && (
        <div className="space-y-3">
          <div className="text-sm font-medium">图片 URL</div>
          <code className="block text-xs break-all p-3 border rounded bg-gray-50">
            {publicUrl}
          </code>

          {productId && (
            <div className="text-sm">
              product_id：
              <code className="ml-2 text-xs p-1 border rounded bg-gray-50">
                {productId}
              </code>
            </div>
          )}

          <img src={publicUrl} className="w-full rounded border" />
        </div>
      )}
    </div>
  );
}