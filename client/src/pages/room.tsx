import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ref, update, onValue, serverTimestamp, get } from "firebase/database";

import { WORKER_URL, UPLOAD_SECRET } from "@/constants/config";
import { useToastStore } from "@/store/toast-store";
import { useRoomStore } from "@/store/room-store";
import type { RoomData, RoomUpdate } from "@/types/room";
import { db } from "@/utils/firebase";
import { isYouTubeUrl, getYouTubeVideoId, isRoomHost, isValidUrl } from "@/utils/helpers";

import Button from "@/components/button";
import TextInput from "@/components/text-input";
import VideoPlayer from "@/components/video-player";

// Chunk size: 80MB (safely under the 100MB limit of free Cloudflare workers with overhead)
const CHUNK_SIZE = 80 * 1024 * 1024;

function Room() {
    const { id: roomId } = useParams<{ id: string }>();

    const navigate = useNavigate();

    const { showToast } = useToastStore();
    const { isUpdatingFromFirebase, setIsUpdatingFromFirebase } = useRoomStore();

    const [videoUrl, setVideoUrl] = useState<string>("");
    const [currentVideoUrl, setCurrentVideoUrl] = useState<string>("");
    const [subtitlesUrl, setSubtitlesUrl] = useState<string>("");
    const [currentSubtitlesUrl, setCurrentSubtitlesUrl] = useState<string>("");
    const [uploading, setUploading] = useState<boolean>(false);
    const [uploadProgress, setUploadProgress] = useState<number>(0);
    const [uploadingSubtitles, setUploadingSubtitles] = useState<boolean>(false);
    const [subtitlesUploadProgress, setSubtitlesUploadProgress] = useState<number>(0);
    const [isHost, setIsHost] = useState<boolean>(false);
    const [viewerSyncEnabled, setViewerSyncEnabled] = useState<boolean>(false);
    const [roomExists, setRoomExists] = useState<boolean | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const subtitlesInputRef = useRef<HTMLInputElement>(null);
    const lastSyncTime = useRef<number>(0);
    const lastUpdateTimestamp = useRef<number>(0);
    const uploadAbortController = useRef<AbortController | null>(null);

    // Check if room exists in Firebase
    useEffect(() => {
        if (!roomId) {
            setRoomExists(false);
            return;
        }

        const checkRoomExists = async () => {
            try {
                const roomRef = ref(db, `rooms/${roomId}`);
                const snapshot = await get(roomRef);

                if (!snapshot.exists()) {
                    setRoomExists(false);
                } else {
                    setRoomExists(true);
                }
            } catch (error) {
                console.error("Error checking room existence:", error);
                setRoomExists(false);
            }
        };

        checkRoomExists();
    }, [roomId, navigate, showToast]);

    // Check if user is host from localStorage
    useEffect(() => {
        if (roomId) {
            const hostValue = isRoomHost(roomId);
            setIsHost(hostValue);
            // Auto-enable sync for host
            if (hostValue) {
                setViewerSyncEnabled(true);
            }
        }
    }, [roomId]);

    // Enable sync for viewer (requires user interaction for autoplay)
    const enableViewerSync = async (): Promise<void> => {
        if (videoRef.current && roomId) {
            // Try to play and immediately pause to satisfy browser autoplay policy
            try {
                const video = videoRef.current;

                console.log(
                    `[VIEWER] Before sync - video at ${video.currentTime}s, paused: ${video.paused}`
                );

                await video.play();
                video.pause();

                // Immediately fetch and apply current room state BEFORE enabling sync
                const roomRef = ref(db, `rooms/${roomId}`);
                const snapshot = await get(roomRef);

                if (snapshot.exists()) {
                    const data = snapshot.val() as RoomData;

                    setIsUpdatingFromFirebase(true);

                    const now = Date.now();

                    console.log(
                        `[VIEWER] Firebase data - currentTime: ${data.currentTime}s, isPlaying: ${data.isPlaying}, clientTimestamp: ${data.clientTimestamp}`
                    );

                    // Calculate latency compensation
                    let latencyCompensation = 0;
                    if (data.clientTimestamp && data.isPlaying) {
                        const timeSinceUpdate = (now - data.clientTimestamp) / 1000;
                        // Cap at 1.5 seconds to handle periodic sync delays
                        latencyCompensation = Math.min(1.5, timeSinceUpdate);
                        console.log(
                            `[VIEWER] Compensation - timeSinceUpdate: ${timeSinceUpdate.toFixed(
                                3
                            )}s, compensation: ${latencyCompensation.toFixed(3)}s`
                        );
                    }

                    // Apply playback rate first
                    if (data.playbackRate !== undefined) {
                        video.playbackRate = data.playbackRate;
                    }

                    // Calculate where host should be NOW and sync immediately
                    if (data.currentTime !== undefined) {
                        const targetTime = data.currentTime + latencyCompensation;
                        console.log(
                            `[VIEWER] Setting video from ${video.currentTime.toFixed(
                                3
                            )}s to ${targetTime.toFixed(3)}s`
                        );
                        video.currentTime = targetTime;
                    }

                    // Apply play/pause state AFTER time is set
                    if (data.isPlaying && video.paused) {
                        console.log(`[VIEWER] Starting playback`);
                        await video.play();
                    } else if (!data.isPlaying && !video.paused) {
                        console.log(`[VIEWER] Pausing playback`);
                        video.pause();
                    }

                    // Initialize last sync time
                    lastSyncTime.current = now;

                    setIsUpdatingFromFirebase(false);
                }

                // Enable sync AFTER applying initial state
                setViewerSyncEnabled(true);
                console.log(`[VIEWER] Sync enabled`);

                showToast("Yay! You will now see what the host is watching!!!", "success");
            } catch (error) {
                console.error("Failed to enable sync:", error);
                showToast(
                    "Hmmm, something went wrong. Please try again once the video shows up.",
                    "error"
                );
            }
        }
    };

    // Upload file to Cloudflare R2 with chunking
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
        const file = e.target.files?.[0];
        if (!file) return;

        console.log(
            "File selected:",
            file.name,
            "Size:",
            (file.size / 1024 / 1024).toFixed(2) + "MB"
        );

        // Check file size
        const maxSize = 4 * 1024 * 1024 * 1024; // 4GB
        if (file.size > maxSize) {
            showToast("Your file is a little too thicc. Maximum size is 4GB.", "error");
            return;
        }

        setUploading(true);
        setUploadProgress(0);
        uploadAbortController.current = new AbortController();

        try {
            // If file is small enough, use direct upload
            if (file.size <= CHUNK_SIZE) {
                console.log("Using direct upload (file <= 80MB)");
                await directUpload(file);
            } else {
                console.log("Using chunked upload (file > 80MB)");
                await chunkedUpload(file);
            }
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                showToast("Upload cancelled.", "info");
            } else {
                console.error("Upload error:", error);
                showToast(
                    `I couldn't get your video uploaded—${
                        error instanceof Error ? error.message : "and I don't even know why. 😔"
                    }`,
                    "error"
                );
            }
        } finally {
            setUploading(false);
            setUploadProgress(0);
            uploadAbortController.current = null;
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    // Direct upload for small files
    const directUpload = async (file: File): Promise<void> => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", "video");

        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                setUploadProgress(Math.round(percentComplete));
            }
        });

        const uploadPromise = new Promise<string>((resolve, reject) => {
            xhr.addEventListener("load", () => {
                if (xhr.status === 200) {
                    const response = JSON.parse(xhr.responseText);
                    resolve(response.url);
                } else {
                    reject(new Error(`Upload failed: ${xhr.statusText}`));
                }
            });

            xhr.addEventListener("error", () => {
                reject(new Error("Upload failed"));
            });

            xhr.addEventListener("abort", () => {
                reject(new Error("Upload cancelled"));
            });

            // Handle abort signal
            uploadAbortController.current?.signal.addEventListener("abort", () => {
                xhr.abort();
            });
        });

        xhr.open("POST", `${WORKER_URL}/upload`);
        xhr.setRequestHeader("Authorization", `Bearer ${UPLOAD_SECRET}`);
        xhr.send(formData);

        const uploadedUrl = await uploadPromise;
        setVideoUrl(uploadedUrl);
        showToast('Upload successful! Click "Set video" to finish and enjoy. 🍿', "success");
    };

    // Chunked upload for large files
    const chunkedUpload = async (file: File): Promise<void> => {
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

        console.log(
            `Starting chunked upload: ${file.name}, Size: ${(file.size / 1024 / 1024).toFixed(
                2
            )}MB, Chunks: ${totalChunks}`
        );

        // Step 1: Initialize multipart upload
        const initResponse = await fetch(`${WORKER_URL}/upload/init`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${UPLOAD_SECRET}`,
            },
            body: JSON.stringify({
                filename: file.name,
                fileSize: file.size,
                totalChunks: totalChunks,
            }),
            signal: uploadAbortController.current?.signal,
        });

        if (!initResponse.ok) {
            const errorText = await initResponse.text();
            console.error("Init upload failed:", initResponse.status, errorText);
            throw new Error(`Failed to initialize upload: ${initResponse.status}`);
        }

        const { uploadId } = await initResponse.json();
        console.log(`Upload initialized: ${uploadId}`);

        // Step 2: Upload chunks using PUT with progress tracking
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            const start = chunkIndex * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);
            const partNumber = chunkIndex + 1;

            console.log(`Uploading part ${partNumber}/${totalChunks}`);

            // Use XMLHttpRequest for progress tracking
            await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();

                // Track chunk upload progress
                xhr.upload.addEventListener("progress", (e) => {
                    if (e.lengthComputable) {
                        // Calculate overall progress:
                        // (completed chunks + current chunk progress) / total chunks
                        const completedChunks = chunkIndex;
                        const currentChunkProgress = e.loaded / e.total;
                        const overallProgress =
                            ((completedChunks + currentChunkProgress) / totalChunks) * 100;
                        setUploadProgress(Math.round(overallProgress));
                    }
                });

                xhr.addEventListener("load", () => {
                    if (xhr.status === 200) {
                        resolve();
                    } else {
                        reject(
                            new Error(
                                `Failed to upload chunk ${partNumber}/${totalChunks}: ${xhr.statusText}`
                            )
                        );
                    }
                });

                xhr.addEventListener("error", () => {
                    reject(new Error(`Network error uploading chunk ${partNumber}/${totalChunks}`));
                });

                xhr.addEventListener("abort", () => {
                    reject(new Error("Upload cancelled"));
                });

                // Handle abort signal
                uploadAbortController.current?.signal.addEventListener("abort", () => {
                    xhr.abort();
                });

                xhr.open(
                    "PUT",
                    `${WORKER_URL}/upload/chunk?uploadId=${encodeURIComponent(
                        uploadId
                    )}&partNumber=${partNumber}`
                );
                xhr.setRequestHeader("Authorization", `Bearer ${UPLOAD_SECRET}`);
                xhr.send(chunk);
            });
        }

        console.log("All chunks uploaded, completing...");

        // Step 3: Complete upload
        const completeResponse = await fetch(`${WORKER_URL}/upload/complete`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${UPLOAD_SECRET}`,
            },
            body: JSON.stringify({
                uploadId: uploadId,
            }),
            signal: uploadAbortController.current?.signal,
        });

        if (!completeResponse.ok) {
            const errorText = await completeResponse.text();
            console.error("Complete failed:", errorText);
            throw new Error("Failed to complete upload");
        }

        const { url } = await completeResponse.json();
        setVideoUrl(url);
        showToast('Upload successful! Click "Set video" to finish and enjoy. 🍿', "success");
    };

    // Cancel upload
    const cancelUpload = (): void => {
        if (uploadAbortController.current) {
            uploadAbortController.current.abort();
        }
    };

    // Upload subtitle file to Cloudflare R2
    const handleSubtitleUpload = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Check file size (10MB max for subtitles)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            showToast("Subtitle file is too large. Maximum size is 10MB.", "error");
            return;
        }

        // Check file extension
        const validExtensions = [".vtt", ".srt"];
        const fileName = file.name.toLowerCase();
        const hasValidExtension = validExtensions.some((ext) => fileName.endsWith(ext));

        if (!hasValidExtension) {
            showToast("Please upload a .vtt or .srt subtitle file.", "error");
            return;
        }

        setUploadingSubtitles(true);
        setSubtitlesUploadProgress(0);

        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("type", "subtitle");

            // Create XMLHttpRequest for progress tracking
            const xhr = new XMLHttpRequest();

            // Track upload progress
            xhr.upload.addEventListener("progress", (e) => {
                if (e.lengthComputable) {
                    const percentComplete = (e.loaded / e.total) * 100;
                    setSubtitlesUploadProgress(Math.round(percentComplete));
                }
            });

            // Handle completion
            const uploadPromise = new Promise<string>((resolve, reject) => {
                xhr.addEventListener("load", () => {
                    if (xhr.status === 200) {
                        const response = JSON.parse(xhr.responseText);
                        resolve(response.url);
                    } else {
                        reject(new Error(`Upload failed: ${xhr.statusText}`));
                    }
                });

                xhr.addEventListener("error", () => {
                    reject(new Error("Upload failed"));
                });

                xhr.addEventListener("abort", () => {
                    reject(new Error("Upload cancelled"));
                });
            });

            xhr.open("POST", `${WORKER_URL}/upload`);
            xhr.setRequestHeader("Authorization", `Bearer ${UPLOAD_SECRET}`);
            xhr.send(formData);

            const uploadedUrl = await uploadPromise;
            setSubtitlesUrl(uploadedUrl);
            showToast("Subtitle uploaded! It will be added when you set the video.", "success");
        } catch (error) {
            console.error("Subtitle upload error:", error);
            showToast(
                `Subtitle upload failed: ${
                    error instanceof Error ? error.message : "Unknown error"
                }`,
                "error"
            );
        } finally {
            setUploadingSubtitles(false);
            setSubtitlesUploadProgress(0);
            if (subtitlesInputRef.current) {
                subtitlesInputRef.current.value = "";
            }
        }
    };

    // Set video URL (host only)
    const setRoomVideoUrl = async (): Promise<void> => {
        if (!isHost || !videoUrl.trim() || !roomId) return;

        // Validate URL format
        if (!isValidUrl(videoUrl.trim())) {
            showToast(
                "Your URL looks a little wacky. It should start with http:// or https://.",
                "error"
            );
            return;
        }

        const roomRef = ref(db, `rooms/${roomId}`);

        const updateData: {
            videoUrl: string;
            subtitlesUrl?: string;
            isPlaying: boolean;
            currentTime: number;
            playbackRate: number;
            lastUpdate: ReturnType<typeof serverTimestamp>;
            clientTimestamp: number;
        } = {
            videoUrl: videoUrl,
            isPlaying: false,
            currentTime: 0,
            playbackRate: 1,
            lastUpdate: serverTimestamp(),
            clientTimestamp: Date.now(),
        };

        // Add subtitles URL if present
        if (subtitlesUrl) {
            updateData.subtitlesUrl = subtitlesUrl;
        }

        await update(roomRef, updateData);

        setCurrentVideoUrl(videoUrl);
        if (subtitlesUrl) {
            setCurrentSubtitlesUrl(subtitlesUrl);
        }
    };

    // Update Firebase with video state (host only)
    const updateRoomState = useCallback(
        async (updates: Omit<RoomUpdate, "lastUpdate">): Promise<void> => {
            if (!isHost || !roomId) return;

            const roomRef = ref(db, `rooms/${roomId}`);
            const timestamp = Date.now();

            await update(roomRef, {
                ...updates,
                lastUpdate: serverTimestamp(),
                clientTimestamp: timestamp,
            });
        },
        [isHost, roomId]
    );

    // Video event handlers (host only)
    const handlePlay = (): void => {
        if (isHost && videoRef.current && !isUpdatingFromFirebase) {
            updateRoomState({
                isPlaying: true,
                currentTime: videoRef.current.currentTime,
            });
            console.log("Host: Playing at", videoRef.current.currentTime);
        } else {
            console.log("Host: Play event blocked", {
                isHost,
                hasVideo: !!videoRef.current,
                isUpdatingFromFirebase,
            });
        }
    };

    const handlePause = (): void => {
        if (isHost && videoRef.current && !isUpdatingFromFirebase) {
            // Use setTimeout to ensure we get the accurate paused time
            // (the pause event can fire before currentTime is fully updated)
            setTimeout(() => {
                if (videoRef.current) {
                    updateRoomState({
                        isPlaying: false,
                        currentTime: videoRef.current.currentTime,
                    });
                    console.log("Host: Paused at", videoRef.current.currentTime);
                }
            }, 0);
        } else {
            console.log("Host: Pause event blocked", {
                isHost,
                hasVideo: !!videoRef.current,
                isUpdatingFromFirebase,
            });
        }
    };

    const handleSeeked = (): void => {
        if (isHost && videoRef.current && !isUpdatingFromFirebase) {
            updateRoomState({
                currentTime: videoRef.current.currentTime,
            });
        }
    };

    // Periodic time sync (host only)
    useEffect(() => {
        console.log(`[HOST] Periodic sync effect check - isHost: ${isHost}, roomId: ${roomId}`);

        if (!isHost || !roomId) {
            console.log("[HOST] Periodic sync NOT set up - conditions not met");
            return;
        }

        console.log("[HOST] Setting up periodic sync interval");

        const interval = setInterval(() => {
            const video = videoRef.current;
            console.log(
                `[HOST] Periodic tick - video exists: ${!!video}, paused: ${video?.paused}`
            );

            if (video && !video.paused) {
                const currentTime = video.currentTime;
                console.log(
                    `[HOST] Periodic sync - sending currentTime: ${currentTime.toFixed(
                        3
                    )}s, isPlaying: true`
                );
                updateRoomState({
                    currentTime: currentTime,
                    isPlaying: true, // CRITICAL: Include isPlaying so clientTimestamp stays fresh
                });
            }
        }, 1000); // Sync every second

        return () => {
            console.log("[HOST] Cleaning up periodic sync interval");
            clearInterval(interval);
        };
    }, [isHost, roomId, updateRoomState]);

    // Listen to room updates
    useEffect(() => {
        if (!roomId) return;

        const roomRef = ref(db, `rooms/${roomId}`);
        const unsubscribe = onValue(roomRef, (snapshot) => {
            if (!snapshot.exists()) return;

            const data = snapshot.val() as RoomData;

            // Update video URL if changed
            if (data.videoUrl && data.videoUrl !== currentVideoUrl) {
                setCurrentVideoUrl(data.videoUrl);
            }

            // Update subtitles URL if changed
            if (data.subtitlesUrl && data.subtitlesUrl !== currentSubtitlesUrl) {
                setCurrentSubtitlesUrl(data.subtitlesUrl);
            } else if (!data.subtitlesUrl && currentSubtitlesUrl) {
                setCurrentSubtitlesUrl("");
            }

            // If viewer, sync with host
            if (!isHost) {
                const video = videoRef.current;
                if (!video) {
                    console.log("Viewer: No video element found");
                    return;
                }

                // Only sync if viewer has enabled sync
                if (!viewerSyncEnabled) {
                    console.log("Viewer: Sync not enabled yet");
                    return;
                }

                setIsUpdatingFromFirebase(true);

                const now = Date.now();

                // Calculate latency compensation if clientTimestamp is available
                let latencyCompensation = 0;
                if (data.clientTimestamp && data.isPlaying) {
                    const timeSinceUpdate = (now - data.clientTimestamp) / 1000;
                    // Cap at 1.5 seconds to handle periodic sync delays
                    latencyCompensation = Math.min(1.5, timeSinceUpdate);

                    // Store for debugging
                    if (lastUpdateTimestamp.current !== data.clientTimestamp) {
                        lastUpdateTimestamp.current = data.clientTimestamp;
                        console.log(
                            `Ongoing sync - Time since update: ${timeSinceUpdate.toFixed(
                                3
                            )}s, compensation: ${latencyCompensation.toFixed(3)}s`
                        );
                    }
                }

                // Sync time FIRST (before play/pause to avoid visible jumps)
                if (data.currentTime !== undefined) {
                    // Calculate where the host should be NOW
                    const targetTime = data.currentTime + latencyCompensation;

                    // Compare viewer's current position with where host should be
                    const drift = Math.abs(video.currentTime - targetTime);

                    console.log(
                        `[VIEWER] Ongoing - viewer at ${video.currentTime.toFixed(
                            3
                        )}s, target ${targetTime.toFixed(3)}s, drift ${drift.toFixed(3)}s`
                    );

                    // Sync if drift exceeds threshold (0.3s) or it's been a while since last sync
                    // Use higher threshold to avoid constant micro-adjustments
                    if (drift > 0.3 || now - lastSyncTime.current > 2000) {
                        console.log(`[VIEWER] CORRECTING - setting to ${targetTime.toFixed(3)}s`);
                        video.currentTime = targetTime;
                        lastSyncTime.current = now;
                    }
                }

                // Sync playback state AFTER time is synced
                if (data.isPlaying !== undefined) {
                    if (data.isPlaying && video.paused) {
                        video.play().catch((e: Error) => console.log("Play failed:", e));
                    } else if (!data.isPlaying && !video.paused) {
                        video.pause();
                    }
                }

                // Sync playback rate
                if (data.playbackRate && video.playbackRate !== data.playbackRate) {
                    video.playbackRate = data.playbackRate;
                }

                // Clear flag immediately
                setIsUpdatingFromFirebase(false);
            }
        });

        return () => unsubscribe();
    }, [
        roomId,
        currentVideoUrl,
        currentSubtitlesUrl,
        isHost,
        setIsUpdatingFromFirebase,
        viewerSyncEnabled,
    ]);

    // Copy room URL to clipboard
    const copyRoomUrl = (): void => {
        const url = `${window.location.origin}/room/${roomId}`;
        navigator.clipboard.writeText(url);
        showToast("Copied. Now rope your friends in!!!", "success");
    };

    // Leave room and go back home
    const leaveRoom = (): void => {
        navigate("/");
    };

    if (!roomId) {
        return (
            <div className="flex flex-col justify-center min-h-screen max-w-3xl mx-auto p-12">
                <h1 className="text-3xl font-bold mb-8">Oops!!!</h1>
                <p>Something happened, and the room ID is missing. Sorry!!!</p>
                <Button onClick={leaveRoom} title="Go home" className="mt-24 mr-auto">
                    Take me back, pls
                </Button>
            </div>
        );
    }

    // Show loading state while checking if room exists
    if (roomExists === null) {
        return (
            <div className="max-w-3xl mx-auto p-12 h-screen flex flex-col justify-center items-center">
                <p className="text-xl">Checking room...</p>
            </div>
        );
    }

    // Show error state if room doesn't exist
    if (roomExists === false) {
        return (
            <div className="flex flex-col justify-center min-h-screen max-w-3xl mx-auto p-12">
                <h1 className="text-3xl font-bold mb-8">Wrong address!!!</h1>
                <p>
                    There's no room with the ID you entered. Double check the URL or ask the host
                    for a new invite link (they might have deleted the room too, oops).
                </p>
                <Button onClick={leaveRoom} title="Go home" className="mt-24 mr-auto">
                    Take me back, pls
                </Button>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto p-12 h-screen flex flex-col justify-center">
            <div className={`${currentVideoUrl ? "mb-8" : ""}`}>
                <div className="flex flex-col sm:flex-row items-start justify-between">
                    <div className="flex flex-col">
                        <h1 className="font-bold text-3xl">Room ID: {roomId}</h1>
                        {isHost && (
                            <span className="text-success font-bold">(You are the host)</span>
                        )}
                        {!isHost && <span className="text-info font-bold">(Viewer)</span>}
                    </div>

                    <div className="flex gap-4 mt-4 sm:mt-0">
                        <Button onClick={copyRoomUrl}>Copy room URL</Button>
                        <Button onClick={leaveRoom}>Go home</Button>
                    </div>
                </div>
            </div>

            {isHost && !currentVideoUrl && (
                <div className="mb-5 mt-8 flex flex-col">
                    <p className="mb-8">
                        Congrats! You've got a room! Now please provide a video for your watch
                        party.
                    </p>

                    <div className="border-2 border-base-300 p-4 mb-5">
                        <div className="mb-5">
                            <h4 className="text-lg font-semibold mb-2">Option 1: Upload file</h4>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="video/*"
                                onChange={handleFileUpload}
                                disabled={uploading}
                                className="w-full file-input file-input-bordered border-neutral-400 hover:border-base-300 mb-2.5"
                            />
                            {uploading && (
                                <div>
                                    <div className="w-full border-2 mb-2.5 h-5 z-10 overflow-hidden">
                                        <div
                                            className="bg-success h-full transition-all duration-300"
                                            style={{ width: `${uploadProgress}%` }}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <p>Uploading: {uploadProgress}%</p>
                                        <Button
                                            variant="error"
                                            onClick={cancelUpload}
                                            className="text-sm"
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div>
                            <h4 className="text-lg font-semibold text-info mb-2">
                                Optional: Upload subtitle file
                            </h4>
                            <input
                                ref={subtitlesInputRef}
                                type="file"
                                accept=".vtt,.srt"
                                onChange={handleSubtitleUpload}
                                disabled={uploadingSubtitles}
                                className="w-full file-input file-input-bordered border-neutral-400 hover:border-base-300 mb-2.5"
                            />
                            {uploadingSubtitles && (
                                <div>
                                    <div className="w-full border-2 mb-2.5 h-5 z-10 overflow-hidden">
                                        <div
                                            className="bg-info h-full transition-all duration-300"
                                            style={{ width: `${subtitlesUploadProgress}%` }}
                                        />
                                    </div>
                                    <p>Uploading subtitles: {subtitlesUploadProgress}%</p>
                                </div>
                            )}
                            {subtitlesUrl && !uploadingSubtitles && (
                                <p className="text-success text-sm">✓ Subtitle file ready</p>
                            )}
                        </div>
                    </div>

                    <div className="border-2 border-base-300 p-4 mb-5">
                        <h4 className="text-lg font-semibold mb-2">Option 2: Enter video URL</h4>
                        <div className="flex gap-2.5">
                            <TextInput
                                placeholder="YouTube URL or direct video file URL (.mp4, .webm)"
                                value={videoUrl}
                                onChange={(e) => setVideoUrl(e.target.value)}
                            />
                        </div>
                    </div>

                    <Button className="ml-auto" disabled={!videoUrl} onClick={setRoomVideoUrl}>
                        Set video
                    </Button>
                </div>
            )}

            {currentVideoUrl && (
                <div>
                    {!isHost && !viewerSyncEnabled && (
                        <div className="flex items-center mb-5 p-4 border-2 border-base-300">
                            <p>
                                Due to browsers' autoplay policies, please click this scary button
                                to enable video sync with the host.
                            </p>
                            <Button variant="info" className="ml-auto" onClick={enableViewerSync}>
                                Enable sync
                            </Button>
                        </div>
                    )}

                    {isYouTubeUrl(currentVideoUrl) ? (
                        <div className="relative pb-[56.25%] h-0 max-w-3xl">
                            <iframe
                                src={`https://www.youtube.com/embed/${getYouTubeVideoId(
                                    currentVideoUrl
                                )}?enablejsapi=1&origin=${window.location.origin}`}
                                className="absolute top-0 left-0 w-full h-full border-none"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                            />
                        </div>
                    ) : (
                        <VideoPlayer
                            isHost={isHost}
                            source={currentVideoUrl}
                            subtitlesUrl={currentSubtitlesUrl}
                            videoRef={videoRef}
                            onPlay={handlePlay}
                            onPause={handlePause}
                            onSeeked={handleSeeked}
                        />
                    )}
                </div>
            )}

            {!currentVideoUrl && !isHost && <p>Waiting for host to set video URL...</p>}
        </div>
    );
}

export default Room;
