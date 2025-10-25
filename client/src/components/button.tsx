interface ButtonProps {
    children?: React.ReactNode;
    onClick?: () => void;
    square?: boolean;
    variant?: "default" | "success" | "error" | "info" | "warning";
    disabled?: boolean;
    borderless?: boolean;
    title?: string;
    className?: string;
}

const Button: React.FC<ButtonProps> = ({
    children,
    onClick,
    variant = "default",
    disabled = false,
    square = false,
    borderless = false,
    title,
    className,
}) => {
    const variantClasses = {
        default: "border-base-300 text-base-300 hover:bg-base-400",
        success: "border-success text-success hover:bg-success/10",
        error: "border-error text-error hover:bg-error/10",
        info: "border-info text-info hover:bg-info/10",
        warning: "border-warning text-warning hover:bg-warning/10",
    };

    return (
        <button
            className={`btn ${square ? "btn-square" : "py-0 px-2"} ${
                borderless ? "border-0" : "border-2"
            } ${variantClasses[variant]} disabled:border-neutral-400! disabled:text-neutral-400! ${
                className ? className : ""
            }`}
            onClick={onClick}
            disabled={disabled}
            title={title}
        >
            {children}
        </button>
    );
};

export default Button;
