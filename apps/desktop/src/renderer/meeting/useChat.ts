import { applyChatPacket, CHAT_TOPIC, MAX_CHAT_LENGTH, type ChatMessage, type ChatPacket, type ChatState } from '@classroom/protocol';
import { RoomEvent, type Participant, type RemoteParticipant, type Room } from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isHost, isWaiting, nameOf } from './participants';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const TYPING_TTL = 4000;

export interface Chat {
  messages: ChatMessage[];
  typing: string[];
  unread: number;
  send(text: string, replyTo?: ChatMessage): void;
  react(msg: ChatMessage, emoji: string): void;
  notifyTyping(): void;
  markRead(): void;
}

/** Teams-style chat over the LiveKit data channel. The host's app re-sends history to people who join late. */
export function useChat(room: Room, panelOpen: boolean, onIncoming: (m: ChatMessage) => void): Chat {
  const [state, setState] = useState<ChatState>({ messages: [] });
  const [typingMap, setTypingMap] = useState<Record<string, { name: string; at: number }>>({});
  const [unread, setUnread] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const openRef = useRef(panelOpen);
  openRef.current = panelOpen;
  const incomingRef = useRef(onIncoming);
  incomingRef.current = onIncoming;
  const lastTypingSent = useRef(0);

  const publish = useCallback(
    (packet: ChatPacket, to?: string[]) =>
      room.localParticipant.publishData(encoder.encode(JSON.stringify(packet)), { reliable: packet.type !== 'typing', topic: CHAT_TOPIC, destinationIdentities: to }).catch(() => undefined),
    [room],
  );

  useEffect(() => {
    const onData = (payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) => {
      if (topic !== CHAT_TOPIC || !participant) return;
      let packet: ChatPacket;
      try {
        packet = JSON.parse(decoder.decode(payload));
      } catch {
        return;
      }
      // History is only trusted from the host.
      if (packet.type === 'history' && !isHost(participant)) return;
      if (packet.type === 'typing') {
        setTypingMap((m) => ({ ...m, [participant.identity]: { name: nameOf(participant), at: Date.now() } }));
        return;
      }
      const before = stateRef.current.messages.length;
      const next = applyChatPacket(stateRef.current, packet, participant.identity, nameOf(participant));
      stateRef.current = next;
      setState(next);
      if (packet.type === 'msg' && next.messages.length > before) {
        setTypingMap((m) => {
          const copy = { ...m };
          delete copy[participant.identity];
          return copy;
        });
        if (!openRef.current) setUnread((u) => u + 1);
        incomingRef.current(next.messages.find((m) => m.id === packet.msg.id)!);
      }
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => void room.off(RoomEvent.DataReceived, onData);
  }, [room]);

  // Host: send chat history to whoever is newly admitted to the class.
  useEffect(() => {
    if (!isHost(room.localParticipant)) return;
    const sendHistory = (p: Participant) => {
      if (isWaiting(p) || stateRef.current.messages.length === 0) return;
      setTimeout(() => publish({ type: 'history', messages: stateRef.current.messages.slice(-200) }, [p.identity]), 1000);
    };
    const onMeta = (prev: string | undefined, p: Participant) => {
      try {
        if (JSON.parse(prev || '{}').waiting && !isWaiting(p)) sendHistory(p);
      } catch {
        /* ignore */
      }
    };
    room.on(RoomEvent.ParticipantConnected, sendHistory);
    room.on(RoomEvent.ParticipantMetadataChanged, onMeta);
    return () => {
      room.off(RoomEvent.ParticipantConnected, sendHistory);
      room.off(RoomEvent.ParticipantMetadataChanged, onMeta);
    };
  }, [room, publish]);

  // Expire typing indicators.
  useEffect(() => {
    const id = setInterval(() => {
      setTypingMap((m) => {
        const now = Date.now();
        const live = Object.entries(m).filter(([, v]) => now - v.at < TYPING_TTL);
        return live.length === Object.keys(m).length ? m : Object.fromEntries(live);
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (panelOpen) setUnread(0);
  }, [panelOpen]);

  const local = room.localParticipant;
  return {
    messages: state.messages,
    typing: Object.values(typingMap).map((v) => v.name),
    unread,
    send(text, replyTo) {
      const trimmed = text.trim().slice(0, MAX_CHAT_LENGTH);
      if (!trimmed) return;
      const msg = {
        id: crypto.randomUUID(),
        text: trimmed,
        ts: Date.now(),
        replyTo: replyTo && { id: replyTo.id, fromName: replyTo.fromName, text: replyTo.text.slice(0, 140) },
      };
      const packet: ChatPacket = { type: 'msg', msg };
      setState((s) => applyChatPacket(s, packet, local.identity, nameOf(local)));
      publish(packet);
    },
    react(msg, emoji) {
      const on = !(msg.reactions[emoji] ?? []).includes(local.identity);
      const packet: ChatPacket = { type: 'react', msgId: msg.id, emoji, on };
      setState((s) => applyChatPacket(s, packet, local.identity, nameOf(local)));
      publish(packet);
    },
    notifyTyping() {
      if (Date.now() - lastTypingSent.current < 2500) return;
      lastTypingSent.current = Date.now();
      publish({ type: 'typing' });
    },
    markRead: () => setUnread(0),
  };
}
