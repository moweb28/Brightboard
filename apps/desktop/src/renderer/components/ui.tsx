import { Check, Loader2, X, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { initials } from '../lib/format';
import { useT } from '../lib/settings';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  loading?: boolean;
  block?: boolean;
};

export function Button({ variant = 'primary', size = 'md', icon: Icon, loading, block, children, className = '', disabled, ...rest }: ButtonProps) {
  return (
    <button className={`btn btn-${variant} btn-${size} ${block ? 'btn-block' : ''} ${className}`} disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 className="spin" size={18} /> : Icon && <Icon size={size === 'sm' ? 16 : 18} strokeWidth={2.2} />}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({ icon: Icon, label, className = '', ...rest }: { icon: LucideIcon; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`icon-btn ${className}`} aria-label={label} title={label} {...rest}>
      <Icon size={18} strokeWidth={2.2} />
    </button>
  );
}

export function Field({ label, hint, error, ...input }: { label: string; hint?: string; error?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`field ${error ? 'field-error' : ''}`}>
      <span className="field-label">{label}</span>
      <input {...input} />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Toggle({ label, description, checked, onChange, disabled }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`toggle-row ${disabled ? 'is-disabled' : ''}`}>
      <span className="toggle-text">
        <span className="toggle-label">{label}</span>
        {description && <span className="toggle-desc">{description}</span>}
      </span>
      <span className="switch">
        <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="switch-track" aria-hidden />
      </span>
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: LucideIcon }[]; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(({ value: v, label: l, icon: Icon }) => (
        <button key={v} role="radio" aria-checked={v === value} className={v === value ? 'is-active' : ''} onClick={() => onChange(v)} type="button">
          {Icon && <Icon size={16} />}
          {l}
        </button>
      ))}
    </div>
  );
}

export function ColorPicker({ colors, value, onChange, label }: { colors: readonly string[]; value: string; onChange: (c: string) => void; label: string }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="color-row" role="radiogroup" aria-label={label}>
        {colors.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={c === value} aria-label={c} className="color-dot" style={{ background: c }} onClick={() => onChange(c)}>
            {c === value && <Check size={16} color="#fff" strokeWidth={3} />}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Avatar({ name, color, size = 40, ring }: { name: string; color: string; size?: number; ring?: boolean }) {
  return (
    <span className={`avatar ${ring ? 'avatar-ring' : ''}`} style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.38) }} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'live' | 'accent' | 'warn'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={28} />
      </span>
      <h3>{title}</h3>
      <p className="muted">{text}</p>
      {action}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <IconButton icon={X} label={t.common.close} onClick={onClose} />
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export interface MenuItem {
  icon?: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
  hidden?: boolean;
}

/** A button that opens a small popover menu. */
export function Menu({ trigger, items, align = 'end', up }: { trigger: (open: () => void, isOpen: boolean) => ReactNode; items: MenuItem[]; align?: 'start' | 'end'; up?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="menu-anchor" ref={ref}>
      {trigger(() => setOpen((o) => !o), open)}
      {open && (
        <div className={`menu menu-${align} ${up ? 'menu-up' : ''}`} role="menu">
          {items
            .filter((i) => !i.hidden)
            .map(({ icon: Icon, label, onClick, danger }) => (
              <button
                key={label}
                role="menuitem"
                className={`menu-item ${danger ? 'is-danger' : ''}`}
                onClick={() => {
                  setOpen(false);
                  onClick();
                }}
              >
                {Icon && <Icon size={17} />}
                {label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

export function ErrorText({ code }: { code: string | null }) {
  const t = useT();
  if (!code) return null;
  return (
    <p className="error" role="alert">
      {t.errors[code] ?? t.errors.generic}
    </p>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner-wrap" role="status">
      <Loader2 className="spin" size={28} />
      {label && <span className="muted">{label}</span>}
    </div>
  );
}
