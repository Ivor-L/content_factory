import React, { useState, useEffect, useRef } from 'react';
import { Upload, Mic, Users, Play, FileAudio, X, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { api, MissingApiKeyError, type DigitalHumanCharacter, type DigitalHumanMode } from '../utils/api';

export default function Generate() {
  const [mode, setMode] = useState<DigitalHumanMode>('VOICE_CLONE');
  const [humans, setHumans] = useState<DigitalHumanCharacter[]>([]);
  const [selectedHumanId, setSelectedHumanId] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [audioUploading, setAudioUploading] = useState(false);
  const [text, setText] = useState('');
  const [loadingHumans, setLoadingHumans] = useState(true);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const navigate = useNavigate();

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    let active = true;
    setLoadingHumans(true);
    api.getDigitalHumans()
      .then((data) => {
        if (!active) return;
        setHumans(data);
        if (data.length > 0) {
          setSelectedHumanId(data[0].id);
        }
      })
      .catch((error) => {
        console.error(error);
        alert('获取数字人失败，请稍后重试。');
      })
      .finally(() => {
        if (active) setLoadingHumans(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const getDuration = (source: File | string): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.preload = 'metadata';
      let url: string | null = null;

      if (source instanceof File) {
        url = URL.createObjectURL(source);
        audio.src = url;
      } else {
        audio.src = source;
        audio.crossOrigin = 'anonymous';
      }

      audio.onloadedmetadata = () => {
        if (url) URL.revokeObjectURL(url);
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        resolve(duration);
      };
      audio.onerror = () => {
        if (url) URL.revokeObjectURL(url);
        resolve(0);
      };
    });
  };

  const uploadAudioFile = async (file: File) => {
    setAudioUploading(true);
    try {
      const url = await api.uploadMedia(file);
      setAudioFile(file);
      setAudioUrl(url);
      const duration = await getDuration(file);
      setAudioDuration(duration);
    } catch (error) {
      console.error(error);
      alert('上传音频失败，请稍后重试。');
    } finally {
      setAudioUploading(false);
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      void uploadAudioFile(e.target.files[0]);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const dateStr = new Date().toLocaleTimeString('zh-CN', { hour12: false }).replace(/:/g, '');
        const audioRecorded = new File([audioBlob], `录音_${dateStr}.webm`, { type: 'audio/webm' });
        void uploadAudioFile(audioRecorded);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('无法访问麦克风，请检查权限设置。');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const selectedHuman = humans.find((human) => human.id === selectedHumanId) || null;
  const voiceReady =
    mode === 'LIP_SYNC'
      ? Boolean(audioUrl)
      : Boolean(selectedHuman?.voiceUrl);
  const textReady = mode === 'VOICE_CLONE' ? text.trim().length > 0 : true;
  const isFormValid = Boolean(selectedHuman && voiceReady && textReady);

  const handleSubmit = async () => {
    if (!selectedHuman) {
      alert('请选择数字人形象。');
      return;
    }
    if (!isFormValid) {
      alert('请完善素材后再提交。');
      return;
    }

    const payload = {
      type: mode,
      imageUrl: selectedHuman.imageUrl,
      audioUrl: mode === 'LIP_SYNC' ? audioUrl : (selectedHuman.voiceUrl || ''),
      scriptContent: mode === 'VOICE_CLONE' ? text.trim() : undefined,
      durationSeconds: mode === 'LIP_SYNC' ? audioDuration : undefined,
    };

    setSubmitLoading(true);
    try {
      await api.createDigitalHumanTask(payload);
      alert('任务已提交，稍后可在生成记录中查看进度。');
      navigate('/records');
    } catch (error) {
      if (error instanceof MissingApiKeyError) {
        setApiKeyMissing(true);
        alert('请先在个人中心配置 API Key，才能提交生成任务。');
      } else {
        console.error(error);
        alert('提交失败，请稍后再试。');
      }
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className="space-y-6 py-2">
      {/* Mode Switcher */}
      <div className="flex p-1.5 bg-white/80 backdrop-blur-md rounded-full soft-shadow relative w-fit mx-auto mb-2">
        {['VOICE_CLONE', 'LIP_SYNC'].map((m) => (
          <button
            key={m}
            onClick={() => setMode(m as DigitalHumanMode)}
            className={`relative px-8 py-2.5 rounded-full text-sm font-bold transition-colors whitespace-nowrap z-10 ${mode === m ? 'text-white' : 'text-text-secondary hover:text-primary'}`}
          >
            {m === 'VOICE_CLONE' ? '文字驱动' : '音频驱动'}
            {mode === m && (
              <motion.div
                layoutId="activeModeTab"
                className="absolute inset-0 bg-primary rounded-full -z-10"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>

      {apiKeyMissing && (
        <div className="bg-amber-50 text-amber-700 border border-amber-200 rounded-2xl px-4 py-3 text-sm flex items-center gap-2">
          <AlertTriangle size={16} />
          请先在个人中心配置租户 API Key，才能触发后台生成。
        </div>
      )}

      {/* Digital Human Selection */}
      <div className="bg-white rounded-[2rem] p-5 soft-shadow space-y-4">
        <label className="text-sm font-bold text-primary flex items-center gap-2">
          <Users size={18} /> 选择数字人
        </label>

        {loadingHumans ? (
          <div className="text-center py-4 text-text-secondary text-sm">加载中...</div>
        ) : humans.length === 0 ? (
          <div className="text-center py-4 text-text-secondary text-sm">暂无数字人，请先前往创建</div>
        ) : (
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 pt-2 px-1">
            {humans.map((human) => (
              <button
                key={human.id}
                onClick={() => setSelectedHumanId(human.id)}
                className={`relative shrink-0 w-[88px] flex flex-col items-center gap-2 transition-transform ${selectedHumanId === human.id ? 'scale-105' : 'opacity-70 hover:opacity-100'}`}
              >
                <div className={`w-[88px] h-[88px] rounded-2xl overflow-hidden p-1 transition-colors ${selectedHumanId === human.id ? 'bg-primary' : 'bg-secondary'}`}>
                  <img src={human.imageUrl} alt={human.name} className="w-full h-full object-cover rounded-xl" />
                </div>
                <span className={`text-xs font-bold truncate w-full text-center ${selectedHumanId === human.id ? 'text-primary' : 'text-text-secondary'}`}>
                  {human.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Audio/Text Input based on mode */}
      <div className="bg-white rounded-[2rem] p-5 soft-shadow overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            initial={{ opacity: 0, x: mode === 'LIP_SYNC' ? 20 : -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: mode === 'LIP_SYNC' ? -20 : 20 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="space-y-4"
          >
            {mode === 'LIP_SYNC' ? (
              <>
                <label className="text-sm font-bold text-primary flex items-center gap-2">
                  <Mic size={18} /> 驱动音频 (上传或录音)
                </label>

                {audioFile ? (
                  <div className="flex items-center justify-between p-4 bg-secondary rounded-xl">
                    <div className="flex items-center gap-3 text-primary font-medium">
                      <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center soft-shadow shrink-0">
                        <FileAudio size={18} />
                      </div>
                      <span className="text-sm truncate max-w-[200px]">{audioFile.name}</span>
                    </div>
                    <button
                      onClick={() => {
                        setAudioFile(null);
                        setAudioUrl('');
                        setAudioDuration(0);
                      }}
                      className="text-text-secondary hover:text-red-500 p-2"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : isRecording ? (
                  <div className="flex items-center justify-between p-4 bg-red-50 rounded-xl border border-red-100">
                    <div className="flex items-center gap-2 text-red-500 font-medium">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-sm">录音中...</span>
                    </div>
                    <button
                      onClick={stopRecording}
                      className="px-4 py-1.5 bg-red-500 text-white text-sm font-bold rounded-full hover:bg-red-600 transition-colors"
                    >
                      停止录音
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col items-center justify-center gap-2 p-6 bg-secondary rounded-2xl cursor-pointer hover:opacity-90 transition-opacity text-center group">
                      <input type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} />
                      <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-1 soft-shadow group-hover:scale-105 transition-transform">
                        <Upload size={20} className="text-primary" />
                      </div>
                      <span className="text-sm font-medium text-text-secondary group-hover:text-primary transition-colors">
                        {audioUploading ? '上传中...' : '上传音频'}
                      </span>
                    </label>
                    <button
                      onClick={startRecording}
                      className="flex flex-col items-center justify-center gap-2 p-6 bg-secondary rounded-2xl cursor-pointer hover:opacity-90 transition-opacity text-center group"
                    >
                      <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-1 soft-shadow group-hover:scale-105 transition-transform">
                        <Mic size={20} className="text-primary" />
                      </div>
                      <span className="text-sm font-medium text-text-secondary group-hover:text-primary transition-colors">点击录音</span>
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <label className="text-sm font-bold text-primary flex items-center gap-2">
                  <Mic size={18} /> 驱动文案
                </label>
                <div className="relative">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="请输入要让数字人说的文案..."
                    className="w-full h-32 bg-secondary rounded-2xl p-4 text-sm text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none transition-all"
                    maxLength={500}
                  />
                  <span className="absolute bottom-3 right-4 text-xs font-medium text-text-secondary">
                    {text.length}/500
                  </span>
                </div>

                {selectedHuman && (
                  <div className="flex items-center gap-2 text-xs font-medium text-text-secondary bg-secondary p-3 rounded-xl">
                    <Mic size={14} className="text-primary" />
                    <span>
                      将使用 <strong className="text-primary">{selectedHuman.voiceUrl ? '已绑定音色' : '未绑定音色'}</strong> 进行合成
                    </span>
                  </div>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Submit Button */}
      <button
        disabled={!isFormValid || submitLoading}
        onClick={() => void handleSubmit()}
        className={`w-full py-4 rounded-full font-bold text-white flex items-center justify-center gap-2 transition-all ${
          isFormValid && !submitLoading
            ? 'bg-primary soft-shadow hover:scale-[1.02] active:scale-[0.98]'
            : 'bg-secondary text-text-secondary cursor-not-allowed'
        }`}
      >
        {submitLoading ? <Mic size={20} className="animate-spin" /> : <Play size={20} fill="currentColor" />}
        {submitLoading ? '提交中...' : '开始生成'}
      </button>
    </div>
  );
}
