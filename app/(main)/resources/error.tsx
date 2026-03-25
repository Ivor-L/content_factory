"use client";

import { useEffect } from "react";
import { toast } from "react-hot-toast";

type ResourcesErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ResourcesError({ error, reset }: ResourcesErrorProps) {
  useEffect(() => {
    console.error("[resources:error]", {
      message: error.message,
      stack: error.stack,
      digest: error.digest,
    });
    toast.error(
      error.message || "资源库加载失败，请刷新页面或稍后再试。"
    );
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16">
      <div className="text-center space-y-3 max-w-md">
        <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          资源库暂时不可用
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          我们已记录错误详情，刷新页面或点击下方按钮重试。
        </p>
        {error?.digest && (
          <p className="text-xs text-gray-400">
            错误编号：{error.digest}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => reset()}
        className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 font-semibold text-white hover:bg-gray-900 dark:bg-white dark:text-black dark:hover:bg-gray-100"
      >
        重新加载
      </button>
    </div>
  );
}
