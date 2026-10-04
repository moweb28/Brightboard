import { AppWindow, Monitor, MonitorUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ScreenSource } from '../../preload';
import { Button, Modal, Segmented, Spinner, Toggle } from '../components/ui';
import { useT } from '../lib/settings';

/** Our own "what do you want to share?" dialog. Nothing is captured until the user presses Share. */
export function ScreenPicker({ onCancel, onShare }: { onCancel: () => void; onShare: (sourceId: string, audio: boolean) => void }) {
  const t = useT();
  const [sources, setSources] = useState<ScreenSource[] | null>(null);
  const [tab, setTab] = useState<'screen' | 'window'>('screen');
  const [selected, setSelected] = useState<string | null>(null);
  const [audio, setAudio] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => window.brightboard?.getScreenSources().then((s) => alive && setSources(s));
    load();
    const id = setInterval(load, 3000); // keep thumbnails fresh
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const visible = sources?.filter((s) => s.kind === tab) ?? [];
  useEffect(() => {
    if (sources && !selected) setSelected(sources.find((s) => s.kind === 'screen')?.id ?? null);
  }, [sources, selected]);

  return (
    <Modal
      wide
      title={t.meeting.pickerTitle}
      onClose={onCancel}
      footer={
        <>
          <span className="muted small push-end">{t.meeting.pickerText}</span>
          <Button variant="ghost" onClick={onCancel}>
            {t.common.cancel}
          </Button>
          <Button icon={MonitorUp} disabled={!selected} onClick={() => selected && onShare(selected, audio)}>
            {t.meeting.shareNow}
          </Button>
        </>
      }
    >
      <div className="picker-head">
        <Segmented
          label={t.meeting.pickerTitle}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'screen', label: t.meeting.screens, icon: Monitor },
            { value: 'window', label: t.meeting.windows, icon: AppWindow },
          ]}
        />
        {navigator.userAgent.includes('Windows') && <Toggle label={t.meeting.shareAudio} checked={audio} onChange={setAudio} />}
      </div>
      {!sources ? (
        <Spinner />
      ) : (
        <div className="picker-grid" role="listbox">
          {visible.map((s) => (
            <button key={s.id} role="option" aria-selected={selected === s.id} className={`picker-item ${selected === s.id ? 'is-active' : ''}`} onClick={() => setSelected(s.id)} onDoubleClick={() => onShare(s.id, audio)}>
              <img src={s.thumbnail} alt="" />
              <span className="picker-name">
                {s.icon && <img src={s.icon} alt="" className="picker-icon" />}
                {s.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
