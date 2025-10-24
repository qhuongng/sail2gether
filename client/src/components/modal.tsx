import { useEffect, useRef } from "react";

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm?: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    confirmVariant?: "primary" | "error" | "success" | "warning";
}

export const Modal = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = "Confirm",
    cancelText = "Cancel",
    confirmVariant = "primary",
}: ModalProps) => {
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

    const getConfirmButtonClass = () => {
        const baseClass = "btn border-2 py-0 px-2";
        switch (confirmVariant) {
            case "error":
                return `${baseClass} border-error text-error hover:bg-error hover:text-white`;
            case "success":
                return `${baseClass} border-success text-success hover:bg-success hover:text-white`;
            case "warning":
                return `${baseClass} border-warning text-warning hover:bg-warning hover:text-white`;
            case "primary":
            default:
                return `${baseClass} border-base-300 hover:bg-base-300 hover:text-white`;
        }
    };

    return (
        <dialog ref={dialogRef} className="modal" onClick={handleBackdropClick}>
            <div className="modal-box bg-white border-2 border-base-content max-w-md p-0">
                <div className="p-6">
                    <h3 className="font-bold text-lg mb-4">{title}</h3>
                    <p className="text-base">{message}</p>
                </div>
                <div className="modal-action p-6 pt-0 flex justify-end gap-2.5">
                    <button onClick={onClose} className="btn border-2 border-base-300 py-0 px-2">
                        {cancelText}
                    </button>
                    {onConfirm && (
                        <button onClick={handleConfirm} className={getConfirmButtonClass()}>
                            {confirmText}
                        </button>
                    )}
                </div>
            </div>
        </dialog>
    );
};
