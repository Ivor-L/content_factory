'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Edit2, Check, Loader2, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import { emitProfileRefresh } from '@/lib/profileBus';
import { getProfileInitial } from '@/lib/profile';

export default function SettingsPage() {
  const { t } = useLanguage();
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isProfileEditing, setIsProfileEditing] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const profileSnapshotRef = useRef({ fullName: '', avatarUrl: '' });
  const profileFetchedRef = useRef(false);

  const previewAvatar = avatarUrl;
  
  const fetchProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const fallbackFullName =
          typeof user.user_metadata?.full_name === 'string'
            ? user.user_metadata.full_name
            : user.email?.split('@')[0] ?? '';
        const fallbackAvatar =
          typeof user.user_metadata?.avatar_url === 'string'
            ? user.user_metadata.avatar_url
            : '';

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('full_name, avatar_url')
          .eq('id', user.id)
          .maybeSingle();

        const setProfileState = (nameValue: string, avatarValue: string) => {
          setFullName(nameValue);
          setAvatarUrl(avatarValue);
          profileSnapshotRef.current = {
            fullName: nameValue,
            avatarUrl: avatarValue
          };
        };

        if (error) {
          console.error('Error fetching profile:', error);
          setProfileState(fallbackFullName, fallbackAvatar);
          setIsProfileEditing(true);
        } else if (profile) {
          const resolvedName = profile.full_name ?? fallbackFullName;
          const resolvedAvatar = profile.avatar_url ?? fallbackAvatar;
          setProfileState(resolvedName, resolvedAvatar);
          setIsProfileEditing(false);
        } else {
          setProfileState(fallbackFullName, fallbackAvatar);
          setIsProfileEditing(true);
        }
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setIsProfileEditing(true);
    }
  }, []);

  useEffect(() => {
    if (profileFetchedRef.current) return;
    profileFetchedRef.current = true;
    void fetchProfile();
  }, [fetchProfile]);

  const handleProfileSave = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      toast.error(t.settings.displayNameRequired ?? 'Please enter your name');
      return;
    }

    setProfileSaving(true);
    setAvatarError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        toast.error('Please login first');
        return;
      }

      const nextAvatar = avatarUrl || '';
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          full_name: trimmedName,
          avatar_url: nextAvatar,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      setAvatarUrl(nextAvatar);
      setFullName(trimmedName);
      profileSnapshotRef.current = {
        fullName: trimmedName,
        avatarUrl: nextAvatar
      };
      setIsProfileEditing(false);
      setProfileSaved(true);
      toast.success(t.settings.profileSaved ?? 'Profile updated!');
      emitProfileRefresh();
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error(t.settings.profileSaveFailed ?? 'Failed to save profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleAvatarUploadClick = () => {
    if (!isProfileEditing || avatarUploading) return;
    avatarInputRef.current?.click();
  };

  const handleAvatarFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      const msg = t.settings.avatarTooLarge ?? 'Avatar must be under 5MB';
      setAvatarError(msg);
      toast.error(msg);
      e.target.value = '';
      return;
    }

    setAvatarUploading(true);
    setAvatarError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        throw new Error('Upload failed');
      }

      const data = await res.json();
      if (!data?.url) throw new Error('Missing uploaded url');
      
      setAvatarUrl(data.url);
      toast.success(t.settings.avatarUploadSuccess ?? 'Avatar uploaded!');
    } catch (error) {
      console.error('Error uploading avatar:', error);
      const msg = t.settings.avatarUploadFailed ?? 'Failed to upload avatar';
      setAvatarError(msg);
      toast.error(msg);
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = '';
      }
    }
  };

  const handleAvatarClear = () => {
    if (!isProfileEditing) return;
    setAvatarUrl('');
    setAvatarError(null);
  };

  const handleProfileCancel = () => {
    setFullName(profileSnapshotRef.current.fullName);
    setAvatarUrl(profileSnapshotRef.current.avatarUrl);
    setAvatarError(null);
    setIsProfileEditing(false);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 font-sans">
      <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">{t.settings.title}</h1>
      
      <div className="space-y-8">
        <form
          onSubmit={handleProfileSave}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-8 border border-gray-100 dark:border-gray-700"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t.settings.profileTitle}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t.settings.profileSubtitle}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {isProfileEditing ? (
                <>
                  <button
                    type="button"
                    onClick={handleProfileCancel}
                    className="px-4 py-2 text-sm font-bold rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="submit"
                    disabled={profileSaving}
                    className="btn-openclaw flex items-center gap-2 px-6 py-2 text-sm font-bold uppercase tracking-wide"
                  >
                    {profileSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}
                    {profileSaving ? t.common.loading : t.settings.saveProfile}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileEditing(true);
                    setAvatarError(null);
                  }}
                  className="flex items-center gap-2 px-6 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-bold rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary uppercase tracking-wide text-sm"
                >
                  <Edit2 size={16} />
                  {t.common.edit}
                </button>
              )}
              {profileSaved && !isProfileEditing && (
                <span className="text-green-600 dark:text-green-400 text-sm font-bold flex items-center bg-green-50 dark:bg-green-900/20 px-3 py-1 rounded-full animate-in fade-in slide-in-from-left-2 duration-300">
                  <Check size={14} className="mr-1.5" strokeWidth={3} />
                  {t.settings.profileSaved}
                </span>
              )}
            </div>
          </div>

          <div className="mt-6 space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                {t.settings.displayName}
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={!isProfileEditing}
                required
                className={`w-full border rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all ${
                  isProfileEditing
                    ? "bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                    : "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                }`}
                placeholder={t.settings.displayNamePlaceholder}
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {t.settings.displayNameDesc}
              </p>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                {t.settings.avatarSectionTitle}
              </label>
              <div className="flex flex-col lg:flex-row gap-6">
                <div className="flex flex-col items-center gap-3">
                  <div className="relative w-24 h-24">
                    {previewAvatar ? (
                      /* eslint-disable-next-line @next/next/no-img-element -- Avatar preview uses data URLs and Supabase public URLs */
                      <img
                        src={previewAvatar}
                        alt="Avatar preview"
                        className="w-24 h-24 rounded-full object-cover border border-gray-200 dark:border-gray-600 bg-gray-100"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-full bg-black text-white flex items-center justify-center text-3xl font-semibold border border-gray-900/20">
                        {getProfileInitial(fullName)}
                      </div>
                    )}
                    {isProfileEditing && (
                      <button
                        type="button"
                        onClick={handleAvatarUploadClick}
                        disabled={avatarUploading}
                        className="absolute bottom-1 right-1 inline-flex items-center justify-center w-9 h-9 rounded-full bg-black text-white dark:bg-white dark:text-black shadow-lg shadow-black/20 hover:opacity-90 transition-all disabled:opacity-50"
                      >
                        {avatarUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 max-w-[10rem] text-center">
                    {t.settings.avatarPreviewHint}
                  </p>
                </div>
                <div className="flex-1 space-y-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    {t.settings.avatarDescription}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleAvatarUploadClick}
                      disabled={!isProfileEditing || avatarUploading}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all disabled:opacity-50 text-sm font-bold"
                    >
                      {avatarUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                      {avatarUploading ? t.common.loading : t.settings.avatarUploadBtn}
                    </button>
                    <button
                      type="button"
                      onClick={handleAvatarClear}
                      disabled={!isProfileEditing}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all disabled:opacity-50 text-sm font-bold"
                    >
                      {t.settings.avatarResetLabel}
                    </button>
                  </div>
                  {avatarError && (
                    <p className="text-xs text-red-500 dark:text-red-400">{avatarError}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarFileChange}
          />
        </form>

      </div>
    </div>
  );
}
