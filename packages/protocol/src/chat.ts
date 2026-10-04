/** Messages sent over the LiveKit data channel on topic `CHAT_TOPIC`. */
export const CHAT_TOPIC = 'chat';
export const REACTION_TOPIC = 'reaction';

export const CHAT_REACTIONS = ['👍', '❤️', '😂', '😮', '👏', '🎉'] as const;
export const MAX_CHAT_LENGTH = 2000;

export interface ChatMessage {
  id: string;
  from: string; // identity
  fromName: string;
  text: string;
  ts: number;
  replyTo?: { id: string; fromName: string; text: string };
  /** emoji -> identities that reacted */
  reactions: Record<string, string[]>;
}

export type ChatPacket =
  | { type: 'msg'; msg: Omit<ChatMessage, 'reactions' | 'from' | 'fromName'> }
  | { type: 'react'; msgId: string; emoji: string; on: boolean }
  | { type: 'typing' }
  | { type: 'history'; messages: ChatMessage[] };

export interface ChatState {
  messages: ChatMessage[];
}

/** Pure reducer so chat behavior is testable without LiveKit. `from` comes from the transport, never the payload. */
export function applyChatPacket(state: ChatState, packet: ChatPacket, from: string, fromName: string): ChatState {
  switch (packet.type) {
    case 'msg': {
      if (state.messages.some((m) => m.id === packet.msg.id)) return state;
      const text = packet.msg.text.slice(0, MAX_CHAT_LENGTH);
      if (!text.trim()) return state;
      const msg: ChatMessage = { ...packet.msg, text, from, fromName, reactions: {} };
      return { messages: [...state.messages, msg].sort((a, b) => a.ts - b.ts) };
    }
    case 'react': {
      if (!(CHAT_REACTIONS as readonly string[]).includes(packet.emoji)) return state;
      return {
        messages: state.messages.map((m) => {
          if (m.id !== packet.msgId) return m;
          const who = new Set(m.reactions[packet.emoji] ?? []);
          if (packet.on) who.add(from);
          else who.delete(from);
          const reactions = { ...m.reactions, [packet.emoji]: [...who] };
          if (!who.size) delete reactions[packet.emoji];
          return { ...m, reactions };
        }),
      };
    }
    case 'history': {
      const known = new Set(state.messages.map((m) => m.id));
      const merged = [...state.messages, ...packet.messages.filter((m) => !known.has(m.id))];
      return { messages: merged.sort((a, b) => a.ts - b.ts) };
    }
    case 'typing':
      return state;
  }
}

/** Splits text into plain and link parts so the UI can render clickable links safely. */
export function linkify(text: string): { text: string; href?: string }[] {
  const parts: { text: string; href?: string }[] = [];
  const re = /\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ text: m[0], href: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
