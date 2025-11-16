import { useState, useEffect } from "react";
import Button from "./button";
import Modal from "./modal";

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function InstallPWA() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isInstallable, setIsInstallable] = useState<boolean>(false);
    const [isIOS, setIsIOS] = useState<boolean>(false);
    const [showIOSModal, setShowIOSModal] = useState<boolean>(false);

    useEffect(() => {
        // Check if iOS
        const iOS =
            /iPad|iPhone|iPod/.test(navigator.userAgent) &&
            !(window as Window & { MSStream?: unknown }).MSStream;
        setIsIOS(iOS);

        // Check if already installed
        const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
        const isIOSStandalone =
            (navigator as Navigator & { standalone?: boolean }).standalone === true;

        if (isStandalone || isIOSStandalone) {
            setIsInstallable(false);
            return;
        }

        // For iOS, show install button if not installed
        if (iOS) {
            setIsInstallable(true);
            return;
        }

        // For other browsers, listen for the beforeinstallprompt event
        const handler = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            setIsInstallable(true);
        };

        window.addEventListener("beforeinstallprompt", handler);

        return () => {
            window.removeEventListener("beforeinstallprompt", handler);
        };
    }, []);

    const handleInstallClick = async () => {
        // If iOS, show instructions modal
        if (isIOS) {
            setShowIOSModal(true);
            return;
        }

        // For other browsers, use the native prompt
        if (!deferredPrompt) {
            return;
        }

        deferredPrompt.prompt();
        // const { outcome } = await deferredPrompt.userChoice;

        // if (outcome === "accepted") {
        //     console.log("User accepted the install prompt");
        // } else {
        //     console.log("User dismissed the install prompt");
        // }

        setDeferredPrompt(null);
        setIsInstallable(false);
    };

    // Don't render anything if not installable
    if (!isInstallable) {
        return null;
    }

    return (
        <>
            <Button
                onClick={handleInstallClick}
                variant="info"
                title="Install the progressive web app on your device"
            >
                <span className="sm:hidden">PWA</span>
                <span className="hidden sm:inline">Install PWA</span>
            </Button>

            <Modal
                isOpen={showIOSModal}
                onClose={() => setShowIOSModal(false)}
                title="Oh, an iOS user! Instead of having an automatic install prompt, you have to read this and do it yourself!"
                message={
                    <div className="text-left">
                        <p>To install this app on your iPhone or iPad:</p>
                        <ol className="list-decimal list-inside space-y-2 pl-2 mt-3">
                            <li>
                                Tap the <strong>Share</strong> button{" "}
                                <span className="inline-flex items-center justify-center w-5 h-5">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                                        <polyline points="16 6 12 2 8 6" />
                                        <line x1="12" y1="2" x2="12" y2="15" />
                                    </svg>
                                </span>{" "}
                                in Safari's toolbar
                            </li>
                            <li>
                                Scroll down and tap <strong>Add to Home Screen</strong>
                            </li>
                            <li>
                                Tap <strong>Add</strong> in the top right corner
                            </li>
                        </ol>
                        <p className="mt-3">
                            Voilà, you won't have to open your browser and type the URL ever again!
                        </p>
                    </div>
                }
                cancelText="Gee, thanks"
            />
        </>
    );
}

export default InstallPWA;
