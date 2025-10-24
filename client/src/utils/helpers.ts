import { HOSTED_ROOMS_KEY } from "@/constants/config";

// Helper function to detect and convert YouTube URLs
export const getYouTubeVideoId = (url: string): string | null => {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /^([a-zA-Z0-9_-]{11})$/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
};

export const isYouTubeUrl = (url: string): boolean => {
    return getYouTubeVideoId(url) !== null;
};

// Generate random room ID
export const generateRoomId = (): string => {
    return Math.random().toString(36).substring(2, 9);
};

// Load hosted rooms from localStorage
export const loadHostedRooms = (): string[] => {
    try {
        const stored = localStorage.getItem(HOSTED_ROOMS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.error("Error loading hosted rooms:", error);
        return [];
    }
};

// Save room ID to localStorage
export const saveHostedRoom = (roomId: string): void => {
    try {
        const rooms = loadHostedRooms();
        if (!rooms.includes(roomId)) {
            rooms.push(roomId);
            localStorage.setItem(HOSTED_ROOMS_KEY, JSON.stringify(rooms));
        }
    } catch (error) {
        console.error("Error saving hosted room:", error);
    }
};

// Remove room from localStorage
export const removeHostedRoomFromStorage = (roomId: string): string[] => {
    try {
        const rooms = loadHostedRooms().filter((id) => id !== roomId);
        localStorage.setItem(HOSTED_ROOMS_KEY, JSON.stringify(rooms));
        return rooms;
    } catch (error) {
        console.error("Error removing hosted room:", error);
        return loadHostedRooms();
    }
};

// Check if user is host of a room
export const isRoomHost = (roomId: string): boolean => {
    try {
        const rooms = loadHostedRooms();
        return rooms.includes(roomId);
    } catch (error) {
        console.error("Error checking if user is host:", error);
        return false;
    }
};
