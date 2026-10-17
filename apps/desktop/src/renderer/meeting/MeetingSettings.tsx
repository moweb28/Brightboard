import { Room, type Room as RoomType } from '../lib/rtc';
import { useEffect, useState } from 'react';
import { NameTagPicker } from '../components/NameTagPicker';
import { Modal, Select, Toggle } from '../components/ui';
import { BACKGROUND_IMAGES, backgroundsSupported } from '../lib/effects';
import { BACKGROUNDS, useSettings, useT } from '../lib/settings';

type Kind = 'videoinput' | 'audioinput' | 'audiooutput';

/** Device switching while in class: changes apply to the live tracks (no second camera preview). */
export function MeetingSettings({ room, onClose }: { room: RoomType; onClose: () => void }) {
  const t = useT();
  const { settings, set } = useSettings();
  const [devices, setDevices] = useState<Record<Kind, MediaDeviceInfo[]>>({ videoinput: [], audioinput: [], audiooutput: [] });

  useEffect(() => {
    Promise.all((['videoinput', 'audioinput', 'audiooutput'] as Kind[]).map((k) => Room.getLocalDevices(k, false).catch(() => []))).then(([videoinput, audioinput, audiooutput]) =>
      setDevices({ videoinput, audioinput, audiooutput }),
    );
  }, []);

  const options = (list: MediaDeviceInfo[]) => [
    { value: '', label: t.settings.systemDefault },
    ...list.filter((d) => d.deviceId && d.deviceId !== 'default').map((d, i) => ({ value: d.deviceId, label: d.label || `#${i + 1}` })),
  ];
  const switchTo = (kind: Kind, key: 'cameraId' | 'micId' | 'speakerId') => (id: string) => {
    set(key, id);
    room.switchActiveDevice(kind, id || 'default').catch(() => undefined);
  };

  return (
    <Modal title={t.meeting.devicesTitle} onClose={onClose}>
      <div className="stack">
        <Select label={t.settings.camera} value={settings.cameraId} onChange={switchTo('videoinput', 'cameraId')} options={options(devices.videoinput)} />
        <Select label={t.settings.microphone} value={settings.micId} onChange={switchTo('audioinput', 'micId')} options={options(devices.audioinput)} />
        {devices.audiooutput.length > 0 && <Select label={t.settings.speaker} value={settings.speakerId} onChange={switchTo('audiooutput', 'speakerId')} options={options(devices.audiooutput)} />}
        {backgroundsSupported() && (
          <div className="field">
            <span className="field-label">{t.settings.background}</span>
            <div className="bg-grid" role="radiogroup">
              {BACKGROUNDS.map((bg) => (
                <button key={bg} role="radio" aria-checked={settings.background === bg} className={`bg-option ${settings.background === bg ? 'is-active' : ''}`} onClick={() => set('background', bg)}>
                  <span className={`bg-thumb bg-thumb-${bg}`} style={BACKGROUND_IMAGES[bg] ? { backgroundImage: `url(${BACKGROUND_IMAGES[bg]})` } : undefined} />
                  <span className="small">{t.settings.backgrounds[bg]}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <Toggle label={t.settings.mirrorVideo} description={t.settings.mirrorVideoDesc} checked={settings.mirror} onChange={(v) => set('mirror', v)} />
        <NameTagPicker />
      </div>
    </Modal>
  );
}
