import { Outlet } from "react-router-dom";
import { ToastProvider } from "@/components/toast";
import { useToastStore } from "@/store/toast-store";

const RootLayout = () => {
    const { toasts, removeToast } = useToastStore();

    return (
        <div className="flex flex-col h-screen">
            <div id="layout-content" className="flex-1 overflow-auto">
                <Outlet />
            </div>
            <ToastProvider toasts={toasts} onClose={removeToast} />
        </div>
    );
};

export default RootLayout;
