import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> { }

export function Input({ className = '', ...props }: InputProps) {
    return (
        <input
            className={`w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-2 text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-[rgb(var(--color-surface))] ${className}`}
            {...props}
        />
    );
}
