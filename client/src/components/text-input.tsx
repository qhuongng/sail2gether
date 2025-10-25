interface TextInputProps {
    placeholder?: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    className?: string;
}

const TextInput: React.FC<TextInputProps> = ({ placeholder, value, onChange, className }) => {
    return (
        <input
            type="text"
            placeholder={placeholder}
            value={value}
            onChange={onChange}
            className={`w-full border-2 px-2 border-neutral-400 focus:border-base-300 text-sm focus:outline-0 placeholder:text-base-content placeholder:opacity-40 ${className}`}
        />
    );
};

export default TextInput;
