'use client';

import { Camera, Smile, PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type GuideSection = {
  title?: string;
  description?: string;
};

export type CharacterEmptyGuideCopy = {
  title?: string;
  tipIntro?: string;
  tipDescription?: string;
  tip1?: GuideSection;
  tip2?: GuideSection;
  cta?: string;
  note?: string;
  videoLabel?: string;
  videoTagline?: string;
};

const DEFAULT_COPY: Required<
  Omit<CharacterEmptyGuideCopy, 'tip1' | 'tip2'>
> & { tip1: Required<GuideSection>; tip2: Required<GuideSection> } = {
  title: '使用全球顶尖数字人模型，生成原生感十足的数字人营销视频',
  tipIntro: '图片建议',
  tipDescription: '根据以下两条提示拍摄或选择素材，数字人效果会更自然可信。',
  tip1: {
    title: '1、真实后置摄像头拍摄更有原生感',
    description:
      '使用手机后摄或单反拍摄，保留自然光线与肤质细节，模型更容易还原本真的质感。',
  },
  tip2: {
    title: '2、露出全脸，建议露出牙齿更真实',
    description:
      '让五官、嘴型和微笑完整呈现，便于系统拟合口型与表情，同步更准确。',
  },
  cta: '立即使用',
  note: '参考示例素材，30 秒即可生成首条数字人营销视频',
  videoLabel: '成片示例 · 30s',
  videoTagline: '双语字幕',
};

interface CharacterEmptyGuideProps {
  copy?: CharacterEmptyGuideCopy | null;
  onCtaClick: () => void;
  className?: string;
}

export function CharacterEmptyGuide({
  copy,
  onCtaClick,
  className,
}: CharacterEmptyGuideProps) {
  const resolved = {
    title: copy?.title ?? DEFAULT_COPY.title,
    tipIntro: copy?.tipIntro ?? DEFAULT_COPY.tipIntro,
    tipDescription: copy?.tipDescription ?? DEFAULT_COPY.tipDescription,
    tip1: {
      title: copy?.tip1?.title ?? DEFAULT_COPY.tip1.title,
      description: copy?.tip1?.description ?? DEFAULT_COPY.tip1.description,
    },
    tip2: {
      title: copy?.tip2?.title ?? DEFAULT_COPY.tip2.title,
      description: copy?.tip2?.description ?? DEFAULT_COPY.tip2.description,
    },
    cta: copy?.cta ?? DEFAULT_COPY.cta,
    note: copy?.note ?? DEFAULT_COPY.note,
    videoLabel: copy?.videoLabel ?? DEFAULT_COPY.videoLabel,
    videoTagline: copy?.videoTagline ?? DEFAULT_COPY.videoTagline,
  };

  return (
    <section className={cn('space-y-6', className)}>
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xl shadow-gray-900/5 overflow-hidden">
        <div className="p-6 md:p-8 space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white leading-snug">
              {resolved.title}
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
            <div className="relative rounded-2xl overflow-hidden bg-black shadow-lg h-64 md:h-72">
              <video
                className="h-full w-full object-cover"
                src="/logo/INF_00001_p82-audio_qcqju_1772640526.mp4"
                autoPlay
                loop
                muted
                playsInline
                controls
              />
              <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/30 to-transparent text-white text-xs flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold">
                  <PlayCircle size={18} />
                  <span>{resolved.videoLabel}</span>
                </div>
                <span className="px-3 py-1 rounded-full border border-white/40 text-[11px] uppercase tracking-wide">
                  {resolved.videoTagline}
                </span>
              </div>
            </div>

            <div className="rounded-3xl border border-gray-100 dark:border-gray-800 bg-gradient-to-b from-gray-50 via-white to-white dark:from-gray-900 dark:to-gray-950 p-6 flex flex-col gap-6">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {resolved.tipIntro}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {resolved.tipDescription}
                </p>
              </div>
              <div className="space-y-5">
                <div className="flex gap-3 items-start">
                  <div className="w-10 h-10 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 flex items-center justify-center text-gray-900 dark:text-white">
                    <Camera size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {resolved.tip1.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                      {resolved.tip1.description}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <div className="w-10 h-10 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 flex items-center justify-center text-gray-900 dark:text-white">
                    <Smile size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {resolved.tip2.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                      {resolved.tip2.description}
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-3 pt-2">
                <button
                  onClick={onCtaClick}
                  className="w-full py-3 rounded-2xl bg-black text-white dark:bg-white dark:text-black font-semibold text-sm tracking-wide shadow-lg shadow-black/10 dark:shadow-white/30 hover:opacity-90 transition-opacity"
                >
                  {resolved.cta}
                </button>
                <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                  {resolved.note}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
