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
        router.refresh();
    } catch (error) {
        console.error(error);
        toast.error(t.common.error);
    }
  };

  const handleEdit = (e: React.MouseEvent, character: Character) => {
    e.preventDefault();
    setEditingCharacter(character);
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
            <div
              key={character.id}
              className="group block bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden border border-gray-100 dark:border-gray-700"
            >
              <div className="relative h-64 bg-gray-50 dark:bg-gray-700 overflow-hidden">
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
                    <div className="mt-2" onClick={(e) => e.preventDefault()}>
                        <audio controls src={character.voiceId} className="w-full h-8" />
                    </div>
                )}
                <div className="mt-4 flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                  <span suppressHydrationWarning>{new Date(character.createdAt).toLocaleDateString()}</span>
                  <div className="flex items-center gap-2">
                      <button
                          onClick={(e) => handleEdit(e, character)}
                          className="text-gray-400 hover:text-primary p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                          title={t.common.edit}
                      >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 00 2 2h11a2 2 0 00 2-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                      </button>
                      <button
                          onClick={(e) => handleDeleteClick(e, character.id)}
                          className="text-gray-400 hover:text-red-600 p-1 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors group-hover:opacity-100"
                          title={t.common.delete}
                      >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                      </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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
