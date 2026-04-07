import { View, Text, Picker, ScrollView } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { api, type DigitalHumanCharacter, type DigitalHumanMode } from '../../utils/api';
import './index.scss';

const MODES: { key: DigitalHumanMode; label: string; desc: string }[] = [
  { key: 'VOICE_CLONE', label: '文字驱动', desc: '输入脚本文字，AI 自动克隆音色并合成语音' },
  { key: 'LIP_SYNC', label: '音频驱动', desc: '上传已有音频，直接用于口型同步' },
];

export default function GeneratePage() {
  const [mode, setMode] = useState<DigitalHumanMode>('VOICE_CLONE');
  const [characters, setCharacters] = useState<DigitalHumanCharacter[]>([]);
  const [selectedCharIdx, setSelectedCharIdx] = useState(0);
  const [script, setScript] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useLoad(async () => {
    try {
      const data = await api.getDigitalHumans();
      setCharacters(data);
    } catch {
      Taro.showToast({ title: '加载形象失败', icon: 'none' });
    }
  });

  const selectedChar = characters[selectedCharIdx];

  const handleChooseAudio = async () => {
    const res = await Taro.chooseMessageFile({ count: 1, type: 'file', extension: ['mp3', 'wav', 'm4a', 'aac'] });
    const file = res.tempFiles[0];
    setUploadingAudio(true);
    try {
      const url = await api.uploadMedia(file.path, file.name, 'audio/mpeg');
      setAudioUrl(url);
    } catch {
      Taro.showToast({ title: '音频上传失败', icon: 'none' });
    } finally {
      setUploadingAudio(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedChar) {
      Taro.showToast({ title: '请先在形象库添加数字人', icon: 'none' });
      return;
    }
    if (!selectedChar.voiceUrl) {
      Taro.showToast({ title: '该形象未绑定音色', icon: 'none' });
      return;
    }
    if (mode === 'VOICE_CLONE' && !script.trim()) {
      Taro.showToast({ title: '请输入脚本内容', icon: 'none' });
      return;
    }
    if (mode === 'LIP_SYNC' && !audioUrl) {
      Taro.showToast({ title: '请上传驱动音频', icon: 'none' });
      return;
    }

    setSubmitting(true);
    try {
      await api.createDigitalHumanTask({
        type: mode,
        imageUrl: selectedChar.imageUrl,
        audioUrl: mode === 'LIP_SYNC' ? audioUrl : selectedChar.voiceUrl!,
        scriptContent: mode === 'VOICE_CLONE' ? script.trim() : undefined,
      });
      Taro.showToast({ title: '已提交生成任务', icon: 'success' });
      setScript('');
      setAudioUrl('');
    } catch (err) {
      Taro.showToast({ title: (err as Error).message || '提交失败', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView scrollY className='generate-page'>
      <View className='section'>
        <Text className='section-title'>选择数字人形象</Text>
        {characters.length === 0
          ? <Text className='empty-hint'>暂无形象，请先在「形象库」添加</Text>
          : (
            <Picker
              mode='selector'
              range={characters.map((c) => c.name)}
              value={selectedCharIdx}
              onChange={(e) => setSelectedCharIdx(Number(e.detail.value))}
            >
              <View className='picker-row'>
                <Text className='picker-value'>{selectedChar?.name ?? '请选择'}</Text>
                <Text className='picker-arrow'>›</Text>
              </View>
            </Picker>
          )
        }
      </View>

      <View className='section'>
        <Text className='section-title'>生成模式</Text>
        <View className='mode-tabs'>
          {MODES.map((m) => (
            <View
              key={m.key}
              className={`mode-tab ${mode === m.key ? 'mode-tab--active' : ''}`}
              onClick={() => setMode(m.key)}
            >
              <Text className='mode-tab-label'>{m.label}</Text>
            </View>
          ))}
        </View>
        <Text className='mode-desc'>{MODES.find((m) => m.key === mode)?.desc}</Text>
      </View>

      {mode === 'VOICE_CLONE' && (
        <View className='section'>
          <Text className='section-title'>脚本内容</Text>
          <textarea
            className='script-input'
            value={script}
            onInput={(e: any) => setScript(e.detail.value)}
            placeholder='在此输入你想让数字人说的文字...'
            maxlength={500}
          />
          <Text className='char-count'>{script.length}/500</Text>
        </View>
      )}

      {mode === 'LIP_SYNC' && (
        <View className='section'>
          <Text className='section-title'>驱动音频</Text>
          <View className='upload-row' onClick={handleChooseAudio}>
            <Text className='upload-row-text'>
              {audioUrl ? '✅ 已上传音频' : uploadingAudio ? '上传中...' : '点击选择音频文件'}
            </Text>
          </View>
        </View>
      )}

      <View className='submit-area'>
        <View
          className={`btn-primary ${submitting ? 'btn-disabled' : ''}`}
          onClick={handleSubmit}
        >
          <Text className='btn-text'>{submitting ? '提交中...' : '开始生成'}</Text>
        </View>
      </View>
    </ScrollView>
  );
}
