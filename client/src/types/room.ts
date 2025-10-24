import { serverTimestamp } from "firebase/database";

export interface RoomData {
    hostId: string;
    videoUrl: string;
    isPlaying?: boolean;
    currentTime?: number;
    playbackRate?: number;
    lastUpdate: object | number; // Firebase Realtime Database timestamp (object on write, number on read)
    clientTimestamp?: number; // Client-side timestamp for latency calculation
}

export interface RoomUpdate {
    isPlaying?: boolean;
    currentTime?: number;
    playbackRate?: number;
    videoUrl?: string;
    lastUpdate: ReturnType<typeof serverTimestamp>;
    clientTimestamp?: number; // Client-side timestamp for latency calculation
}
