import { View, Text, ScrollView, Textarea } from '@tarojs/components';
import Taro, { useLoad, useUnload } from '@tarojs/taro';
import { useMemo, useRef, useState } from 'react';
import { miniappApi, type WritingStyleOption } from '../../utils/miniapp-api';
import './index.sass';

const SMART_COPY_STYLE_ID_KEY = 'SMART_COPY_STYLE_ID';
const WORD_COUNT_OPTIONS = [300, 600, 900, 1200] as const;

export default function SmartCopyPage() {
  const [ideaText, setIdeaText] = useState('');
  const [wordCountIndex, setWordCountIndex] = useState(1);
  const [styleOptions, setStyleOptions] = useState<WritingStyleOption[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState('');
  const [loadingStyles, setLoadingStyles] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitLockRef = useRef(false);

  useLoad(() => {
    void loadStyles();
  });

  useUnload(() => {
    submitLockRef.current = false;
  });

  const currentWordCount = WORD_COUNT_OPTIONS[wordCountIndex] || WORD_COUNT_OPTIONS[1];
  const selectedStyle = useMemo(
    () => styleOptions.find((item) => item.id === selectedStyleId) || null,
    [selectedStyleId, styleOptions],
  );

  const loadStyles = async () => {
    if (loadingStyles) return;
    setLoadingStyles(true);
    try {
      const rows = await miniappApi.listWritingStyles(50);
      setStyleOptions(rows);
      if (rows.length === 0) {
        setSelectedStyleId('');
        return;
      }
      const savedStyleId = String(Taro.getStorageSync(SMART_COPY_STYLE_ID_KEY) || '').trim();
      const matched = rows.find((item) => item.id === savedStyleId) || rows[0];
      setSelectedStyleId(matched.id);
      Taro.setStorageSync(SMART_COPY_STYLE_ID_KEY, matched.id);
    } catch {
      Taro.showToast({ title: '写作风格加载失败', icon: 'none' });
    } finally {
      setLoadingStyles(false);
    }
  };

  const handleBack = () => {
    const pages = Taro.getCurrentPages();
    if (pages.length > 1) {
      Taro.navigateBack({ delta: 1 });
      return;
    }
    Taro.switchTab({ url: '/pages/home/index' });
  };

  const handlePaste = async () => {
    try {
      const clip = await Taro.getClipboardData();
      const text = String(clip.data || '').trim();
      if (!text) {
        Taro.showToast({ title: '剪贴板为空', icon: 'none' });
        return;
      }
      setIdeaText((prev) => (prev ? `${prev}\n${text}` : text));
      Taro.showToast({ title: '已粘贴', icon: 'success' });
    } catch {
      Taro.showToast({ title: '粘贴失败', icon: 'none' });
    }
  };

  const handleCreate = async () => {
    if (submitLockRef.current || submitting) return;
    if (!ideaText.trim()) {
      Taro.showToast({ title: '请输入创作提示', icon: 'none' });
      return;
    }
    if (!selectedStyleId) {
      Taro.showToast({ title: '请先选择写作风格', icon: 'none' });
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const styleProfile = await miniappApi.getWritingStyleProfile(selectedStyleId);
      await miniappApi.createSmartCopyTask({
        ideaText: ideaText.trim(),
        title: ideaText.trim().slice(0, 32) || '智能文案',
        wordCount: currentWordCount,
        styleRules: styleProfile?.profileJson || null,
        targetOutput: '智能文案',
      });
      Taro.showToast({ title: '已提交，去作品页查看', icon: 'none' });
      setIdeaText('');
      Taro.switchTab({ url: '/pages/works/index' });
    } catch (error) {
      if (isUnconfirmedSubmitError(error)) {
        Taro.showToast({ title: '已提交，去作品页查看', icon: 'none' });
        setIdeaText('');
        Taro.switchTab({ url: '/pages/works/index' });
        return;
      }
      Taro.showToast({ title: error instanceof Error ? error.message : '提交失败', icon: 'none' });
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <View className='smart-copy-page'>
      <View className='smart-copy-header'>
        <View className='smart-copy-topbar'>
          <View className='smart-copy-back' onClick={handleBack}>
            <Text className='smart-copy-back-text'>‹</Text>
          </View>
          <Text className='smart-copy-title'>智能文案</Text>
        </View>
      </View>

      <ScrollView scrollY className='smart-copy-scroll'>
        <View className='smart-copy-body'>
          <View className='smart-copy-section'>
            <View className='smart-copy-section-head'>
              <Text className='smart-copy-section-title'>写作风格</Text>
              <Text className='smart-copy-section-subtitle'>{loadingStyles ? '加载中' : selectedStyle?.name || '未选择'}</Text>
            </View>
            <ScrollView scrollX className='smart-copy-style-scroll'>
              <View className='smart-copy-style-list'>
                {styleOptions.map((item) => (
                  <View
                    key={item.id}
                    className={`smart-copy-style-chip ${selectedStyleId === item.id ? 'smart-copy-style-chip--active' : ''}`}
                    onClick={() => {
                      setSelectedStyleId(item.id);
                      Taro.setStorageSync(SMART_COPY_STYLE_ID_KEY, item.id);
                    }}
                  >
                    <Text className='smart-copy-style-chip-text'>{item.name}</Text>
                  </View>
                ))}
                {styleOptions.length === 0 && (
                  <View className='smart-copy-style-empty'>
                    <Text className='smart-copy-style-empty-text'>先在 Web 端创建写作风格</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>

          <View className='smart-copy-input-section'>
            <View className='smart-copy-composer-head'>
              <Text className='smart-copy-composer-title'>生成文案</Text>
              <View className='smart-copy-word-count-row'>
                {WORD_COUNT_OPTIONS.map((count, index) => (
                  <View
                    key={count}
                    className={`smart-copy-word-count-chip ${wordCountIndex === index ? 'smart-copy-word-count-chip--active' : ''}`}
                    onClick={() => setWordCountIndex(index)}
                  >
                    <Text className='smart-copy-word-count-chip-text'>{count}字</Text>
                  </View>
                ))}
              </View>
            </View>

            <Textarea
              className='smart-copy-textarea'
              value={ideaText}
              maxlength={2000}
              autoHeight={false}
              adjustPosition
              cursorSpacing={28}
              placeholder='描述你的想法'
              onInput={(event) => setIdeaText(event.detail.value)}
            />

            <View className='smart-copy-input-footer'>
              <Text className='smart-copy-count'>{ideaText.length}/2000</Text>
              <View className='smart-copy-ghost-btn' onClick={handlePaste}>
                <Text className='smart-copy-ghost-btn-text'>粘贴</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      <View className='smart-copy-fixed-submit'>
        <View className={`smart-copy-submit ${submitting ? 'smart-copy-submit--disabled' : ''}`} onClick={handleCreate}>
          <Text className='smart-copy-submit-text'>{submitting ? '提交中...' : '生成文案'}</Text>
        </View>
      </View>
    </View>
  );
}

function isUnconfirmedSubmitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /timeout|timed\s*out|request:fail|network|socket|abort|interrupted|exceed/i.test(message);
}
