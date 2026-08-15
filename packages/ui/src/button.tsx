import type { ButtonHTMLAttributes } from 'react';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'primary' | 'quiet';
};

export function Button({
  className = '',
  tone = 'primary',
  type = 'button',
  ...props
}: ButtonProps) {
  const toneClass =
    tone === 'primary'
      ? 'app-button-primary border border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_8px_20px_color-mix(in_srgb,var(--accent)_24%,transparent)] hover:-translate-y-0.5 hover:border-[var(--accent-hover)] hover:bg-[var(--accent-hover)]'
      : 'app-button-quiet border border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--text)] shadow-sm hover:-translate-y-0.5 hover:border-[var(--text)] hover:bg-[var(--surface-hover)]';

  return (
    <button
      className={`app-button inline-flex min-h-11 items-center justify-center rounded-xl px-5 py-2 text-sm font-bold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50 ${toneClass} ${className}`}
      type={type}
      {...props}
    />
  );
}
