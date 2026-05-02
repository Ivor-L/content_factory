import { View, Text, Image, ScrollView } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { api } from '../../utils/api';
import './index.sass';

export default function WarehousePage() {
  const [humans, setHumans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newVoiceUrl, setNewVoiceUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const [recording, setRecording] = useState(false);

  const recorderManager = Taro.getRecorderManager ? Taro.getRecorderManager() : null;

  const fetchHumans = async () => {
    setLoading(true);
    try {
      const data = await api.getDigitalHumans();
      setHumans(data);
      setError(null);
    } catch {
      setError('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useLoad(() => { void fetchHumans(); });

  const handleDelete = (id) => {
    Taro.showModal({
      title: '确认删除',
      content: '确定删除此数字人吗？',
      success: async ({ confirm }) => {
        if (!confirm) return;
        await api.deleteDigitalHuman(id);
        void fetchHumans();
      },
    });
  };

  const handleChooseImage = async () => {
    const res = await Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
    const filePath = res.tempFilePaths[0];
    setUploadingImage(true);
    try {
      const url = await api.uploadMedia(filePath, 'image.jpg', 'image/jpeg');
      setNewImageUrl(url);
    } catch {
      Taro.showToast({ title: '图片上传失败', icon: 'none' });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleChooseAudio = async () => {
    const res = await Taro.chooseMessageFile({ count: 1, type: 'file', extension: ['mp3', 'wav', 'm4a', 'aac'] });
    const file = res.tempFiles[0];
    setUploadingVoice(true);
    try {
      const url = await api.uploadMedia(file.path, file.name, 'audio/mpeg');
      setNewVoiceUrl(url);
    } catch {
      Taro.showToast({ title: '音频上传失败', icon: 'none' });
    } finally {
      setUploadingVoice(false);
    }
  };

  const handleStartRecord = () => {
    if (!recorderManager) return;
    recorderManager.onStop(async (res) => {
      setUploadingVoice(true);
      try {
        const url = await api.uploadMedia(res.tempFilePath, 'record.m4a', 'audio/mp4');
        setNewVoiceUrl(url);
      } catch {
        Taro.showToast({ title: '录音上传失败', icon: 'none' });
      } finally {
        setUploadingVoice(false);
        setRecording(false);
      }
    });
    recorderManager.start({ duration: 60000, format: 'm4a' });
    setRecording(true);
  };

  const handleStopRecord = () => {
    recorderManager?.stop();
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newImageUrl || !newVoiceUrl) {
      Taro.showToast({ title: '请完善名称、形象和音色', icon: 'none' });
      return;
    }
    setSubmitting(true);
    try {
      await api.addDigitalHuman({ name: newName.trim(), imageUrl: newImageUrl, voiceUrl: newVoiceUrl });
      setModalOpen(false);
      setNewName(''); setNewImageUrl(''); setNewVoiceUrl('');
      void fetchHumans();
    } catch {
      Taro.showToast({ title: '创建失败', icon: 'none' });
    } finally {
      setSubmitting(false);
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

  return (
    <View className='warehouse-page'>
      <View className='warehouse-topbar'>
        <View className='warehouse-back' onClick={handleBack}>
          <Text className='warehouse-back-text'>‹</Text>
        </View>
      </View>
      <ScrollView scrollY className='warehouse-scroll'>
        {loading && <Text className='loading-text'>加载中...</Text>}
        {error && <Text className='error-text'>{error}</Text>}
        {!loading && !error && (
          <View className='warehouse-content'>
            <View className='add-btn' onClick={() => setModalOpen(true)}>
              <Text className='add-btn-text'>+ 创建新数字人</Text>
            </View>
            <View className='human-grid'>
              {humans.map((item) => (
                <View key={item.id} className='human-card'>
                  <Image className='human-avatar' src={item.imageUrl} mode='aspectFill' />
                  <View className='human-info'>
                    <Text className='human-name'>{item.name}</Text>
                    <Text className='human-voice'>{item.voiceUrl ? '已绑定音色' : '未绑定音色'}</Text>
                  </View>
                  <View className='human-delete' onClick={() => handleDelete(item.id)}>
                    <Text className='human-delete-icon'>🗑️</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {modalOpen && (
        <View className='modal-overlay'>
          <View className='modal-card'>
            <Text className='modal-title'>创建新数字人</Text>

            <Text className='field-label'>名称</Text>
            <input
              className='field-input'
              value={newName}
              onInput={(e) => setNewName(e.detail.value)}
              placeholder='给数字人起个名字'
            />

            <Text className='field-label'>形象图片</Text>
            <View className='upload-area' onClick={handleChooseImage}>
              {newImageUrl
                ? <Image className='upload-preview' src={newImageUrl} mode='aspectFill' />
                : <Text className='upload-hint'>{uploadingImage ? '上传中...' : '点击选择图片'}</Text>
              }
            </View>

            <Text className='field-label'>绑定音色</Text>
            <View className='voice-actions'>
              <View className='voice-btn' onClick={handleChooseAudio}>
                <Text>{uploadingVoice ? '上传中...' : '选择音频文件'}</Text>
              </View>
              <View
                className={`voice-btn ${recording ? 'voice-btn--recording' : ''}`}
                onClick={recording ? handleStopRecord : handleStartRecord}
              >
                <Text>{recording ? '停止录音' : '点击录音'}</Text>
              </View>
            </View>
            {newVoiceUrl && <Text className='voice-set-hint'>✅ 音色已设置</Text>}

            <View className='modal-actions'>
              <View className='modal-cancel' onClick={() => setModalOpen(false)}>
                <Text>取消</Text>
              </View>
              <View className={`modal-confirm ${submitting ? 'modal-confirm--disabled' : ''}`} onClick={handleCreate}>
                <Text>{submitting ? '创建中...' : '确认创建'}</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
