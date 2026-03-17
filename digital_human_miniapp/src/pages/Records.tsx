import React, { useState, useEffect } from 'react';
import { RefreshCw, PlayCircle, AlertCircle, Clock, Camera } from 'lucide-react';
import { api, MissingApiKeyError, type DigitalHumanVideoRecord } from '../utils/api';

type FilterKey = 'all' | 'processing' | 'success' | 'failed';

function resolveCategory(status: string) {
  const normalized = (status || '').toUpperCase();
  if (normalized.includes('FAIL')) return 'failed';
  if (normalized.includes('SUCCESS') || normalized.includes('COMPLETE')) return 'success';
  return 'processing';
}

const STATUS_LABEL: Record<FilterKey, string> = {
  all: '全部',
  processing: '处理中',
  success: '成功',
  failed: '失败',
};

export default function Records() {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [records, setRecords] = useState<DigitalHumanVideoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const data = await api.getRecords();
      setRecords(data);
      setApiKeyMissing(false);
    } catch (error) {
      if (error instanceof MissingApiKeyError) {
        setApiKeyMissing(true);
      } else {
        console.error(error);
        alert('获取记录失败，请稍后重试。');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRecords();
  }, []);

  const filteredRecords = records.filter((record) => {
    const category = resolveCategory(record.status);
    return filter === 'all' || category === filter;
  });

  const getStatusIcon = (status: string) => {
    const category = resolveCategory(status);
    if (category === 'success') return <PlayCircle size={16} className="text-green-500" />;
    if (category === 'failed') return <AlertCircle size={16} className="text-red-500" />;
    return <Clock size={16} className="text-orange-500 animate-pulse" />;
  };

  const getStatusText = (status: string) => {
    const category = resolveCategory(status);
    if (category === 'success') return '生成成功';
    if (category === 'failed') return '生成失败';
    return '排队/渲染中';
  };

  return (
    <div className="space-y-6 py-2">
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {(['all', 'processing', 'success', 'failed'] as FilterKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-5 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
              filter === key ? 'bg-primary text-white' : 'bg-white text-text-secondary soft-shadow'
            }`}
          >
            {STATUS_LABEL[key]}
          </button>
        ))}
      </div>

      {apiKeyMissing && (
        <div className="bg-amber-50 text-amber-700 border border-amber-200 rounded-2xl px-4 py-3 text-sm">
          请先在「个人中心」中绑定 API Key 才能查看云端生成记录。
        </div>
      )}

      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-10 text-text-secondary font-medium">加载中...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="text-center py-10 text-text-secondary font-medium">暂无记录</div>
        ) : (
          filteredRecords.map((record) => (
            <div
              key={record.id}
              className="bg-white rounded-[1.5rem] p-4 soft-shadow flex gap-4 hover:scale-[1.01] transition-transform"
            >
              <div className="w-20 h-20 rounded-xl bg-secondary overflow-hidden shrink-0 p-1 flex items-center justify-center">
                {record.imageUrl ? (
                  <img src={record.imageUrl} alt={record.type} className="w-full h-full object-cover rounded-lg" />
                ) : (
                  <Camera size={24} className="text-text-secondary" />
                )}
              </div>
              <div className="flex-1 flex flex-col justify-between py-1">
                <div>
                  <h3 className="text-sm font-bold text-primary line-clamp-1">
                    {record.scriptContent?.slice(0, 40) || (record.type === 'LIP_SYNC' ? '音频驱动任务' : '文字驱动任务')}
                  </h3>
                  <p className="text-xs text-text-secondary font-medium mt-1">
                    {record.type === 'LIP_SYNC' ? '音频驱动' : '文字驱动'}
                  </p>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    {getStatusIcon(record.status)}
                    <span
                      className={
                        resolveCategory(record.status) === 'success'
                          ? 'text-green-600'
                          : resolveCategory(record.status) === 'failed'
                            ? 'text-red-600'
                            : 'text-orange-600'
                      }
                    >
                      {getStatusText(record.status)}
                    </span>
                  </div>
                  <span className="text-[10px] font-medium text-text-secondary">
                    {new Date(record.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="fixed bottom-28 w-full max-w-[480px] pointer-events-none flex justify-end px-6 z-10">
        <button
          onClick={() => void fetchRecords()}
          className="w-12 h-12 bg-primary rounded-full soft-shadow flex items-center justify-center text-white hover:bg-black/80 transition-colors active:scale-95 pointer-events-auto"
        >
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  );
}
