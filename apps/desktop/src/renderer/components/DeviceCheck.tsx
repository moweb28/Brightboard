import { createLocalAudioTrack, createLocalVideoTrack, Room, VideoPresets, type LocalAudioTrack, type LocalVideoTrack } from 'livekit-client';
import { Mic, MicOff, Video, VideoOff, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { applyBackground } from '../lib/effects';
import { useSettings, useT } from '../lib/settings';
import { sounds } from '../lib/sounds';
import { Avatar, Button, Select } from './ui';

type Kind = 'videoinput' | 'audioinput' | 'audiooutput';

function useDevices(trigger: unknown) {
  const [devices, setDevices] = useState<Record<Kind, MediaDeviceInfo[]>>({ videoinput: [], audioinput: [], audiooutput: [] });
  useEffect(() => {
    const load = async () => {
      const [videoinput, audioinput, audiooutput] = await Promise.all(
        (['videoinput', 'audioinput', 'audiooutput'] as Kind[]).map((k) => Room.getLocalDevices(k, false).catch(() => [])),
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
function useMicMeter(track: LocalAudioTrack | null, el: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!track || !el.current) return;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack])).connect(analyser);
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
  /** Controlled on/off state (pre-join). When omitted, both are on and no toggles are shown. */
  camOn?: boolean;
  micOn?: boolean;
  onToggleCam?: () => void;
  onToggleMic?: () => void;
}

/** Camera and mic stay off until the user turns them on — no surprise camera. */
export function DeviceCheck({ name, color, camOn: camProp, micOn: micProp, onToggleCam, onToggleMic }: Props) {
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
  const [videoTrack, setVideoTrack] = useState<LocalVideoTrack | null>(null);
  const [audioTrack, setAudioTrack] = useState<LocalAudioTrack | null>(null);
  const [camError, setCamError] = useState(false);
  const [micError, setMicError] = useState(false);
  const devices = useDevices(`${!!videoTrack}${!!audioTrack}`);

  useEffect(() => {
    if (!camOn) return;
    let track: LocalVideoTrack | null = null;
    let cancelled = false;
    createLocalVideoTrack({ deviceId: settings.cameraId || undefined, resolution: VideoPresets.h720.resolution }).then(
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

  useEffect(() => {
    if (!videoTrack || !videoRef.current) return;
    videoTrack.attach(videoRef.current);
    return () => void videoTrack.detach();
  }, [videoTrack]);

  useEffect(() => {
    if (videoTrack) applyBackground(videoTrack, settings.background);
  }, [videoTrack, settings.background]);

  useEffect(() => {
    if (!micOn) return;
    let track: LocalAudioTrack | null = null;
    let cancelled = false;
    createLocalAudioTrack({ deviceId: settings.micId || undefined }).then(
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
            <Avatar name={name} color={color} size={96} />
            {camOn && camError && <span className="preview-error">{t.meeting.cameraBlocked}</span>}
            {!camOn && (
              <button type="button" className="preview-start" onClick={toggleCam}>
                <Video size={18} /> {t.settings.turnOnCamera}
              </button>
            )}
          </div>
        )}
        <div className="preview-meter" ref={meterRef} aria-label={t.settings.micLevel}>
          <Mic size={14} />
          <span className="meter-track">
            <span className="meter-fill" />
          </span>
        </div>
        {(
          
          <div className="preview-toggles">
            <button className={`round-btn ${micOn ? '' : 'is-off'}`} onClick={toggleMic} aria-label={micOn ? t.meeting.micOn : t.meeting.micOff} title={micOn ? t.meeting.micOn : t.meeting.micOff}>
              {micOn ? <Mic size={22} /> : <MicOff size={22} />}
            </button>
            <button className={`round-btn ${camOn ? '' : 'is-off'}`} onClick={toggleCam} aria-label={camOn ? t.meeting.cameraOn : t.meeting.cameraOff} title={camOn ? t.meeting.cameraOn : t.meeting.cameraOff}>
              {camOn ? <Video size={22} /> : <VideoOff size={22} />}
            </button>
          </div>
        )}
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
