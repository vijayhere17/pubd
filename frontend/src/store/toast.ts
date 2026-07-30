import { create } from 'zustand'

type Toast = { id: number; type: 'success' | 'error' | 'info'; message: string }

type ToastState = {
  toasts: Toast[]
  push: (message: string, type?: Toast['type']) => void
  remove: (id: number) => void
}

let seq = 1

export const useToast = create<ToastState>((set) => ({
  toasts: [],
  push: (message, type = 'info') => {
    const id = seq++
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200)
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
