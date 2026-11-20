import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean };

export function MetalButton({ loading, children, disabled, className = "", ...rest }: Props) {
  const off = Boolean(disabled || loading);
  return (
    <button className={`cta ${className}`.trim()} disabled={off} {...rest}>
      <span>{loading ? "Записываем…" : children}</span>
    </button>
  );
}
