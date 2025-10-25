import { useEffect, useRef } from "react";

import type { StyleVariant } from "@/types/style";

import Button from "@/components/button";

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm?: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    confirmVariant?: StyleVariant;
}

const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = "Confirm",
    cancelText = "Cancel",
    confirmVariant = "default",
}) => {
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        if (isOpen) {
            dialog.showModal();
        } else {
            dialog.close();
        }
    }, [isOpen]);

    const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        const rect = dialog.getBoundingClientRect();
        const isInDialog =
            rect.top <= e.clientY &&
            e.clientY <= rect.top + rect.height &&
            rect.left <= e.clientX &&
            e.clientX <= rect.left + rect.width;

        if (!isInDialog) {
            onClose();
        }
    };

    const handleConfirm = () => {
        if (onConfirm) {
            onConfirm();
        }
        onClose();
    };

    return (
        <dialog ref={dialogRef} className="modal" onClick={handleBackdropClick}>
            <div className="modal-box bg-white border-2 border-base-content max-w-md p-0">
                <div className="p-6">
                    <h3 className="font-bold text-lg mb-4">{title}</h3>
                    <p className="text-base">{message}</p>
                </div>
                <div className="modal-action p-6 pt-0 flex justify-end gap-2.5">
                    <Button onClick={onClose} variant="default">
                        {cancelText}
                    </Button>
                    {onConfirm && (
                        <Button onClick={handleConfirm} variant={confirmVariant}>
                            {confirmText}
                        </Button>
                    )}
                </div>
            </div>
        </dialog>
    );
};

export default Modal;
