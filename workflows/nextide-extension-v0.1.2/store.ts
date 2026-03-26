import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { CollectedItem } from './utils/extractor'

interface GlobalSettings {
  defaultCategory: string
}

interface AppState {
  queue: CollectedItem[]
  globalSettings: GlobalSettings
  addItem: (item: CollectedItem) => void
  removeItem: (id: string) => void
  clearQueue: () => void
  updateItem: (id: string, updates: Partial<CollectedItem>) => void
  setGlobalSettings: (settings: Partial<GlobalSettings>) => void
}

const storage = {
  getItem: async (name: string): Promise<string | null> => {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([name], (result) => {
          resolve(result[name] || null)
        })
      } else {
        resolve(localStorage.getItem(name))
      }
    })
  },
  setItem: async (name: string, value: string): Promise<void> => {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [name]: value }, () => {
          resolve()
        })
      } else {
        localStorage.setItem(name, value)
        resolve()
      }
    })
  },
  removeItem: async (name: string): Promise<void> => {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.remove([name], () => {
          resolve()
        })
      } else {
        localStorage.removeItem(name)
        resolve()
      }
    })
  }
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      queue: [],
      globalSettings: {
        defaultCategory: ''
      },
      addItem: (item) =>
        set((state) => {
          // Avoid duplicates based on ID or NoteID
          const exists = state.queue.some(
            (i) => i.id === item.id || (item.data.noteId && i.data.noteId === item.data.noteId)
          )
          if (exists) return state
          return { queue: [item, ...state.queue] }
        }),
      removeItem: (id) =>
        set((state) => ({
          queue: state.queue.filter((item) => item.id !== id)
        })),
      clearQueue: () => set({ queue: [] }),
      updateItem: (id, updates) =>
        set((state) => ({
          queue: state.queue.map((item) => (item.id === id ? { ...item, ...updates } : item))
        })),
      setGlobalSettings: (settings) =>
        set((state) => ({
          globalSettings: { ...state.globalSettings, ...settings }
        }))
    }),
    {
      name: 'rednote-muse-storage',
      storage: createJSONStorage(() => storage)
    }
  )
)
