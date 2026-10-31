import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, X } from "lucide-react";
import type { Person } from "../db";

const COLORS = ["#ff4f83", "#2d6bff", "#00a878", "#ff7a00", "#7a3ff2", "#00b4d8", "#ffd000", "#e5383b"];

function hash(text: string): number {
  let value = 0;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value;
}

export function colorFor(id: string): string {
  return COLORS[hash(id) % COLORS.length];
}

// Black or white, whichever reads better on the colour.
export function inkOn(hex: string): string {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0) > 0.179 ? "#14120e" : "#ffffff";
}

// Big money must never overflow a small phone, so the type shrinks to fit the digits.
export function fitSize(text: string, max: number): string {
  return `min(${max}px, calc((min(100vw, 460px) - 48px) / ${(text.length * 0.68).toFixed(2)}))`;
}

export function Avatar({ person, size = 44 }: { person?: Person; size?: number }) {
  const background = colorFor(person?.id ?? "x");
  return (
    <span aria-hidden className="inline-grid shrink-0 place-items-center rounded-full font-extrabold" style={{ width: size, height: size, background, color: inkOn(background), fontSize: size * 0.42 }}>
      {person?.emoji || (person?.name ?? "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "ink" | "sun" | "plain" | "danger" };

export function Button({ tone = "ink", className = "", ...props }: ButtonProps) {
  const tones = {
    ink: "bg-ink text-white disabled:bg-line disabled:text-soft",
    sun: "bg-sun text-ink disabled:bg-line disabled:text-soft",
    plain: "bg-wash text-ink",
    danger: "bg-white text-owe ring-2 ring-owe",
  };
  return <button type="button" className={`min-h-12 rounded-2xl px-5 text-[17px] font-bold transition-transform active:scale-[.98] ${tones[tone]} ${className}`} {...props} />;
}

export function BackLink({ to, label, color }: { to: string; label: string; color?: string }) {
  return (
    <Link to={to} aria-label={label} className="-ml-2 grid size-11 place-items-center rounded-full" style={{ color }}>
      <ChevronLeft size={28} strokeWidth={2.75} />
    </Link>
  );
}

export function Sheet({ open, onClose, title, tall, children }: { open: boolean; onClose: () => void; title: string; tall?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  if (!open) return null;
  return (
    <dialog ref={ref} aria-label={title} className={`sheet ${tall ? "tall" : ""}`} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === ref.current) onClose(); }}>
      {children}
    </dialog>
  );
}

export function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-5 pt-4 pb-2">
      <h2 className="display text-[24px]">{title}</h2>
      <button type="button" aria-label="Close" onClick={onClose} className="-mr-2 grid size-11 place-items-center rounded-full"><X size={24} strokeWidth={2.5} /></button>
    </div>
  );
}

type Toast = { message: string; undo?: () => unknown };
type ToastApi = { show: (message: string, undo?: Toast["undo"]) => void };

const ToastContext = createContext<ToastApi>({ show: () => undefined });
export const useToast = () => useContext(ToastContext);

export const UNDO_MS = 10000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback<ToastApi["show"]>((message, undo) => {
    clearTimeout(timer.current);
    setToast({ message, undo });
    navigator.vibrate?.(12);
    timer.current = setTimeout(() => setToast(null), undo ? UNDO_MS : 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 mx-auto flex max-w-[460px] justify-center px-4">
        {toast && (
          <div className="toast pointer-events-auto flex min-h-12 items-center gap-1 rounded-2xl bg-ink pl-5 pr-1.5 text-[16px] font-semibold text-white shadow-lg">
            <span className="py-3">{toast.message}</span>
            {toast.undo && (
              <button type="button" className="ml-2 min-h-11 rounded-xl px-4 font-extrabold text-sun" onClick={() => { void toast.undo?.(); setToast(null); }}>Undo</button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[15px] font-semibold text-soft">{label}</span>
      {children}
    </label>
  );
}

export const inputClass = "min-h-12 w-full rounded-xl border-2 border-line bg-white px-3.5 text-[17px] font-medium focus:border-ink";
