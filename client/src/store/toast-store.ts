import { create } from "zustand";

import type { StyleVariant } from "@/types/style";

import type { ToastMessage } from "@/components/toast";

interface ToastStore {
    toasts: ToastMessage[];
    showToast: (message: string, variant?: StyleVariant) => void;
    removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
    toasts: [],
    showToast: (message: string, variant: StyleVariant = "default") => {
        const id = `toast-${Date.now()}-${Math.random()}`;
        const newToast: ToastMessage = { id, message, variant };
        set((state) => ({ toasts: [...state.toasts, newToast] }));
    },
    removeToast: (id: string) => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    },
}));
