import { REMOTE_TOPIC, type RemoteInput, type RemotePacket } from '@classroom/protocol';
import { RoomEvent, Track, type Participant, type RemoteParticipant, type Room, type TrackPublication } from '../lib/rtc';
import { MousePointer2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../components/toast';
import { useSettings } from '../lib/settings';
import { isHost, nameOf } from './participants';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface Remote {
  /** Host: remote-control sessions by guest identity. */
  sessions: Record<string, 'pending' | 'active'>;
  request(identity: string): void;
  release(identity: string): void;
  send(identity: string, e: RemoteInput): void;
  /** Guest: a pending request from the host. */
  incoming: { identity: string; name: string } | null;
  answer(allow: boolean): void;
  /** Guest: who is controlling this computer right now. */
  controller: { identity: string; name: string } | null;
  stopBeingControlled(): void;
}

export function useRemote(room: Room): Remote {
  const { t, settings } = useSettings();
  const toast = useToast();
  const [sessions, setSessions] = useState<Record<string, 'pending' | 'active'>>({});
  const [incoming, setIncoming] = useState<Remote['incoming']>(null);
  const [controller, setController] = useState<Remote['controller']>(null);
  const controllerRef = useRef(controller);
  controllerRef.current = controller;
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const tRef = useRef(t);
  tRef.current = t;

  const publish = useCallback(
    (packet: RemotePacket, to: string) =>
      room.localParticipant
        .publishData(encoder.encode(JSON.stringify(packet)), { topic: REMOTE_TOPIC, destinationIdentities: [to], reliable: !(packet.type === 'input' && packet.e.k === 'move') })
        .catch(() => undefined),
    [room],
  );

  const dropSession = (identity: string) =>
    setSessions((s) => {
      const copy = { ...s };
      delete copy[identity];
      return copy;
    });

  const endAsGuest = useCallback(
    (notifyHost: boolean) => {
      const c = controllerRef.current;
      if (!c) return;
      setController(null);
      window.brightboard?.remote.stop(true);
      if (notifyHost) publish({ type: 'end' }, c.identity);
    },
    [publish],
  );

  useEffect(() => {
    const onData = (payload: Uint8Array, p?: RemoteParticipant, _k?: unknown, topic?: string) => {
      if (topic !== REMOTE_TOPIC || !p) return;
      let packet: RemotePacket;
      try {
        packet = JSON.parse(decoder.decode(payload));
      } catch {
        return;
      }
      switch (packet.type) {
        case 'request':
          // Only the host may ask, and only while this computer shares its screen.
          if (!isHost(p) || !room.localParticipant.isScreenShareEnabled) return void publish({ type: 'deny' }, p.identity);
          if (!window.brightboard) {
            toast({ text: tRef.current.remote.desktopOnly, tone: 'warn' });
            return void publish({ type: 'deny' }, p.identity);
          }
          setIncoming({ identity: p.identity, name: nameOf(p) });
          break;
        case 'grant':
          if (sessionsRef.current[p.identity] === 'pending') setSessions((s) => ({ ...s, [p.identity]: 'active' }));
          break;
        case 'deny':
          if (sessionsRef.current[p.identity]) {
            dropSession(p.identity);
            toast({ text: tRef.current.remote.denied(nameOf(p)), tone: 'warn' });
          }
          break;
        case 'end':
          if (sessionsRef.current[p.identity]) {
            dropSession(p.identity);
            toast({ icon: MousePointer2, text: tRef.current.remote.ended });
          }
          if (controllerRef.current?.identity === p.identity) {
            endAsGuest(false);
            toast({ icon: MousePointer2, text: tRef.current.remote.ended });
          }
          break;
        case 'input':
          // The main process double-checks the sender against the granted controller.
          if (controllerRef.current?.identity === p.identity) window.brightboard?.remote.input(p.identity, packet.e);
          break;
      }
    };

    const onLeft = (p: Participant) => {
      dropSession(p.identity);
      if (controllerRef.current?.identity === p.identity) endAsGuest(false);
      setIncoming((i) => (i?.identity === p.identity ? null : i));
    };
    const onUnpublished = (pub: TrackPublication, p: Participant) => {
      if (pub.source === Track.Source.ScreenShare) dropSession(p.identity);
    };
    const onLocalUnpublished = (pub: TrackPublication) => {
      if (pub.source !== Track.Source.ScreenShare) return;
      window.brightboard?.screenShareStopped(); // the main process ends any control session
      setIncoming(null);
    };

    room.on(RoomEvent.DataReceived, onData);
    room.on(RoomEvent.ParticipantDisconnected, onLeft);
    room.on(RoomEvent.TrackUnpublished, onUnpublished);
    room.on(RoomEvent.LocalTrackUnpublished, onLocalUnpublished);
    const offEnded = window.brightboard?.remote.onEnded((reason) => {
      const c = controllerRef.current;
      if (!c) return;
      setController(null);
      if (reason !== 'remote') publish({ type: 'end' }, c.identity);
      toast({ icon: MousePointer2, text: reason === 'idle' ? tRef.current.remote.endedIdle : tRef.current.remote.ended });
    });
    return () => {
      room.off(RoomEvent.DataReceived, onData);
      room.off(RoomEvent.ParticipantDisconnected, onLeft);
      room.off(RoomEvent.TrackUnpublished, onUnpublished);
      room.off(RoomEvent.LocalTrackUnpublished, onLocalUnpublished);
      offEnded?.();
    };
  }, [room, publish, toast, endAsGuest]);

  // Leaving the call ends everything.
  useEffect(
    () => () => {
      for (const identity of Object.keys(sessionsRef.current)) publish({ type: 'end' }, identity);
      if (controllerRef.current) window.brightboard?.remote.stop(true);
    },
    [publish],
  );

  return {
    sessions,
    request(identity) {
      setSessions((s) => ({ ...s, [identity]: 'pending' }));
      publish({ type: 'request' }, identity);
    },
    release(identity) {
      dropSession(identity);
      publish({ type: 'end' }, identity);
    },
    send(identity, e) {
      if (sessionsRef.current[identity] === 'active') publish({ type: 'input', e }, identity);
    },
    incoming,
    async answer(allow) {
      const req = incoming;
      setIncoming(null);
      if (!req) return;
      if (!allow) return void publish({ type: 'deny' }, req.identity);
      const res = await window.brightboard!.remote.grant({
        controller: req.identity,
        text: t.remote.overlay(req.name),
        stopLabel: t.remote.overlayStop,
        rtl: settings.lang === 'ar',
      });
      if (!res.ok) {
        toast({ text: t.remote[res.reason], tone: 'warn' });
        return void publish({ type: 'deny' }, req.identity);
      }
      setController(req);
      publish({ type: 'grant' }, req.identity);
      toast({ icon: MousePointer2, text: t.remote.started(req.name), tone: 'warn' });
    },
    controller,
    stopBeingControlled: () => endAsGuest(true),
  };
}
