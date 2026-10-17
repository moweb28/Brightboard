import { Check, LayoutGrid, PanelBottom, PanelRight, SquareUserRound, VideoOff, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSettings, useT, type VideoStrip } from '../lib/settings';
import type { Layout } from './Stage';

/**
 * Dock menu for how the call looks (just for you): everyone the same size or whoever is talking
 * big, and where the other videos go next to a board, screen or speaker.
 */
export function LayoutMenu({ layout, setLayout }: { layout: Layout; setLayout(l: Layout): void }) {
  const t = useT();
  const { settings, set } = useSettings();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const views: [Layout, LucideIcon, string][] = [
    ['grid', LayoutGrid, t.meeting.grid],
    ['speaker', SquareUserRound, t.meeting.speaker],
  ];
  const strips: [VideoStrip, LucideIcon, string][] = [
    ['side', PanelRight, t.meeting.stripSide],
    ['bottom', PanelBottom, t.meeting.stripBottom],
    ['hidden', VideoOff, t.meeting.stripHidden],
  ];
  const Row = ({ on, icon: Icon, label, onClick }: { on: boolean; icon: LucideIcon; label: string; onClick(): void }) => (
    <button className={`layout-row ${on ? 'is-on' : ''}`} role="menuitemradio" aria-checked={on} onClick={onClick}>
      <Icon size={17} />
      <span>{label}</span>
      {on && <Check size={16} className="layout-check" />}
    </button>
  );

  return (
    <div className="menu-anchor" ref={ref}>
      <button className={`dock-btn ${open ? 'is-active' : ''}`} onClick={() => setOpen((o) => !o)} aria-label={t.meeting.layout} data-tip={t.meeting.layout} aria-expanded={open}>
        <LayoutGrid size={21} strokeWidth={2.2} />
      </button>
      {open && (
        <div className="menu menu-start menu-up layout-menu" role="menu">
          <p className="layout-title">{t.meeting.layoutMain}</p>
          {views.map(([v, icon, label]) => (
            <Row key={v} on={layout === v} icon={icon} label={label} onClick={() => setLayout(v)} />
          ))}
          <p className="layout-title">{t.meeting.layoutOthers}</p>
          {strips.map(([s, icon, label]) => (
            <Row key={s} on={settings.videoStrip === s} icon={icon} label={label} onClick={() => set('videoStrip', s)} />
          ))}
        </div>
      )}
    </div>
  );
}
