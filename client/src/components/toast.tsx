import { useEffect } from "react";

export type ToastType = "success" | "error" | "info" | "warning" | "standard";

export interface ToastMessage {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastProps {
    toast: ToastMessage;
    onClose: (id: string) => void;
}

const Toast = ({ toast, onClose }: ToastProps) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose(toast.id);
        }, 5000); // Auto-dismiss after 5 seconds

        return () => clearTimeout(timer);
    }, [toast.id, onClose]);

    // Get variant classes based on type
    const getVariantClasses = (type: ToastType): string => {
        switch (type) {
            case "success":
                return "border-success text-success";
            case "error":
                return "border-error text-error";
            case "info":
                return "border-info text-info";
            case "warning":
                return "border-warning text-warning";
            case "standard":
            default:
                return "border-base-content text-base-content";
        }
    };

    // Get icon based on type
    const getIcon = (type: ToastType): React.ReactElement | null => {
        switch (type) {
            case "success":
                return (
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6 shrink-0 stroke-current"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                );
            case "error":
                return (
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6 shrink-0 stroke-current"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                );
            case "info":
                return (
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6 shrink-0 stroke-current"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                );
            case "warning":
                return (
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6 shrink-0 stroke-current"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                    </svg>
                );
            default:
                return null;
        }
    };

    return (
        <div
            className={`alert bg-white border-2 ${getVariantClasses(
                toast.type
            )} animate-[slide-in-right_0.1s_ease-out]`}
        >
            {getIcon(toast.type)}
            <span className="font-semibold">{toast.message}</span>
            <button
                onClick={() => onClose(toast.id)}
                className="btn btn-sm btn-ghost"
                aria-label="Close"
            >
                ✕
            </button>
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
