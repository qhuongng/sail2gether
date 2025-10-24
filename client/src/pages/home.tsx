import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ref, set, get, remove, serverTimestamp } from "firebase/database";
import { db } from "@/utils/firebase";
import { WORKER_URL, R2_PUBLIC_URL, UPLOAD_SECRET } from "@/constants/config";
import type { RoomData } from "@/types/room";
import {
    generateRoomId,
    loadHostedRooms,
    saveHostedRoom,
    removeHostedRoomFromStorage,
} from "@/utils/helpers";
import { useToastStore } from "@/store/toast-store";
import { Modal } from "@/components/modal";
import iconImage from "@/assets/icons/apple-touch-icon.png";

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
                `Failed to create room: ${
                    error instanceof Error ? error.message : "Unknown error"
                }`,
                "error"
            );
        }
    };

    // Join existing room
    const joinRoom = async (): Promise<void> => {
        if (!roomId.trim()) {
            showToast("Please enter a room ID", "warning");
            return;
        }

        try {
            const roomRef = ref(db, `rooms/${roomId}`);
            const roomSnap = await get(roomRef);

            if (roomSnap.exists()) {
                navigate(`/room/${roomId}`);
            } else {
                showToast("Room not found", "error");
            }
        } catch (error) {
            console.error("Error joining room:", error);
            showToast(
                `Failed to join room: ${error instanceof Error ? error.message : "Unknown error"}`,
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
                showToast("Room not found. It may have been deleted.", "error");
                const updatedRooms = removeHostedRoomFromStorage(roomIdToRejoin);
                setHostedRooms(updatedRooms);
            }
        } catch (error) {
            console.error("Error rejoining room:", error);
            showToast(
                `Failed to rejoin room: ${
                    error instanceof Error ? error.message : "Unknown error"
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
                    console.log("Video URL is not hosted on R2, skipping deletion:", data.videoUrl);
                }

                // Delete room from Firebase
                await remove(roomRef);
            }

            // Remove from localStorage
            const updatedRooms = removeHostedRoomFromStorage(roomId);
            setHostedRooms(updatedRooms);

            showToast(`Room "${roomId}" has been deleted successfully.`, "success");
        } catch (error) {
            console.error("Error removing hosted room:", error);
            showToast(
                `Failed to delete room: ${
                    error instanceof Error ? error.message : "Unknown error"
                }`,
                "error"
            );
        }
    };

    return (
        <div className="max-w-3xl mx-auto p-12 h-screen flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-8">
                <img src={iconImage} alt="sail2gether icon" className="h-12" />
                <h1 className="font-bold text-3xl">sail2gether</h1>
                <Link to="/faq" className="text-lg font-bold hover:underline mb-auto">
                    ?
                </Link>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
                <button
                    className="btn border-2 border-base-300 disabled:border-neutral-400! disabled:opacity-50 py-0 px-2"
                    onClick={createRoom}
                >
                    Create a room
                </button>

                <span className="sm:mx-6 my-2">or</span>

                <div className="flex w-full flex-1 gap-2.5">
                    <input
                        type="text"
                        placeholder="Enter room ID"
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value)}
                        className="w-full border-2 px-2 border-neutral-400 focus:border-base-300 focus:outline-0 placeholder:text-base-content placeholder:opacity-40"
                    />
                    <button
                        className="btn border-2 border-base-300 disabled:border-neutral-400! disabled:opacity-50 py-0 px-2"
                        onClick={joinRoom}
                    >
                        Join room
                    </button>
                </div>
            </div>

            {hostedRooms.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-xl font-semibold mt-6 mb-3">Previously hosted rooms</h2>
                    <div className="flex flex-col gap-2.5 mt-2.5">
                        {hostedRooms.map((hostedRoomId) => (
                            <div key={hostedRoomId} className="flex items-center gap-2.5">
                                <span className="flex-1">{hostedRoomId}</span>
                                <button
                                    className="btn border-2 border-base-300 disabled:border-neutral-400! disabled:opacity-50"
                                    onClick={() => rejoinHostedRoom(hostedRoomId)}
                                >
                                    Rejoin
                                </button>
                                <button
                                    className="btn border-2 border-error text-error disabled:border-neutral-400! disabled:opacity-50"
                                    onClick={() => {
                                        setRoomToDelete(hostedRoomId);
                                        setDeleteModalOpen(true);
                                    }}
                                >
                                    Delete
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="mt-8 p-4 border-2">
                <h3 className="font-bold text-lg mb-2">How to use</h3>
                <ol className="list-decimal list-inside space-y-1">
                    <li>Click "Create a room" to start a new watch room</li>
                    <li>Upload a video file or paste a video URL</li>
                    <li>Share the room ID with friends to watch together</li>
                </ol>
                <p className="mt-2.5 text-sm">
                    <strong>Note:</strong> YouTube videos will display but synchronization is
                    limited due to YouTube's restrictions. For full sync support, use direct video
                    file URLs (.mp4, .webm, etc.)
                </p>
            </div>

            <Modal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={() => removeHostedRoom(roomToDelete)}
                title="Delete room"
                message={`Are you sure you want to delete room "${roomToDelete}"? This will also delete the associated video from storage.`}
                confirmText="Delete"
                cancelText="Cancel"
                confirmVariant="error"
            />
        </div>
    );
}

export default Home;
