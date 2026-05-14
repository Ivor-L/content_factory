import { View, Text, Image, ScrollView } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useEffect, useRef, useState } from 'react';
import { api, reportClientLog } from '../../utils/api';
import { useMiniappShare } from '../../utils/miniapp-share';
import audioUploadIcon from '../../assets/icons/warehouse-audio-upload.svg';
import recordIcon from '../../assets/icons/warehouse-record.svg';
import trashIcon from '../../assets/icons/warehouse-trash.svg';
import './index.sass';

const RECORD_PERMISSION_SCOPE = 'scope.record';
const RECORD_FILE_EXT = 'aac';
const RECORD_MIME_TYPE = 'audio/aac';

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'errMsg' in error) {
    return String((error as { errMsg?: unknown }).errMsg || '');
  }
  if (error instanceof Error) return error.message;
  return String(error || '');
}

function getRecordToast(error: unknown): string {
  const message = getErrorMessage(error).toLowerCase();
  if (/auth|authorize|permission|scope\.record|deny|denied/.test(message)) {
    return '请先允许麦克风权限';
  }
  if (/interrupted|interrupt/.test(message)) return '录音被中断，请重试';
  return '录音失败，请重试';
}

export default function WarehousePage() {
  useMiniappShare();

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
  const [stoppingRecord, setStoppingRecord] = useState(false);
  const recorderManagerRef = useRef<ReturnType<typeof Taro.getRecorderManager> | null>(null);

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

  useEffect(() => {
    if (!Taro.getRecorderManager) return;

    const recorderManager = Taro.getRecorderManager();
    recorderManagerRef.current = recorderManager;

    const handleStop = async (res: Taro.RecorderManager.OnStopCallbackResult) => {
      setStoppingRecord(false);
      setRecording(false);
      if (!res.tempFilePath) {
        Taro.showToast({ title: '录音文件生成失败', icon: 'none' });
        void reportClientLog('miniapp_warehouse_record_empty_file', { result: res as unknown as Record<string, unknown> });
        return;
      }
      setUploadingVoice(true);
      try {
        const url = await api.uploadMedia(res.tempFilePath, `record-${Date.now()}.${RECORD_FILE_EXT}`, RECORD_MIME_TYPE);
        setNewVoiceUrl(url);
      } catch (error) {
        void reportClientLog('miniapp_warehouse_record_upload_failed', {
          tempFilePath: res.tempFilePath,
          error: { message: getErrorMessage(error) },
        });
        Taro.showToast({ title: '录音上传失败', icon: 'none' });
      } finally {
        setUploadingVoice(false);
      }
    };

    const handleError = (error: Taro.RecorderManager.OnErrorCallbackResult) => {
      setRecording(false);
      setStoppingRecord(false);
      setUploadingVoice(false);
      void reportClientLog('miniapp_warehouse_record_failed', {
        error: { errMsg: error?.errMsg || '' },
      });
      Taro.showToast({ title: getRecordToast(error), icon: 'none' });
    };

    recorderManager.onStop(handleStop);
    recorderManager.onError(handleError);

    return () => {
      recorderManager.offStop?.(handleStop);
      recorderManager.offError?.(handleError);
      recorderManagerRef.current = null;
    };
  }, []);

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

  const ensureRecordPermission = async (): Promise<boolean> => {
    try {
      const setting = await Taro.getSetting();
      if (setting.authSetting?.[RECORD_PERMISSION_SCOPE]) return true;

      if (setting.authSetting?.[RECORD_PERMISSION_SCOPE] === false) {
        const modal = await Taro.showModal({
          title: '需要麦克风权限',
          content: '请允许使用麦克风后再录制音色。',
          confirmText: '去设置',
        });
        if (!modal.confirm) return false;
        const next = await Taro.openSetting();
        return Boolean(next.authSetting?.[RECORD_PERMISSION_SCOPE]);
      }

      await Taro.authorize({ scope: RECORD_PERMISSION_SCOPE });
      return true;
    } catch (error) {
      void reportClientLog('miniapp_warehouse_record_permission_failed', {
        error: { message: getErrorMessage(error) },
      });
      Taro.showToast({ title: getRecordToast(error), icon: 'none' });
      return false;
    }
  };

  const handleStartRecord = async () => {
    const recorderManager = recorderManagerRef.current;
    if (recording || stoppingRecord || uploadingVoice) return;
    if (!recorderManager) {
      Taro.showToast({ title: '当前环境不支持录音', icon: 'none' });
      return;
    }
    const hasPermission = await ensureRecordPermission();
    if (!hasPermission) return;

    setRecording(true);
    setStoppingRecord(false);
    try {
      recorderManager.start({
        duration: 60000,
        format: RECORD_FILE_EXT,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
      });
    } catch (error) {
      setRecording(false);
      void reportClientLog('miniapp_warehouse_record_start_failed', {
        error: { message: getErrorMessage(error) },
      });
      Taro.showToast({ title: '录音启动失败', icon: 'none' });
    }
  };

  const handleStopRecord = () => {
    if (!recording || stoppingRecord) return;
    setStoppingRecord(true);
    try {
      recorderManagerRef.current?.stop();
    } catch {
      setRecording(false);
      setStoppingRecord(false);
      Taro.showToast({ title: '停止录音失败', icon: 'none' });
    }
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
        <Text className='warehouse-title'>角色库</Text>
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
                    <Image className='human-delete-icon' src={trashIcon} mode='aspectFit' />
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
                ? <Image className='upload-preview' src={newImageUrl} mode='aspectFit' />
                : <Text className='upload-hint'>{uploadingImage ? '上传中...' : '点击选择图片'}</Text>
              }
            </View>

            <Text className='field-label'>绑定音色</Text>
            <View className='voice-actions'>
              <View className='voice-btn' onClick={handleChooseAudio}>
                <Image className='voice-btn-icon' src={audioUploadIcon} mode='aspectFit' />
                <Text>{uploadingVoice ? '上传中...' : '选择音频文件'}</Text>
              </View>
              <View
                className={`voice-btn ${recording ? 'voice-btn--recording' : ''}`}
                onClick={recording ? handleStopRecord : handleStartRecord}
              >
                <Image className='voice-btn-icon' src={recordIcon} mode='aspectFit' />
                <Text>{stoppingRecord ? '处理中...' : recording ? '停止录音' : '点击录音'}</Text>
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
