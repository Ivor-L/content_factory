'use client';

import { useState } from 'react';
import { Modal } from '@/components/Modal';
import { CharacterForm } from '@/components/CharacterForm';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { deleteCharacter } from './actions';
import { useLanguage } from '@/contexts/LanguageContext';

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
}

export function CharacterList({ initialCharacters }: CharacterListProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const { t } = useLanguage();

  const handleCharacterCreated = () => {
    setIsModalOpen(false);
    setEditingCharacter(null);
    router.refresh();
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (!confirm(t.common.confirmDelete)) return;

    try {
        await deleteCharacter(id);
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 font-sans">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t.characters.title}</h1>
        <button
          onClick={() => {
            setEditingCharacter(null);
            setIsModalOpen(true);
          }}
          className="inline-flex items-center px-6 py-2 border border-transparent text-sm font-bold rounded-lg shadow-sm text-black bg-brand-yellow hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-yellow transition-colors uppercase tracking-wide"
        >
          {t.characters.newCharacter}
        </button>
      </div>

      {initialCharacters.length === 0 ? (
        <div className="text-center py-20 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="mb-4">{t.characters.noCharacters}</p>
          <button 
            onClick={() => {
                setEditingCharacter(null);
                setIsModalOpen(true);
            }}
            className="text-blue-600 hover:text-blue-500 font-medium underline"
          >
            {t.characters.createFirst}
          </button>
        </div>
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
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        Voice ID: {character.voiceId}
                    </p>
                )}
                <div className="mt-4 flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                  <span>{new Date(character.createdAt).toLocaleDateString()}</span>
                  <div className="flex items-center gap-2">
                      <button
                          onClick={(e) => handleEdit(e, character)}
                          className="text-gray-400 hover:text-blue-600 p-1 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                          title={t.common.edit}
                      >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 00 2 2h11a2 2 0 00 2-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                      </button>
                      <button
                          onClick={(e) => handleDelete(e, character.id)}
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
    </div>
  );
}
