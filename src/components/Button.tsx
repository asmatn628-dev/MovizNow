import React from 'react';
import { Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'emerald' | 'cyan';
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  loading,
  variant = 'primary',
  icon,
  className,
  disabled,
  ...props
}) => {
  const variants = {
    primary: 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100',
    secondary: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700',
    danger: 'bg-red-500 text-white hover:bg-red-600',
    ghost: 'bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400',
    emerald: 'bg-emerald-500 hover:bg-emerald-600 text-white',
    cyan: 'bg-cyan-600 hover:bg-cyan-700 text-white',
  };

  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        'flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 disabled:cursor-not-allowed',
        variants[variant],
        className
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
};
