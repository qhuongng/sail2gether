import { create } from "zustand";

interface RoomStore {
    isUpdatingFromFirebase: boolean;
    setIsUpdatingFromFirebase: (value: boolean) => void;
}

export const useRoomStore = create<RoomStore>((set) => ({
    isUpdatingFromFirebase: false,
    setIsUpdatingFromFirebase: (value: boolean) => set({ isUpdatingFromFirebase: value }),
}));
