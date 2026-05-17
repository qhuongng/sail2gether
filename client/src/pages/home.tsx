import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ref, set, get, remove, serverTimestamp } from "firebase/database";

import { WORKER_URL, R2_PUBLIC_URL, UPLOAD_SECRET } from "@/constants/config";
import { useToastStore } from "@/store/toast-store";
import type { RoomData } from "@/types/room";
import { db } from "@/utils/firebase";
import {
    generateRoomId,
    loadHostedRooms,
    saveHostedRoom,
    removeHostedRoomFromStorage,
} from "@/utils/helpers";

import iconImage from "@/assets/images/logo.png";
import Button from "@/components/button";
import InstallPWA from "@/components/install-pwa";
import Modal from "@/components/modal";
import TextInput from "@/components/text-input";

function Home() {
    const [roomId, setRoomId] = useState<string>("");
    const [hostedRooms, setHostedRooms] = useState<string[]>([]);
    const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
    const [roomToDelete, setRoomToDelete] = useState<string>("");
    const navigate = useNavigate();
    const { showToast } = useToastStore();

    // Load hosted rooms from localStorage
    useEffect(() => {
        setHostedRooms(loadHostedRooms());
    }, []);

    // Create a new room
    const createRoom = async (): Promise<void> => {
        try {
            const newRoomId = generateRoomId();
            const roomRef = ref(db, `rooms/${newRoomId}`);

            await set(roomRef, {
                hostId: "host",
                videoUrl: "",
                isPlaying: false,
                currentTime: 0,
                playbackRate: 1,
                lastUpdate: serverTimestamp(),
            });

            saveHostedRoom(newRoomId);
            navigate(`/room/${newRoomId}`);
        } catch (error) {
            console.error("Error creating room:", error);
            showToast(
                `Oh no, your room couldn't be created—${
                    error instanceof Error ? error.message : "and I don't even know why. 😔"
                }`,
                "error"
            );
        }
    };

    // Join existing room
    const joinRoom = async (): Promise<void> => {
        if (!roomId.trim()) {
            showToast("You can't barge into a wall! Please enter a room ID first.", "warning");
            return;
        }

        try {
            const roomRef = ref(db, `rooms/${roomId}`);
            const roomSnap = await get(roomRef);

            if (roomSnap.exists()) {
                navigate(`/room/${roomId}`);
            } else {
                showToast("I don't see your room anywhere. Wrong address? 🤔", "error");
            }
        } catch (error) {
            console.error("Error joining room:", error);
            showToast(
                `Oh no, I couldn't get you into this room—${
                    error instanceof Error ? error.message : "and I don't even know why. 😔"
                }`,
                "error"
            );
        }
    };

    // Rejoin hosted room (for hosts)
    const rejoinHostedRoom = async (roomIdToRejoin: string): Promise<void> => {
        try {
            const roomRef = ref(db, `rooms/${roomIdToRejoin}`);
            const roomSnap = await get(roomRef);

            if (roomSnap.exists()) {
                navigate(`/room/${roomIdToRejoin}`);
            } else {
                showToast(
                    "I don't see your room anywhere. Did you recently clear your browsing history? 🤔",
                    "error"
                );
                const updatedRooms = removeHostedRoomFromStorage(roomIdToRejoin);
                setHostedRooms(updatedRooms);
            }
        } catch (error) {
            console.error("Error rejoining room:", error);
            showToast(
                `Aw, you got locked out—${
                    error instanceof Error ? error.message : "and I don't even know why. 😔"
                }`,
                "error"
            );
        }
    };

    // Remove room from localStorage and delete from Firebase and R2
    const removeHostedRoom = async (roomId: string): Promise<void> => {
        try {
            // Get room data to find the video URL
            const roomRef = ref(db, `rooms/${roomId}`);
            const roomSnap = await get(roomRef);

            if (roomSnap.exists()) {
                const data = roomSnap.val() as RoomData;

                // Delete video from R2 if it exists and is hosted on R2
                if (data.videoUrl && data.videoUrl.includes(R2_PUBLIC_URL)) {
                    try {
                        // Extract the key from the URL
                        const key = data.videoUrl.replace(R2_PUBLIC_URL + "/", "");

                        if (!key || !key.startsWith("videos/")) {
                            console.error(
                                "Failed to extract valid video key from URL:",
                                data.videoUrl,
                                "Extracted key:",
                                key
                            );
                        } else {
                            const response = await fetch(`${WORKER_URL}/delete`, {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    Authorization: `Bearer ${UPLOAD_SECRET}`,
                                },
                                body: JSON.stringify({ key }),
                            });

                            if (!response.ok) {
                                const errorText = await response.text();
                                console.error(
                                    "Failed to delete video from R2. Status:",
                                    response.status,
                                    "Response:",
                                    errorText
                                );
                            }
                        }
                    } catch (error) {
                        console.error("Error deleting video from R2:", error);
                    }
                } else {
                    // console.log("Video URL is not hosted on R2, skipping deletion:", data.videoUrl);
                }

                // Delete subtitles from R2 if they exist and are hosted on R2
                if (data.subtitlesUrl && data.subtitlesUrl.includes(R2_PUBLIC_URL)) {
                    try {
                        // Extract the key from the URL
                        const key = data.subtitlesUrl.replace(R2_PUBLIC_URL + "/", "");

                        if (!key || !key.startsWith("subtitles/")) {
                            console.error(
                                "Failed to extract valid subtitle key from URL:",
                                data.subtitlesUrl,
                                "Extracted key:",
                                key
                            );
                        } else {
                            const response = await fetch(`${WORKER_URL}/delete`, {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    Authorization: `Bearer ${UPLOAD_SECRET}`,
                                },
                                body: JSON.stringify({ key }),
                            });

                            if (!response.ok) {
                                const errorText = await response.text();
                                console.error(
                                    "Failed to delete subtitles from R2. Status:",
                                    response.status,
                                    "Response:",
                                    errorText
                                );
                            }
                        }
                    } catch (error) {
                        console.error("Error deleting subtitles from R2:", error);
                    }
                } else if (data.subtitlesUrl) {
                    // console.log(
                    //     "Subtitles URL is not hosted on R2, skipping deletion:",
                    //     data.subtitlesUrl
                    // );
                }

                // Delete room from Firebase
                await remove(roomRef);
            }

            // Remove from localStorage
            const updatedRooms = removeHostedRoomFromStorage(roomId);
            setHostedRooms(updatedRooms);

            showToast(`Room "${roomId}" successfully demolished. 🚪💥🚜`, "success");
        } catch (error) {
            console.error("Error removing hosted room:", error);
            showToast(
                `Oh no, your room couldn't be demolished—${
                    error instanceof Error ? error.message : "and I don't even know why. 😔"
                }`,
                "error"
            );
        }
    };

    return (
        <div className="max-w-3xl mx-auto p-12 h-screen flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-8">
                <img src={iconImage} alt="sail2gether icon" className="h-12" />
                <div className="flex flex-col">
                    <h1 className="font-bold text-3xl">sail2gether</h1>
                    <p className="text-sm">v1.3.1</p>
                </div>

                <Link to="/faq" className="text-lg font-bold hover:underline mb-auto">
                    ?
                </Link>
                <div className="ml-auto">
                    <InstallPWA />
                </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
                <Button onClick={createRoom}>Create a room</Button>

                <span className="sm:mx-6 my-2">or</span>

                <div className="flex w-full flex-1 gap-2.5">
                    <TextInput
                        placeholder="Enter existing room ID"
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value)}
                    />
                    <Button onClick={joinRoom} title="Join an existing room">
                        Barge in!!!
                    </Button>
                </div>
            </div>

            {hostedRooms.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-xl font-semibold mt-6 mb-3">Rooms you hosted</h2>
                    <div className="flex flex-col gap-2.5 mt-2.5">
                        {hostedRooms.map((hostedRoomId) => (
                            <div key={hostedRoomId} className="flex items-center gap-2.5">
                                <span className="flex-1">{hostedRoomId}</span>
                                <Button onClick={() => rejoinHostedRoom(hostedRoomId)}>
                                    Rejoin
                                </Button>
                                <Button
                                    onClick={() => {
                                        setRoomToDelete(hostedRoomId);
                                        setDeleteModalOpen(true);
                                    }}
                                    variant="error"
                                    title="Delete room"
                                >
                                    Demolish
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="mt-8 p-4 border-2">
                <h3 className="font-bold text-lg mb-2">"Uhhhh, help!"</h3>
                <ol className="list-decimal list-inside space-y-1">
                    <li>
                        Click "Create a room" to start a new watch room, or barge into an existing
                        room!
                    </li>
                    <li>
                        If you chose to create a new room, upload a video file or paste a video URL.
                    </li>
                    <li>Share the room ID with friends. Enjoy your sail2gether-and-chill!</li>
                </ol>
                <p className="mt-2.5 text-sm">
                    <strong>Note:</strong> YouTube videos will display but synchronization is
                    limited (YouTube's restrictions 😔). For full sync support, use direct video
                    file URLs (.mp4, .webm, etc.)
                </p>
            </div>

            <Modal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={() => removeHostedRoom(roomToDelete)}
                title="Demolish this room 🚪🚜"
                message={`Are you sure you want to delete room "${roomToDelete}"? This will also delete the associated video from storage.`}
                confirmText="Yeah!!!"
                cancelText="Nope"
                confirmVariant="error"
            />
        </div>
    );
}

export default Home;
