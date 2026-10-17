import { X, type LucideIcon } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface Toast {
  id: number;
  text: string;
  icon?: LucideIcon;
  tone?: 'info' | 'success' | 'warn';
  action?: { label: string; onClick: () => void };
  /** A toast with a key replaces an earlier one with the same key, and can be closed with useToastDismiss. */
  key?: string;
  /** Stays until acted on, closed, or dismissed by key (for things that need an answer, like the waiting room). */
  sticky?: boolean;
}

const ToastContext = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});
const DismissContext = createContext<(key: string) => void>(() => {});
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = (id: number) => setToasts((list) => list.filter((t) => t.id !== id));
  const dismissKey = useCallback((key: string) => setToasts((list) => list.filter((t) => t.key !== key)), []);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = nextId++;
    setToasts((list) => {
      const rest = t.key ? list.filter((x) => x.key !== t.key) : list;
      // Keep sticky toasts; drop the oldest passing ones when there are too many.
      const passing = rest.filter((x) => !x.sticky);
      const drop = new Set(passing.slice(0, Math.max(0, rest.length - 3)).map((x) => x.id));
      return [...rest.filter((x) => !drop.has(x.id)), { ...t, id }];
    });
    if (!t.sticky) setTimeout(() => dismiss(id), t.action ? 8000 : 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      <DismissContext.Provider value={dismissKey}>
        {children}
        <div className="toasts" aria-live="polite">
          {toasts.map(({ id, text, icon: Icon, tone = 'info', action, sticky }) => (
            <div key={id} className={`toast toast-${tone}`}>
              {Icon && <Icon size={18} />}
              <span>{text}</span>
              {action && (
                <button
                  className="toast-action"
                  onClick={() => {
                    action.onClick();
                    dismiss(id);
                  }}
                >
                  {action.label}
                </button>
              )}
              {sticky && (
                <button className="toast-close" aria-label="Close" onClick={() => dismiss(id)}>
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </DismissContext.Provider>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
/** Closes the toast with this key, if it's showing. */
export const useToastDismiss = () => useContext(DismissContext);
