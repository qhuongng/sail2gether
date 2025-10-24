import { create } from "zustand";
import type { ToastMessage, ToastType } from "@/components/toast";

interface ToastStore {
    toasts: ToastMessage[];
    showToast: (message: string, type?: ToastType) => void;
    removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
    toasts: [],
    showToast: (message: string, type: ToastType = "standard") => {
        const id = `toast-${Date.now()}-${Math.random()}`;
        const newToast: ToastMessage = { id, message, type };
        set((state) => ({ toasts: [...state.toasts, newToast] }));
    },
    removeToast: (id: string) => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    },
}));
