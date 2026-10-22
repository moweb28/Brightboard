import { Check, Settings as SettingsIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BackgroundPicker } from '../components/BackgroundPicker';
import { Room, type Room as RoomType } from '../lib/rtc';
import { useSettings, useT } from '../lib/settings';

/**
 * A pop-up that rises from its dock button over the call (chat, people, mic and camera choices).
 * Escape closes it; `light` ones (quick menus) also close when you click elsewhere.
 */
export function DockPop({ children, onClose, light, wide }: { children: ReactNode; onClose: () => void; light?: boolean; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    // The dock button that opened it toggles it itself, so clicks inside its anchor don't count as "elsewhere".
    const away = (e: MouseEvent) => light && !ref.current?.parentElement?.contains(e.target as Node) && onClose();
    document.addEventListener('keydown', esc);
    document.addEventListener('mousedown', away);
    return () => {
      document.removeEventListener('keydown', esc);
      document.removeEventListener('mousedown', away);
    };
  }, [onClose, light]);
  return (
    <div ref={ref} className={`dock-pop ${wide ? 'dock-pop-wide' : ''} ${light ? 'dock-pop-menu' : ''}`}>
      {children}
    </div>
  );
}

type Kind = 'videoinput' | 'audioinput' | 'audiooutput';
const KEY = { videoinput: 'cameraId', audioinput: 'micId', audiooutput: 'speakerId' } as const;

function useDeviceList(kinds: Kind[]) {
  const [lists, setLists] = useState<Partial<Record<Kind, MediaDeviceInfo[]>>>({});
  useEffect(() => {
    Promise.all(kinds.map((k) => Room.getLocalDevices(k, false).catch(() => []))).then((all) => setLists(Object.fromEntries(kinds.map((k, i) => [k, all[i]]))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return lists;
}

/** One list of devices to pick from; the choice applies to the live call right away. */
function DeviceList({ room, kind, title, list }: { room: RoomType; kind: Kind; title: string; list: MediaDeviceInfo[] | undefined }) {
  const t = useT();
  const { settings, set } = useSettings();
  if (!list) return null;
  const current = settings[KEY[kind]];
  const choose = (id: string) => {
    set(KEY[kind], id);
    room.switchActiveDevice(kind, id || 'default').catch(() => undefined);
  };
  const items = [{ id: '', label: t.settings.systemDefault }, ...list.filter((d) => d.deviceId && d.deviceId !== 'default').map((d, i) => ({ id: d.deviceId, label: d.label || `#${i + 1}` }))];
  return (
    <div className="pop-section">
      <div className="pop-title">{title}</div>
      {items.map((d) => (
        <button key={d.id || 'default'} className={`pop-row ${current === d.id ? 'is-active' : ''}`} role="menuitemradio" aria-checked={current === d.id} onClick={() => choose(d.id)}>
          <span className="pop-tick">{current === d.id && <Check size={15} />}</span>
          <span className="pop-label">{d.label}</span>
        </button>
      ))}
    </div>
  );
}

export function MicMenu({ room, onSettings }: { room: RoomType; onSettings: () => void }) {
  const t = useT();
  const lists = useDeviceList(['audioinput', 'audiooutput']);
  return (
    <div className="dock-menu" role="menu">
      <DeviceList room={room} kind="audioinput" title={t.settings.microphone} list={lists.audioinput} />
      {!!lists.audiooutput?.length && <DeviceList room={room} kind="audiooutput" title={t.settings.speaker} list={lists.audiooutput} />}
      <button className="pop-row pop-more" onClick={onSettings}>
        <span className="pop-tick">
          <SettingsIcon size={15} />
        </span>
        {t.meeting.audioVideoSettings}
      </button>
    </div>
  );
}

export function CamMenu({ room, onSettings }: { room: RoomType; onSettings: () => void }) {
  const t = useT();
  const lists = useDeviceList(['videoinput']);
  return (
    <div className="dock-menu" role="menu">
      <DeviceList room={room} kind="videoinput" title={t.settings.camera} list={lists.videoinput} />
      <div className="pop-section">
        <div className="pop-title">{t.settings.background}</div>
        <BackgroundPicker compact />
      </div>
      <button className="pop-row pop-more" onClick={onSettings}>
        <span className="pop-tick">
          <SettingsIcon size={15} />
        </span>
        {t.meeting.audioVideoSettings}
      </button>
    </div>
  );
}
