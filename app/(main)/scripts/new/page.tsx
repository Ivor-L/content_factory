"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createScript } from "../actions";

export default function NewScriptPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(event.currentTarget);

    try {
      // 1. Create script in DB
      const script = await createScript(formData);

      if (!script || !script.id) {
        throw new Error("Failed to create script");
      }

      // 2. Call breakdown API
      // We don't block the redirect on this if we want it fast, but the prompt implies it's part of the process.
      // Since it's a "simulation", it might be fast.
      // If it takes 1.5s (mock), waiting is fine.
      const res = await fetch("/api/scripts/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptId: script.id }),
      });

      if (!res.ok) {
        console.error("Breakdown failed", await res.text());
        // We continue to redirect so user can see the script at least
      }

      // 3. Redirect
      router.push(`/scripts/${script.id}`);
    } catch (err: any) {
      setError(err.message || "An error occurred");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Add New Script</h1>
      
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-md mb-6">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg border shadow-sm">
        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-1">Title</label>
          <input
            type="text"
            id="title"
            name="title"
            required
            className="w-full border rounded-md px-3 py-2 focus:ring-2 focus:ring-black focus:outline-none"
            placeholder="e.g., How to make coffee"
          />
        </div>

        <div>
          <label htmlFor="videoUrl" className="block text-sm font-medium mb-1">Video URL</label>
          <input
            type="url"
            id="videoUrl"
            name="videoUrl"
            required
            className="w-full border rounded-md px-3 py-2 focus:ring-2 focus:ring-black focus:outline-none"
            placeholder="https://example.com/video.mp4"
          />
          <p className="text-xs text-gray-500 mt-1">Direct link to video file or YouTube URL</p>
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium mb-1">Description (Optional)</label>
          <textarea
            id="description"
            name="description"
            rows={4}
            className="w-full border rounded-md px-3 py-2 focus:ring-2 focus:ring-black focus:outline-none"
            placeholder="Any additional context for the breakdown..."
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-black text-white py-3 rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {loading ? "Processing..." : "Create Script & Analyze"}
        </button>
      </form>
    </div>
  );
}
