import type { LucideIcon } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface Toast {
  id: number;
  text: string;
  icon?: LucideIcon;
  tone?: 'info' | 'success' | 'warn';
  action?: { label: string; onClick: () => void };
}

const ToastContext = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = (id: number) => setToasts((list) => list.filter((t) => t.id !== id));
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = nextId++;
    setToasts((list) => [...list.slice(-3), { ...t, id }]);
    setTimeout(() => dismiss(id), t.action ? 8000 : 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map(({ id, text, icon: Icon, tone = 'info', action }) => (
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
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
