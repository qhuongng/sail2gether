import { useRef, useEffect, useState, useCallback } from "react";

import {
    Play,
    Pause,
    Mute,
    Unmute,
    LowVolume,
    VolumeUp,
    VolumeDown,
    Fullscreen,
    ExitFullscreen,
    ClosedCaptions,
} from "@/constants/svg/video-player";
import { formatVideoTime } from "@/utils/helpers";

import Button from "@/components/button";

interface VideoPlayerProps {
    source: string;
    subtitlesUrl?: string;
    videoRef: React.RefObject<HTMLVideoElement | null> | null;
    onPlay: () => void;
    onPause: () => void;
    onSeeked: (time: number) => void;
    isHost: boolean;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
    source,
    subtitlesUrl,
    videoRef,
    onPlay,
    onPause,
    onSeeked,
    isHost,
}) => {
    const videoContainerRef = useRef<HTMLElement>(null);
    const videoControlsRef = useRef<HTMLDivElement>(null);
    const progressRef = useRef<HTMLProgressElement>(null);
    const hideControlsTimeoutRef = useRef<number | null>(null);

    const [controlsVisible, setControlsVisible] = useState(false);
    const [fullscreenSupported, setFullscreenSupported] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [progressValue, setProgressValue] = useState(0);
    const [progressMax, setProgressMax] = useState(0);
    const [showControls, setShowControls] = useState(true);
    const [tooltipVisible, setTooltipVisible] = useState(false);
    const [tooltipTime, setTooltipTime] = useState(0);
    const [tooltipPosition, setTooltipPosition] = useState(0);
    const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
    const [timeDisplayWidth, setTimeDisplayWidth] = useState("");

    // Initialize subtitle track state
    useEffect(() => {
        const video = videoRef?.current;
        if (!video) return;

        const handleTrackLoad = () => {
            if (video.textTracks && video.textTracks.length > 0) {
                const track = video.textTracks[0];
                // Initially disable subtitles
                track.mode = "hidden";
                setSubtitlesEnabled(false);
            }
        };

        // Set initial state
        handleTrackLoad();

        // Listen for track changes
        video.addEventListener("loadedmetadata", handleTrackLoad);

        return () => {
            video.removeEventListener("loadedmetadata", handleTrackLoad);
        };
    }, [videoRef, subtitlesUrl]);

    // Update subtitle cues when controls visibility changes
    useEffect(() => {
        const video = videoRef?.current;
        if (!video || !subtitlesUrl) return;

        // Position cues up when controls are visible
        const linePosition = showControls ? (isFullscreen ? -3 : -4) : -1;

        if (video.textTracks && video.textTracks.length > 0) {
            const track = video.textTracks[0];

            // Update ALL cues (including future ones that haven't appeared yet)
            if (track.cues && track.cues.length > 0) {
                // Store the current track mode to restore it later
                const currentMode = track.mode;

                // Only update cues that need updating (check if already at correct position)
                let needsUpdate = false;
                Array.from(track.cues).forEach((cue) => {
                    const vttCue = cue as VTTCue;
                    if (vttCue.line !== linePosition) {
                        vttCue.line = linePosition;
                        needsUpdate = true;
                    }
                });

                // Only force re-render if we actually updated cues and track is showing
                if (needsUpdate && currentMode === "showing") {
                    track.mode = "hidden";
                    // Use requestAnimationFrame to ensure the browser processes the mode change
                    requestAnimationFrame(() => {
                        track.mode = "showing";
                    });
                }
            }
        }
    }, [showControls, videoRef, subtitlesUrl, isFullscreen]);

    useEffect(() => {
        const video = videoRef?.current;

        if (!video) return;

        const handleLoadedMetadata = () => {
            if (timeDisplayWidth === "" && Number.isFinite(video.duration)) {
                // Calculate the width for the time display based on max video duration
                const duration = String(formatVideoTime(video.duration));
                setTimeDisplayWidth(duration.length * 2 + 3 + "ch"); // Account for the slash
            }
        };

        // If metadata is already loaded, calculate immediately
        if (Number.isFinite(video.duration) && timeDisplayWidth === "") {
            const duration = String(formatVideoTime(video.duration));
            setTimeDisplayWidth(duration.length * 2 + 3 + "ch");
        } else {
            // Otherwise, wait for the event
            video.addEventListener("loadedmetadata", handleLoadedMetadata);
        }

        return () => {
            video.removeEventListener("loadedmetadata", handleLoadedMetadata);
        };
    }, [videoRef, timeDisplayWidth]);

    useEffect(() => {
        const video = videoRef?.current;

        if (!video) return;

        // Hide the default video controls
        video.controls = false;

        // Display the user defined video controls
        setControlsVisible(true);

        // Check if fullscreen is supported
        if (!document?.fullscreenEnabled) {
            setFullscreenSupported(false);
        }

        // loadedmetadata event handler
        const handleLoadedMetadata = () => {
            setProgressMax(video.duration);
        };

        // timeupdate event handler
        const handleTimeUpdate = () => {
            // Set max if not already set (fallback for mobile browsers)
            if (progressMax === 0) {
                setProgressMax(video.duration);
            }
            setProgressValue(video.currentTime);
        };

        video.addEventListener("loadedmetadata", handleLoadedMetadata);
        video.addEventListener("timeupdate", handleTimeUpdate);

        // Cleanup
        return () => {
            video.removeEventListener("loadedmetadata", handleLoadedMetadata);
            video.removeEventListener("timeupdate", handleTimeUpdate);
        };
    }, [videoRef, progressMax]);

    const getControlIcon = (
        control: string,
        videoRef: React.RefObject<HTMLVideoElement | null> | null
    ) => {
        const video = videoRef?.current;
        if (!video) return null;

        switch (control) {
            case "mute":
                if (video.muted || video.volume === 0) {
                    return Unmute;
                } else if (video.volume < 0.5) {
                    return LowVolume;
                } else {
                    return Mute;
                }
            case "play-pause":
                return video.paused ? Play : Pause;
            default:
                return null;
        }
    };

    const handlePlayPause = useCallback(() => {
        const video = videoRef?.current;
        if (!video) return;

        if (video.paused || video.ended) {
            video.play();
        } else {
            video.pause();
        }
    }, [videoRef]);

    const handleMute = useCallback(() => {
        const video = videoRef?.current;
        if (!video) return;

        // If currently muted, unmute
        if (video.muted) {
            video.muted = false;

            // If volume is less than 0.1 when unmuting, set it to 0.1
            if (video.volume < 0.1) {
                video.volume = 0.1;
            }
        } else {
            video.muted = true;
        }
    }, [videoRef]);

    const alterVolume = (dir: "+" | "-") => {
        const video = videoRef?.current;
        if (!video) return;

        const currentVolume = Math.floor(video.volume * 10) / 10;

        if (dir === "+" && currentVolume < 1 && video.volume < 1) {
            // If the video is muted, unmute it, but don't change volume
            if (video.muted) {
                video.muted = false;

                if (video.volume < 0.1) {
                    video.volume = 0.1;
                }
            } else {
                video.volume += 0.1;
            }
        } else if (dir === "-" && currentVolume > 0) {
            video.volume -= 0.1;

            // After decreasing volume, if it goes below 0.1, mute the video
            if (video.volume < 0.1) {
                video.muted = true;
            }
        }
    };

    const handleProgressClick = (e: React.MouseEvent<HTMLProgressElement>) => {
        const video = videoRef?.current;
        const progress = progressRef.current;
        if (!video || !progress) return;

        if (!Number.isFinite(video.duration)) return;

        const rect = progress.getBoundingClientRect();
        const pos = (e.pageX - rect.left) / progress.offsetWidth;
        video.currentTime = pos * video.duration;
    };

    const handleProgressMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const progress = progressRef.current;
        if (!progress || !Number.isFinite(progressMax)) return;

        const rect = progress.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        const time = pos * progressMax;

        setTooltipVisible(true);
        setTooltipTime(time);
        setTooltipPosition(e.clientX - rect.left);
    };

    const handleProgressMouseLeave = () => {
        setTooltipVisible(false);
    };

    const handleFullscreen = useCallback(() => {
        const videoContainer = videoContainerRef.current;
        if (!videoContainer) return;

        if (document.fullscreenElement) {
            // The document is in fullscreen mode
            document.exitFullscreen();
        } else {
            // The document is not in fullscreen mode
            videoContainer.requestFullscreen();
        }
    }, []);

    const toggleSubtitles = useCallback(() => {
        const video = videoRef?.current;
        if (!video || !video.textTracks || video.textTracks.length === 0) return;

        const track = video.textTracks[0];
        if (track.mode === "showing") {
            track.mode = "hidden";
            setSubtitlesEnabled(false);
        } else {
            track.mode = "showing";
            setSubtitlesEnabled(true);
        }
    }, [videoRef]);

    const seekForward = useCallback(() => {
        const video = videoRef?.current;
        if (!video) return;
        video.currentTime = Math.min(video.currentTime + 5, video.duration);
    }, [videoRef]);

    const seekBackward = useCallback(() => {
        const video = videoRef?.current;
        if (!video) return;
        video.currentTime = Math.max(video.currentTime - 5, 0);
    }, [videoRef]);

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            event.preventDefault();

            switch (event.key) {
                case " ":
                    if (!isHost) return;
                    handlePlayPause();
                    break;
                case "ArrowRight":
                    if (!isHost) return;
                    seekForward();
                    break;
                case "ArrowLeft":
                    if (!isHost) return;
                    seekBackward();
                    break;
                case "f":
                    handleFullscreen();
                    break;
                case "m":
                    handleMute();
                    break;
                default:
                    break;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handlePlayPause, seekForward, seekBackward, handleFullscreen, handleMute, isHost]);

    // Handle mouse movement for controls fade-out
    useEffect(() => {
        const container = videoContainerRef.current;
        if (!container) return;

        const resetHideTimeout = () => {
            setShowControls(true);

            if (hideControlsTimeoutRef.current !== null) {
                clearTimeout(hideControlsTimeoutRef.current);
            }

            hideControlsTimeoutRef.current = window.setTimeout(() => {
                setShowControls(false);
            }, 3000);
        };

        const handleMouseMove = () => {
            resetHideTimeout();
        };

        const handleMouseLeave = () => {
            if (hideControlsTimeoutRef.current !== null) {
                clearTimeout(hideControlsTimeoutRef.current);
            }
            setShowControls(false);
        };

        container.addEventListener("mousemove", handleMouseMove);
        container.addEventListener("mouseleave", handleMouseLeave);

        // Initial timeout
        resetHideTimeout();

        return () => {
            container.removeEventListener("mousemove", handleMouseMove);
            container.removeEventListener("mouseleave", handleMouseLeave);
            if (hideControlsTimeoutRef.current !== null) {
                clearTimeout(hideControlsTimeoutRef.current);
            }
        };
    }, []);

    // Handle fullscreen change events
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener("fullscreenchange", handleFullscreenChange);
        document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
        document.addEventListener("mozfullscreenchange", handleFullscreenChange);
        document.addEventListener("msfullscreenchange", handleFullscreenChange);

        return () => {
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
            document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
            document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
            document.removeEventListener("msfullscreenchange", handleFullscreenChange);
        };
    }, []);

    return (
        <figure
            ref={videoContainerRef}
            className="relative border-2 border-base-300"
            style={{
                display: isFullscreen ? "flex" : "block",
                alignItems: isFullscreen ? "center" : "initial",
                justifyContent: isFullscreen ? "center" : "initial",
                backgroundColor: isFullscreen ? "black" : "transparent",
            }}
        >
            <video
                ref={videoRef}
                controls
                crossOrigin="anonymous"
                preload="metadata"
                onPlay={onPlay}
                onPause={onPause}
                onSeeked={(e) => onSeeked && onSeeked(e.currentTarget.currentTime)}
                className="w-full h-auto"
                style={{
                    objectFit: "contain",
                }}
            >
                <source src={source} />
                {subtitlesUrl && (
                    <track kind="subtitles" src={subtitlesUrl} srcLang="en" label="English" />
                )}
            </video>

            {/* Player controls */}
            <div
                ref={videoControlsRef}
                data-state={controlsVisible ? "visible" : "hidden"}
                id="video-controls"
                className={`flex items-center p-2 gap-2 bg-base-100 absolute bottom-0 left-0 right-0 border-t-2 border-base-300 transition-opacity duration-100 overflow-visible ${
                    showControls ? "opacity-100" : "opacity-0 pointer-events-none"
                }`}
            >
                {/** Play/Pause button */}
                {isHost && (
                    <Button onClick={handlePlayPause} square borderless title="Play/Pause">
                        {getControlIcon("play-pause", videoRef)}
                    </Button>
                )}

                {/* Time display */}
                <div
                    className={`text-sm whitespace-nowrap ${isHost ? "" : "ml-1"}`}
                    style={{ minWidth: timeDisplayWidth }}
                >
                    {formatVideoTime(progressValue)} / {formatVideoTime(progressMax)}
                </div>

                <div className="w-full relative">
                    {/* Seek tooltip */}
                    {tooltipVisible && (
                        <div
                            className="absolute bottom-full mb-2 px-2 py-1 border-2 border-base-300 bg-base-100 text-xs pointer-events-none whitespace-nowrap z-50"
                            style={{
                                left: `${tooltipPosition}px`,
                                transform: "translateX(-50%)",
                            }}
                        >
                            {formatVideoTime(tooltipTime)}
                        </div>
                    )}

                    {/* Progress bar */}
                    <div
                        className="progress w-full ml-auto h-5 border-2 border-base-300 overflow-hidden"
                        onMouseMove={handleProgressMouseMove}
                        onMouseLeave={handleProgressMouseLeave}
                    >
                        <progress
                            id="progress"
                            ref={progressRef}
                            value={progressValue}
                            max={progressMax}
                            onClick={isHost ? handleProgressClick : undefined}
                            className={`progress progress-success w-full h-5 ${
                                isHost ? "cursor-pointer" : ""
                            }`}
                        >
                            <span id="progress-bar"></span>
                        </progress>
                    </div>
                </div>

                {/* Volume down */}

                <Button onClick={() => alterVolume("-")} square borderless title="Volume down">
                    {VolumeDown}
                </Button>

                <Button onClick={handleMute} square borderless title="Mute/Unmute">
                    {getControlIcon("mute", videoRef)}
                </Button>

                <Button onClick={() => alterVolume("+")} square borderless title="Volume up">
                    {VolumeUp}
                </Button>

                {subtitlesUrl && (
                    <Button
                        onClick={toggleSubtitles}
                        square
                        borderless
                        title="Toggle subtitles"
                        variant={subtitlesEnabled ? "info" : "default"}
                    >
                        {ClosedCaptions}
                    </Button>
                )}

                {fullscreenSupported && (
                    <Button onClick={handleFullscreen} square borderless title="Toggle fullscreen">
                        {isFullscreen ? ExitFullscreen : Fullscreen}
                    </Button>
                )}
            </div>
        </figure>
    );
};

export default VideoPlayer;
