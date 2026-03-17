import React, { useState, useEffect, useRef } from 'react';
import { Mic, Trash2, Plus, X, Upload, Loader2, PlayCircle, Sparkles, Camera, Smile } from 'lucide-react';
import { api, type DigitalHumanCharacter } from '../utils/api';
import demoVideo from '../assets/digital-human-demo.mp4';

export default function Warehouse() {
  const [humans, setHumans] = useState<DigitalHumanCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newImageUrl, setNewImageUrl] = useState<string | null>(null);
  const [newVoiceUrl, setNewVoiceUrl] = useState<string | null>(null);
  const [newAudioName, setNewAudioName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingVoice, setUploadingVoice] = useState(false);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const fetchHumans = async () => {
    setLoading(true);
    try {
      const data = await api.getDigitalHumans();
      setHumans(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('加载失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchHumans();
  }, []);

  const handleDelete = async (id: string) => {
    if (window.confirm('确定删除此数字人吗？')) {
      await api.deleteDigitalHuman(id);
      void fetchHumans();
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadingImage(true);
      try {
        const url = await api.uploadMedia(e.target.files[0]);
        setNewImageUrl(url);
      } catch (err) {
        console.error(err);
        alert('图片上传失败，请稍后重试。');
      } finally {
        setUploadingImage(false);
      }
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadingVoice(true);
      try {
        const file = e.target.files[0];
        const url = await api.uploadMedia(file);
        setNewVoiceUrl(url);
        setNewAudioName(file.name);
      } catch (err) {
        console.error(err);
        alert('音频上传失败，请稍后重试。');
      } finally {
        setUploadingVoice(false);
      }
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

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const dateStr = new Date().toLocaleTimeString('zh-CN', { hour12: false }).replace(/:/g, '');
        const audioRecorded = new File([audioBlob], `录音_${dateStr}.webm`, { type: 'audio/webm' });
        setUploadingVoice(true);
        try {
          const url = await api.uploadMedia(audioRecorded);
          setNewVoiceUrl(url);
          setNewAudioName(audioRecorded.name);
        } catch (err) {
          console.error(err);
          alert('录音上传失败，请稍后重试。');
        } finally {
          setUploadingVoice(false);
        }
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('无法访问麦克风，请检查权限设置。');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newImageUrl || !newVoiceUrl) {
      alert('请完善名称、形象和音色。');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.addDigitalHuman({
        name: newName.trim(),
        imageUrl: newImageUrl,
        voiceUrl: newVoiceUrl,
      });
      setIsModalOpen(false);
      setNewName('');
      setNewImageUrl(null);
      setNewVoiceUrl(null);
      setNewAudioName('');
      setIsRecording(false);
      await fetchHumans();
    } catch (err) {
      console.error(err);
      alert('保存失败，请稍后重试。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openCreationModal = () => setIsModalOpen(true);

  const renderContent = () => {
    if (loading) {
      return <div className="text-center py-10 text-text-secondary font-medium">加载中...</div>;
    }

    if (error) {
      return <div className="text-center py-10 text-text-secondary font-medium">{error}</div>;
    }

    if (humans.length === 0) {
      return (
        <section className="space-y-6 py-4">
          <div className="bg-white rounded-[2rem] p-6 md:p-10 soft-shadow space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-black text-white px-3 py-1 text-[11px] font-semibold tracking-[0.2em] uppercase">
                <Sparkles size={14} />
                首次指引
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-primary leading-snug">
                使用全球顶尖数字人模型，生成原生感十足的数字人营销视频
              </h1>
              <p className="text-sm md:text-base text-text-secondary leading-relaxed">
                你的数字人列表当前为空。先观看成片示例，再根据拍摄提示准备素材，就能一次通过生成流程。
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              <div className="relative rounded-[2rem] overflow-hidden bg-black shadow-2xl min-h-[260px]">
                <video
                  className="h-full w-full object-cover"
                  src={demoVideo}
                  autoPlay
                  loop
                  muted
                  playsInline
                  controls
                />
                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/30 to-transparent">
                  <div className="flex items-center justify-between text-white text-xs">
                    <div className="flex items-center gap-2 font-medium">
                      <PlayCircle size={18} />
                      <span>成片示例 · 30s</span>
                    </div>
                    <span className="px-3 py-1 rounded-full border border-white/40 text-[11px] uppercase tracking-wide">
                      双语字幕
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-[2rem] border border-gray-100 bg-gradient-to-b from-gray-50 to-white p-6 flex flex-col gap-6">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-primary">图片建议</p>
                  <p className="text-xs text-text-secondary">
                    根据以下两条提示拍摄或选择素材，数字人效果会更自然可信。
                  </p>
                </div>
                <div className="space-y-5">
                  <div className="flex gap-3 items-start">
                    <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-primary">
                      <Camera size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text-primary">1、真实后置摄像头拍摄更有原生感</p>
                      <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                        使用手机后摄或单反拍摄，保留自然光线与肤质细节，模型更容易还原本真的质感。
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 items-start">
                    <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-primary">
                      <Smile size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text-primary">2、露出全脸，建议露出牙齿更真实</p>
                      <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                        让五官、嘴型和微笑完整呈现，便于系统拟合口型与表情，同步更准确。
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3 pt-2">
                  <button
                    onClick={openCreationModal}
                    className="w-full py-3 rounded-2xl bg-black text-white font-semibold text-sm tracking-wide shadow-lg shadow-black/10 hover:opacity-90 transition-opacity"
                  >
                    立即使用
                  </button>
                  <p className="text-xs text-center text-text-secondary">
                    参考示例素材，30 秒即可生成首条数字人营销视频
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      );
    }

    return (
      <>
        <button
          onClick={openCreationModal}
          className="w-full py-4 bg-white rounded-[2rem] text-primary font-bold soft-shadow hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
        >
          <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center">
            <Plus size={16} />
          </div>
          创建新数字人
        </button>

        <div className="grid grid-cols-2 gap-4">
          {humans.map((item) => (
            <div key={item.id} className="bg-white rounded-[1.5rem] overflow-hidden soft-shadow group relative flex flex-col">
              <div className="aspect-square bg-secondary relative p-2">
                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover rounded-xl" />
              </div>
              <div className="p-4">
                <h3 className="font-bold text-primary text-sm truncate mb-1">{item.name}</h3>
                <div className="flex items-center gap-1 text-xs text-text-secondary font-medium">
                  <Mic size={12} />
                  <span className="truncate">{item.voiceUrl ? '已绑定音色' : '未绑定音色'}</span>
                </div>
              </div>
              <button
                onClick={() => void handleDelete(item.id)}
                className="absolute top-3 right-3 w-8 h-8 bg-white/90 backdrop-blur rounded-full text-text-secondary hover:text-red-500 flex items-center justify-center soft-shadow opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </>
    );
  };

  return (
    <div className="space-y-6 py-2">
      {renderContent()}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] p-6 w-full max-w-md soft-shadow relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-text-secondary hover:text-primary bg-secondary rounded-full transition-colors"
            >
              <X size={18} />
            </button>

            <h2 className="text-xl font-bold text-primary mb-6">创建新数字人</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-primary mb-2">名称</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="给数字人起个名字"
                  className="w-full bg-secondary rounded-xl p-4 text-sm text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-primary mb-2">形象图片</label>
                <label className="block w-full aspect-video bg-secondary rounded-xl overflow-hidden cursor-pointer hover:opacity-90 transition-opacity relative group">
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  {newImageUrl ? (
                    <img src={newImageUrl} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-text-secondary">
                      {uploadingImage ? (
                        <Loader2 size={20} className="animate-spin mb-2 text-primary" />
                      ) : (
                        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center mb-2 soft-shadow">
                          <Upload size={18} className="text-primary" />
                        </div>
                      )}
                      <span className="text-xs font-medium">{uploadingImage ? '上传中...' : '点击上传图片'}</span>
                    </div>
                  )}
                </label>
              </div>

              <div>
                <label className="block text-sm font-bold text-primary mb-2">绑定音色 (上传或录音)</label>

                {newAudioName ? (
                  <div className="flex items-center justify-between p-4 bg-secondary rounded-xl">
                    <div className="flex items-center gap-2 text-primary font-medium">
                      <Mic size={16} />
                      <span className="text-sm truncate max-w-[200px]">{newAudioName}</span>
                    </div>
                    <button
                      onClick={() => {
                        setNewAudioName('');
                        setNewVoiceUrl(null);
                      }}
                      className="text-text-secondary hover:text-red-500"
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
                    <label className="flex flex-col items-center justify-center gap-2 p-4 bg-secondary rounded-xl cursor-pointer hover:opacity-90 transition-opacity text-center group">
                      <input type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} />
                      {uploadingVoice ? (
                        <Loader2 size={18} className="animate-spin text-primary" />
                      ) : (
                        <Upload size={20} className="text-text-secondary group-hover:text-primary transition-colors" />
                      )}
                      <span className="text-sm font-medium text-text-secondary group-hover:text-primary transition-colors">
                        {uploadingVoice ? '上传中...' : '上传音频'}
                      </span>
                    </label>
                    <button
                      onClick={startRecording}
                      className="flex flex-col items-center justify-center gap-2 p-4 bg-secondary rounded-xl cursor-pointer hover:opacity-90 transition-opacity text-center group"
                    >
                      <Mic size={20} className="text-text-secondary group-hover:text-primary transition-colors" />
                      <span className="text-sm font-medium text-text-secondary group-hover:text-primary transition-colors">点击录音</span>
                    </button>
                  </div>
                )}
              </div>

              <button
                disabled={!newName.trim() || !newImageUrl || !newVoiceUrl || isSubmitting}
                onClick={() => void handleCreate()}
                className={`w-full py-4 rounded-full font-bold text-white flex items-center justify-center gap-2 transition-all mt-6 ${
                  !newName.trim() || !newImageUrl || !newVoiceUrl || isSubmitting
                    ? 'bg-secondary text-text-secondary cursor-not-allowed'
                    : 'bg-primary soft-shadow hover:scale-[1.02] active:scale-[0.98]'
                }`}
              >
                {isSubmitting ? '创建中...' : '确认创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
