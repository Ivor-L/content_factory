import 'dotenv/config';
import prisma from '../../lib/prisma';
import { Prisma } from '@prisma/client';

async function main() {
  const storyboardStructure: Prisma.JsonObject = {
    shots: [
      {
        shot_index: 1,
        title: '远景 · 城墙外',
        story_beat: '暮色下俯瞰整座城池，军队集结待命',
        prompt_text:
          '【景别】远景\n【镜头角度】水平向上 · 正面 · 垂直俯视\n【画面】城墙之上飘扬的旌旗配合低饱和暖色天空，烟尘在远处蒸腾',
        time_range: '00:00-00:08',
        duration: 8,
        voiceover: '暮色拉开序幕，城墙外的风声夹带着战歌。',
        image_url: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee',
        video_url: null,
      },
      {
        shot_index: 2,
        title: '中景 · 武将特写',
        story_beat: '主角回头确认队列，逆光下轮廓被点亮',
        prompt_text:
          '【景别】中景\n【镜头角度】水平向前45° · 垂直仰视\n【画面】夕阳穿透尘埃，铠甲反光强调层次',
        time_range: '00:08-00:16',
        duration: 8,
        voiceover: '他回身点头，所有人都准备好了。',
        image_url: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?fit=crop&w=800&q=80',
        video_url: null,
      },
      {
        shot_index: 3,
        title: '近景 · 口播收束',
        story_beat: '镜头贴近主角面部，口播拉高情绪',
        prompt_text:
          '【景别】近景\n【镜头角度】水平向前30° · 垂直平视\n【画面】背景火光摇曳，面部对比鲜明突出坚毅神情',
        time_range: '00:16-00:24',
        duration: 8,
        voiceover: '“这一次，我们只前进，不后退。”',
        image_url: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?fit=crop&w=800&q=80',
        video_url: null,
      },
    ],
  };

  const task = await prisma.storyboardTask.create({
    data: {
      status: 'COMPLETED',
      scenePrompt: '古风战役宣传片 · 夕阳逆光氛围',
      scriptContent: '暮色风起，主将回首确认全军，坚定宣告只前进不后退。',
      storyboardStructure,
      storyboardImages: {
        images: [
          'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?fit=crop&w=600&q=80',
          'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?fit=crop&w=600&q=80',
        ],
      } as Prisma.JsonObject,
      segments: {
        create: [
          {
            order: 1,
            duration: 8,
            timeRange: '00:00-00:08',
            imagePrompt:
              '远景描述城市外城墙与旌旗，暖色残阳配合薄雾，强调宏大场景',
            videoPrompt:
              'cinematic establishing shot of ancient city walls under sunset haze, sweeping camera move, volumetric light, dramatic scale',
            generatedImage: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?fit=crop&w=600&q=80',
            status: 'COMPLETED',
          },
          {
            order: 2,
            duration: 8,
            timeRange: '00:08-00:16',
            imagePrompt:
              '中景主角背对队伍回头，逆光突出铠甲材质，背景烟尘翻滚',
            videoPrompt:
              'hero medium shot, bronze armor glows under backlight, shallow depth of field, embers floating',
            generatedImage: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?fit=crop&w=600&q=80',
            status: 'COMPLETED',
          },
          {
            order: 3,
            duration: 8,
            timeRange: '00:16-00:24',
            imagePrompt:
              '近景紧贴面部，火光在脸颊和眼神中跳动，表现坚定情绪',
            videoPrompt:
              'intense close-up, hero face lit by flickering fire, cinematic lens flare, ultra-detailed skin texture',
            generatedImage: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?fit=crop&w=600&q=80',
            status: 'COMPLETED',
          },
        ],
      },
    },
  });

  console.log(`Created storyboard task ${task.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
