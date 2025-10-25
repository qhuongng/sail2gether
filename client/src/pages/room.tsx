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

function Room() {
    const { id: roomId } = useParams<{ id: string }>();

    const navigate = useNavigate();

    const { showToast } = useToastStore();
    const { isUpdatingFromFirebase, setIsUpdatingFromFirebase } = useRoomStore();

    const [videoUrl, setVideoUrl] = useState<string>("");
    const [currentVideoUrl, setCurrentVideoUrl] = useState<string>("");
    const [uploading, setUploading] = useState<boolean>(false);
    const [uploadProgress, setUploadProgress] = useState<number>(0);
    const [isHost, setIsHost] = useState<boolean>(false);
    const [viewerSyncEnabled, setViewerSyncEnabled] = useState<boolean>(false);
    const [roomExists, setRoomExists] = useState<boolean | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const lastSyncTime = useRef<number>(0);
    const lastUpdateTimestamp = useRef<number>(0);

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
        if (videoRef.current) {
            // Try to play and immediately pause to satisfy browser autoplay policy
            try {
                await videoRef.current.play();
                videoRef.current.pause();
                setViewerSyncEnabled(true);
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

    // Upload file to Cloudflare R2
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Check file size
        const maxSize = 4 * 1024 * 1024 * 1024; // 4GB
        if (file.size > maxSize) {
            showToast("Your file is a little too thicc. Maximum size is 4GB.", "error");
            return;
        }

        setUploading(true);
        setUploadProgress(0);

        try {
            const formData = new FormData();
            formData.append("file", file);

            // Create XMLHttpRequest for progress tracking
            const xhr = new XMLHttpRequest();

            // Track upload progress
            xhr.upload.addEventListener("progress", (e) => {
                if (e.lengthComputable) {
                    const percentComplete = (e.loaded / e.total) * 100;
                    setUploadProgress(Math.round(percentComplete));
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
            setVideoUrl(uploadedUrl);
            showToast('Upload successful! Click "Set video" to finish and enjoy. 🍿', "success");
        } catch (error) {
            console.error("Upload error:", error);
            showToast(
                `I couldn't get your video uploaded—${
                    error instanceof Error ? error.message : "and I don't even know why. 😔"
                }`,
                "error"
            );
        } finally {
            setUploading(false);
            setUploadProgress(0);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
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

        await update(roomRef, {
            videoUrl: videoUrl,
            isPlaying: false,
            currentTime: 0,
            playbackRate: 1,
            lastUpdate: serverTimestamp(),
            clientTimestamp: Date.now(),
        });

        setCurrentVideoUrl(videoUrl);
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
            updateRoomState({
                isPlaying: false,
                currentTime: videoRef.current.currentTime,
            });
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
        if (!isHost || !roomId || !videoRef.current) return;

        const interval = setInterval(() => {
            if (videoRef.current && !videoRef.current.paused) {
                updateRoomState({
                    currentTime: videoRef.current.currentTime,
                });
            }
        }, 1000); // Sync every second

        return () => clearInterval(interval);
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

                // Sync playback state
                if (data.isPlaying !== undefined) {
                    if (data.isPlaying && video.paused) {
                        video.play().catch((e: Error) => console.log("Play failed:", e));
                    } else if (!data.isPlaying && !video.paused) {
                        video.pause();
                    }
                }

                // Sync time with latency compensation
                if (data.currentTime !== undefined) {
                    const timeDiff = Math.abs(video.currentTime - data.currentTime);
                    const now = Date.now();

                    // Calculate actual latency if clientTimestamp is available
                    let latencyCompensation = 0.5; // Default 500ms
                    if (data.clientTimestamp) {
                        const measuredLatency = now - data.clientTimestamp;
                        // Use measured latency but cap it at reasonable values (100ms - 2000ms)
                        latencyCompensation = Math.max(0.1, Math.min(2.0, measuredLatency / 1000));

                        // Store for debugging
                        if (lastUpdateTimestamp.current !== data.clientTimestamp) {
                            lastUpdateTimestamp.current = data.clientTimestamp;
                            // console.log(`Viewer: Measured latency = ${measuredLatency}ms, compensation = ${latencyCompensation}s`);
                        }
                    }

                    // Only apply compensation if playing
                    const targetTime =
                        data.currentTime + (data.isPlaying ? latencyCompensation : 0);

                    // More aggressive sync with lower threshold (0.3s instead of 1s)
                    // This catches drift faster before it becomes noticeable
                    if (timeDiff > 0.3 && now - lastSyncTime.current > 300) {
                        video.currentTime = targetTime;
                        lastSyncTime.current = now;
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
    }, [roomId, currentVideoUrl, isHost, setIsUpdatingFromFirebase, viewerSyncEnabled]);

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
                <div className="mb-5 mt-8">
                    <p className="mb-8">
                        Congrats! You've got a room! Now please provide a video for your watch
                        party.
                    </p>

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
                                <p>Uploading: {uploadProgress}%</p>
                            </div>
                        )}
                    </div>

                    <div>
                        <h4 className="text-lg font-semibold mb-2">Option 2: Enter video URL</h4>
                        <div className="flex gap-2.5">
                            <TextInput
                                placeholder="YouTube URL or direct video file URL (.mp4, .webm)"
                                value={videoUrl}
                                onChange={(e) => setVideoUrl(e.target.value)}
                            />
                            <Button disabled={!videoUrl} onClick={setRoomVideoUrl}>
                                Set video
                            </Button>
                        </div>
                    </div>
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
