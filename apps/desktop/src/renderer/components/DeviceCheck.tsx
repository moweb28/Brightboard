import { Mic, MicOff, Video, VideoOff, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { videoEffectFor } from '../lib/effects';
import { useSettings, useT } from '../lib/settings';
import { sounds } from '../lib/sounds';
import { Avatar, Button, Select } from './ui';

type Kind = 'videoinput' | 'audioinput' | 'audiooutput';

function useDevices(trigger: unknown) {
  const [devices, setDevices] = useState<Record<Kind, MediaDeviceInfo[]>>({ videoinput: [], audioinput: [], audiooutput: [] });
  useEffect(() => {
    const load = async () => {
      const [videoinput, audioinput, audiooutput] = await Promise.all(
        (['videoinput', 'audioinput', 'audiooutput'] as Kind[]).map((k) => navigator.mediaDevices.enumerateDevices().then((all) => all.filter((d) => d.kind === k), () => [])),
      );
      setDevices({ videoinput, audioinput, audiooutput });
    };
    load();
    navigator.mediaDevices?.addEventListener('devicechange', load);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', load);
  }, [trigger]);
  return devices;
}

/** Live mic level (0–1) written straight to a CSS variable to avoid re-rendering every frame. */
function useMicMeter(track: MediaStreamTrack | null, el: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!track || !el.current) return;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let raf = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      const level = Math.min(1, Math.sqrt(sum / data.length) * 4);
      el.current?.style.setProperty('--level', String(level));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      ctx.close();
    };
  }, [track, el]);
}

interface Props {
  name: string;
  color: string;
  picture?: string | null;
  /** Controlled on/off state (pre-join). When omitted, both are on and no toggles are shown. */
  camOn?: boolean;
  micOn?: boolean;
  onToggleCam?: () => void;
  onToggleMic?: () => void;
}

/** Camera and mic stay off until the user turns them on — no surprise camera. */
export function DeviceCheck({ name, color, picture, camOn: camProp, micOn: micProp, onToggleCam, onToggleMic }: Props) {
  const [selfCam, setSelfCam] = useState(false);
  const [selfMic, setSelfMic] = useState(false);
  const camOn = camProp ?? selfCam;
  const micOn = micProp ?? selfMic;
  const toggleCam = onToggleCam ?? (() => setSelfCam((v) => !v));
  const toggleMic = onToggleMic ?? (() => setSelfMic((v) => !v));
  const t = useT();
  const { settings, set } = useSettings();
  const videoRef = useRef<HTMLVideoElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const [videoTrack, setVideoTrack] = useState<MediaStreamTrack | null>(null);
  const [shownTrack, setShownTrack] = useState<MediaStreamTrack | null>(null);
  const [audioTrack, setAudioTrack] = useState<MediaStreamTrack | null>(null);
  const [camError, setCamError] = useState(false);
  const [micError, setMicError] = useState(false);
  const devices = useDevices(`${!!videoTrack}${!!audioTrack}`);

  useEffect(() => {
    if (!camOn) return;
    let track: MediaStreamTrack | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { deviceId: settings.cameraId ? { exact: settings.cameraId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then((s) => s.getVideoTracks()[0])
      .then(
      (tr) => {
        if (cancelled) return tr.stop();
        track = tr;
        setCamError(false);
        setVideoTrack(tr);
      },
      () => setCamError(true),
    );
    return () => {
      cancelled = true;
      track?.stop();
      setVideoTrack(null);
    };
  }, [camOn, settings.cameraId]);

  // The preview shows the camera with the chosen background effect, like others will see it.
  useEffect(() => {
    if (!videoTrack) return setShownTrack(null);
    const effect = videoEffectFor(settings.background);
    if (!effect) return setShownTrack(videoTrack);
    let processed: MediaStreamTrack | null = null;
    let cancelled = false;
    effect(videoTrack).then(
      (tr) => {
        if (cancelled) return tr !== videoTrack && tr.stop();
        processed = tr;
        setShownTrack(tr);
      },
      () => !cancelled && setShownTrack(videoTrack),
    );
    return () => {
      cancelled = true;
      if (processed && processed !== videoTrack) processed.stop();
    };
  }, [videoTrack, settings.background]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = shownTrack ? new MediaStream([shownTrack]) : null;
  }, [shownTrack]);

  useEffect(() => {
    if (!micOn) return;
    let track: MediaStreamTrack | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ audio: { deviceId: settings.micId ? { exact: settings.micId } : undefined } })
      .then((s) => s.getAudioTracks()[0])
      .then(
      (tr) => {
        if (cancelled) return tr.stop();
        track = tr;
        setMicError(false);
        setAudioTrack(tr);
      },
      () => setMicError(true),
    );
    return () => {
      cancelled = true;
      track?.stop();
      setAudioTrack(null);
    };
  }, [micOn, settings.micId]);

  useMicMeter(audioTrack, meterRef);

  const options = (list: MediaDeviceInfo[]) => [
    { value: '', label: t.settings.systemDefault },
    ...list.filter((d) => d.deviceId && d.deviceId !== 'default').map((d, i) => ({ value: d.deviceId, label: d.label || `${t.settings.camera} ${i + 1}` })),
  ];

  return (
    <div className="device-check">
      <div className="preview">
        {camOn && videoTrack ? (
          <video ref={videoRef} className={settings.mirror ? 'mirror' : ''} muted playsInline autoPlay />
        ) : (
          <div className="preview-off">
            <Avatar name={name} color={color} picture={picture} size={96} />
            {camOn && camError && <span className="preview-error">{t.meeting.cameraBlocked}</span>}
          </div>
        )}
        <div className="preview-meter" ref={meterRef} aria-label={t.settings.micLevel}>
          <Mic size={14} />
          <span className="meter-track">
            <span className="meter-fill" />
          </span>
        </div>
      </div>
      <div className="preview-bar">
        <button type="button" className={`preview-toggle ${micOn ? '' : 'is-off'}`} onClick={toggleMic} aria-pressed={!micOn}>
          {micOn ? <Mic size={18} /> : <MicOff size={18} />}
          {micOn ? t.meeting.micOn : t.meeting.micOff}
        </button>
        <button type="button" className={`preview-toggle ${camOn ? '' : 'is-off'}`} onClick={toggleCam} aria-pressed={!camOn}>
          {camOn ? <Video size={18} /> : <VideoOff size={18} />}
          {camOn ? t.meeting.cameraOn : t.meeting.cameraOff}
        </button>
      </div>
      <div className="device-selects">
        <Select label={t.settings.camera} value={settings.cameraId} onChange={(v) => set('cameraId', v)} options={options(devices.videoinput)} />
        <Select label={t.settings.microphone} value={settings.micId} onChange={(v) => set('micId', v)} options={options(devices.audioinput)} />
        {micOn && micError && <p className="error">{t.meeting.micBlocked}</p>}
        {devices.audiooutput.length > 0 && (
          <div className="select-with-action">
            <Select label={t.settings.speaker} value={settings.speakerId} onChange={(v) => set('speakerId', v)} options={options(devices.audiooutput)} />
            <Button variant="secondary" icon={Volume2} onClick={() => sounds.join()} type="button">
              {t.settings.testSound}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
