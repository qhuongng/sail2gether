import { useEffect } from "react";

import { Success, Error, Info, Warning } from "@/constants/svg/toast";
import type { StyleVariant } from "@/types/style";

import Button from "@/components/button";

export interface ToastMessage {
    id: string;
    message: string;
    variant: StyleVariant;
}

interface ToastProps {
    toast: ToastMessage;
    onClose: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose(toast.id);
        }, 5000); // Auto-dismiss after 5 seconds

        return () => clearTimeout(timer);
    }, [toast.id, onClose]);

    // Get variant classes based on variant
    const getVariantClasses = (variant: StyleVariant): string => {
        switch (variant) {
            case "success":
                return "border-success text-success";
            case "error":
                return "border-error text-error";
            case "info":
                return "border-info text-info";
            case "warning":
                return "border-warning text-warning";
            case "default":
            default:
                return "border-base-300 text-base-content";
        }
    };

    // Get icon based on variant
    const getIcon = (variant: StyleVariant): React.ReactElement | null => {
        switch (variant) {
            case "success":
                return Success;
            case "error":
                return Error;
            case "info":
                return Info;
            case "warning":
                return Warning;
            default:
                return null;
        }
    };

    return (
        <div
            className={`alert bg-white border-2 ${getVariantClasses(
                toast.variant
            )} animate-[slide-in-right_0.1s_ease-out]`}
        >
            {getIcon(toast.variant)}
            <span className="font-semibold">{toast.message}</span>
            <Button onClick={() => onClose(toast.id)} square borderless variant={toast.variant}>
                ✕
            </Button>
        </div>
    );
};

interface ToastContainerProps {
    toasts: ToastMessage[];
    onClose: (id: string) => void;
}

export const ToastProvider = ({ toasts, onClose }: ToastContainerProps) => {
    return (
        <div className="toast toast-end toast-bottom z-50">
            {toasts.map((toast) => (
                <Toast key={toast.id} toast={toast} onClose={onClose} />
            ))}
        </div>
    );
};
