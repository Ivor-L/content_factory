'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';

interface Script {
  id: string;
  title: string;
  breakdown: string; // JSON string
}

interface Props {
  scripts: Script[];
}

export default function ScriptForm({ scripts }: Props) {
  const router = useRouter();
  const { t } = useLanguage();
  const [selectedScriptId, setSelectedScriptId] = useState<string>('');
  const [scriptContent, setScriptContent] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleScriptChange = (scriptId: string) => {
    setSelectedScriptId(scriptId);
    if (scriptId) {
      const script = scripts.find((s) => s.id === scriptId);
      if (script) {
        try {
          const breakdown = JSON.parse(script.breakdown);
          // Assuming breakdown has intro, body, conclusion, I'll format it nicely
          const content = `Intro: ${breakdown.intro}\n\nBody: ${breakdown.body}\n\nConclusion: ${breakdown.conclusion}`;
          setScriptContent(content);
        } catch (e) {
          setScriptContent(script.breakdown);
        }
      }
    } else {
        setScriptContent('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/generation/script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scriptContent,
          scriptId: selectedScriptId || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to generate');
      }

      const data = await res.json();
      router.push(`/replication/${data.id}`);
    } catch (error) {
      console.error('Error generating:', error);
      alert('Failed to generate. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 shadow-md rounded px-8 pt-6 pb-8 mb-4 border border-gray-100 dark:border-gray-700">
      {/* Optional Script Selection */}
      <div className="mb-4">
        <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2" htmlFor="script">
          {t.generation.selectScript}
        </label>
        <select
          id="script"
          className="shadow border dark:border-gray-600 rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          value={selectedScriptId}
          onChange={(e) => handleScriptChange(e.target.value)}
        >
          <option value="">-- {t.generation.selectScript} --</option>
          {scripts.map((script) => (
            <option key={script.id} value={script.id}>
              {script.title}
            </option>
          ))}
        </select>
        <p className="text-gray-500 dark:text-gray-400 text-xs italic mt-1">
          Selecting a script will pre-fill the script content if available.
        </p>
      </div>

      <div className="mb-6">
        <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2" htmlFor="scriptContent">
          {t.generation.scriptContent}
        </label>
        <textarea
          id="scriptContent"
          className="shadow appearance-none border dark:border-gray-600 rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 leading-tight focus:outline-none focus:shadow-outline h-48"
          placeholder={t.generation.enterContent}
          value={scriptContent}
          onChange={(e) => setScriptContent(e.target.value)}
          required
        />
      </div>

      <div className="flex items-center justify-between">
        <button
          className={`bg-brand-yellow hover:bg-yellow-400 text-black font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline ${
            loading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          type="submit"
          disabled={loading}
        >
          {loading ? t.generation.generating : t.generation.generate}
        </button>
      </div>
    </form>
  );
}
