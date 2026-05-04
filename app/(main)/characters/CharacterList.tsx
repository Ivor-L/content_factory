'use client';

/* eslint-disable @next/next/no-img-element -- Character avatars come from user uploads with unknown domains/sizes */

import { useState } from 'react';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { CharacterForm } from '@/components/CharacterForm';
import { AddButton } from '@/components/AddButton';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { deleteCharacter } from './actions';
import { useLanguage } from '@/contexts/LanguageContext';
import { EmptyState } from '@/components/EmptyState';
import { CharacterEmptyGuide } from '@/components/characters/CharacterEmptyGuide';
import { CalendarDays, Edit3, Music2, Trash2 } from 'lucide-react';

interface Character {
  id: string;
  name: string;
  avatar: string;
  voiceId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CharacterListProps {
  initialCharacters: Character[];
  showHeader?: boolean;
  showEmptyGuide?: boolean;
}

export function CharacterList({
  initialCharacters,
  showHeader = true,
  showEmptyGuide = true,
}: CharacterListProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [detailCharacter, setDetailCharacter] = useState<Character | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [characterToDelete, setCharacterToDelete] = useState<string | null>(null);
  const { t } = useLanguage();

  const handleCharacterCreated = () => {
    setIsModalOpen(false);
    setEditingCharacter(null);
    router.refresh();
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setCharacterToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!characterToDelete) return;

    try {
      await deleteCharacter(characterToDelete);
      toast.success(t.common.success);
      setDetailCharacter(null);
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error(t.common.error);
    }
  };

  const handleEdit = (character: Character) => {
    setEditingCharacter(character);
    setDetailCharacter(null);
    setIsModalOpen(true);
  };

  return (
    <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${showHeader ? "py-12" : "pt-2 pb-8"} font-sans`}>
      <div className={`flex items-center ${showHeader ? "justify-between mb-8" : "justify-end mb-4"}`}>
        {showHeader && (
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t.characters.title}</h1>
        )}
        <AddButton
          label={t.characters.newCharacter}
          onClick={() => {
            setEditingCharacter(null);
            setIsModalOpen(true);
          }}
        />
      </div>

      {initialCharacters.length === 0 ? (
        showEmptyGuide ? (
          <CharacterEmptyGuide
            copy={t.characters.emptyGuide}
            onCtaClick={() => {
              setEditingCharacter(null);
              setIsModalOpen(true);
            }}
          />
        ) : (
          <EmptyState
            title={t.characters.noCharacters || '未找到角色'}
            description={t.characters.createFirst || '创建您的第一个角色'}
            action={{
              label: t.characters.newCharacter,
              onClick: () => {
                setEditingCharacter(null);
                setIsModalOpen(true);
              },
            }}
            compact
            className="bg-white dark:bg-gray-900"
          />
        )
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {initialCharacters.map((character) => (
            <article
              key={character.id}
              role="button"
              tabIndex={0}
              onClick={() => setDetailCharacter(character)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setDetailCharacter(character);
                }
              }}
              className="group block cursor-pointer overflow-hidden rounded-xl bg-white text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800"
            >
              <div className="relative aspect-[3/4] bg-gray-50 dark:bg-gray-700 overflow-hidden">
                {character.avatar ? (
                  <img
                    src={character.avatar}
                    alt={character.name}
                    className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    <span className="text-sm font-medium">No Avatar</span>
                  </div>
                )}
                {/* Overlay on hover */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300" />
              </div>
              <div className="p-5">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate mb-1">{character.name}</h3>
                {character.voiceId && (
                  <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                    <audio controls src={character.voiceId} className="w-full h-8" />
                  </div>
                )}
                <div className="mt-4 flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                  <span suppressHydrationWarning>{new Date(character.createdAt).toLocaleDateString()}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                    {t.common.edit}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        isOpen={Boolean(detailCharacter)}
        onClose={() => setDetailCharacter(null)}
        title={detailCharacter?.name || t.characters.title}
        maxWidth="max-w-3xl"
      >
        {detailCharacter && (
          <div className="grid gap-6 md:grid-cols-[minmax(220px,280px)_1fr]">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
              {detailCharacter.avatar ? (
                <img
                  src={detailCharacter.avatar}
                  alt={detailCharacter.name}
                  className="aspect-[3/4] h-full w-full object-cover object-center"
                />
              ) : (
                <div className="flex aspect-[3/4] items-center justify-center text-sm text-gray-400">
                  No Avatar
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-5">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t.characters.name}</p>
                <h2 className="mt-1 break-words text-2xl font-bold text-gray-950 dark:text-white">
                  {detailCharacter.name}
                </h2>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                  <Music2 className="h-4 w-4" />
                  {t.characters.voice}
                </div>
                {detailCharacter.voiceId ? (
                  <audio controls src={detailCharacter.voiceId} className="w-full" />
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t.characters.voicePlaceholder}
                  </p>
                )}
              </div>

              <div className="grid gap-3 text-sm text-gray-500 dark:text-gray-400 sm:grid-cols-2">
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
                  <CalendarDays className="h-4 w-4" />
                  <span suppressHydrationWarning>{new Date(detailCharacter.createdAt).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
                  <CalendarDays className="h-4 w-4" />
                  <span suppressHydrationWarning>{new Date(detailCharacter.updatedAt).toLocaleString()}</span>
                </div>
              </div>

              <div className="mt-auto grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleEdit(detailCharacter)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-black px-4 text-sm font-semibold text-white transition-colors hover:bg-gray-900 dark:bg-white dark:text-black dark:hover:bg-gray-200"
                >
                  <Edit3 className="h-4 w-4" />
                  {t.common.edit}
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDeleteClick(e, detailCharacter.id)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50"
                >
                  <Trash2 className="h-4 w-4" />
                  {t.common.delete}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
            setIsModalOpen(false);
            setEditingCharacter(null);
        }}
        title={editingCharacter ? t.characters.editTitle : t.characters.formTitle}
      >
        <CharacterForm 
          onSuccess={handleCharacterCreated}
          onCancel={() => {
            setIsModalOpen(false);
            setEditingCharacter(null);
          }}
          initialData={editingCharacter || undefined}
          key={editingCharacter?.id || 'new'}
        />
      </Modal>

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
            setIsDeleteModalOpen(false);
            setCharacterToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title={t.common.delete}
        message={t.common.confirmDelete}
      />
    </div>
  );
}
