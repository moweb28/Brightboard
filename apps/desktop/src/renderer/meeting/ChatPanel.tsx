import { CHAT_REACTIONS, linkify, MAX_CHAT_LENGTH, type ChatMessage } from '@classroom/protocol';
import type { Room } from '../lib/rtc';
import { Lock, MessageSquareText, Reply, SendHorizontal, Smile, SmilePlus, X } from 'lucide-react';
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Avatar, IconButton } from '../components/ui';
import { colorFor, formatTime } from '../lib/format';
import { useSettings, useT } from '../lib/settings';
import { colorOf, pictureOf } from './participants';
import type { Chat } from './useChat';

const EMOJIS = '😀 😃 😄 😁 😂 🤣 😊 😍 🥰 😎 🤓 🤔 😮 😢 😡 🙌 👏 👍 👎 🙏 💪 ✋ 👋 🎉 🔥 ⭐ ✅ ❌ ❓ ❗ 💡 📚 ✏️ 📝 🧮 🧪 🌍 ❤️ 💯 🚀'.split(' ');
const GROUP_GAP = 5 * 60_000;

function MessageText({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((part, i) =>
        part.href ? (
          <a key={i} href={part.href} target="_blank" rel="noreferrer">
            {part.text}
          </a>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

export function ChatPanel({ room, chat, canSend, onClose }: { room: Room; chat: Chat; canSend: boolean; onClose: () => void }) {
  const t = useT();
  const { settings } = useSettings();
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const me = room.localParticipant.identity;
  const colorForSender = (identity: string) => {
    const p = identity === me ? room.localParticipant : room.remoteParticipants.get(identity);
    return p ? colorOf(p) : colorFor(identity);
  };
  const pictureForSender = (identity: string) => {
    const p = identity === me ? room.localParticipant : room.remoteParticipants.get(identity);
    return p ? pictureOf(p) : null;
  };

  // Stick to the bottom when new messages arrive.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [replyTo]);

  // Auto-grow the textarea.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  const submit = () => {
    if (!text.trim() || !canSend) return;
    chat.send(text, replyTo ?? undefined);
    setText('');
    setReplyTo(null);
    setEmojiOpen(false);
  };

  return (
    <aside className="side-panel chat-panel" aria-label={t.meeting.chat}>
      <header className="side-head">
        <h2>{t.meeting.chat}</h2>
        <IconButton icon={X} label={t.common.close} onClick={onClose} />
      </header>

      <div className="chat-list" ref={listRef}>
        {chat.messages.length === 0 && (
          <div className="chat-empty">
            <MessageSquareText size={32} />
            <p>{t.meeting.noMessages}</p>
          </div>
        )}
        {chat.messages.map((m, i) => {
          const prev = chat.messages[i - 1];
          const grouped = prev && prev.from === m.from && m.ts - prev.ts < GROUP_GAP;
          const mine = m.from === me;
          return (
            <div key={m.id} className={`msg ${mine ? 'msg-mine' : ''} ${grouped ? 'msg-grouped' : ''}`}>
              {!mine && <div className="msg-avatar">{!grouped && <Avatar name={m.fromName} color={colorForSender(m.from)} picture={pictureForSender(m.from)} size={32} />}</div>}
              <div className="msg-body">
                {!grouped && (
                  <div className="msg-meta">
                    {!mine && <strong>{m.fromName}</strong>}
                    <span>{formatTime(m.ts, settings.lang)}</span>
                  </div>
                )}
                <div className="bubble">
                  {m.replyTo && (
                    <div className="bubble-quote">
                      <strong>{m.replyTo.fromName}</strong>
                      <span>{m.replyTo.text}</span>
                    </div>
                  )}
                  <div className="bubble-text" dir="auto">
                    <MessageText text={m.text} />
                  </div>
                  <div className="msg-actions" role="toolbar">
                    {CHAT_REACTIONS.map((e) => (
                      <button key={e} onClick={() => chat.react(m, e)} aria-label={e}>
                        {e}
                      </button>
                    ))}
                    <button onClick={() => setReplyTo(m)} aria-label={t.meeting.reply} title={t.meeting.reply}>
                      <Reply size={15} />
                    </button>
                  </div>
                </div>
                {Object.keys(m.reactions).length > 0 && (
                  <div className="reactions">
                    {Object.entries(m.reactions).map(([emoji, who]) => (
                      <button key={emoji} className={`reaction-chip ${who.includes(me) ? 'is-mine' : ''}`} onClick={() => chat.react(m, emoji)}>
                        {emoji} {who.length}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <footer className="chat-compose">
        <div className="typing" aria-live="polite">
          {chat.typing.length > 0 && t.meeting.typing(chat.typing)}
        </div>
        {!canSend ? (
          <p className="chat-disabled">
            <Lock size={16} /> {t.meeting.chatDisabled}
          </p>
        ) : (
          <>
            {replyTo && (
              <div className="reply-banner">
                <Reply size={15} />
                <span>
                  <strong>{t.meeting.replyingTo(replyTo.fromName)}</strong>
                  <span className="reply-snippet">{replyTo.text}</span>
                </span>
                <IconButton icon={X} label={t.common.cancel} onClick={() => setReplyTo(null)} />
              </div>
            )}
            {emojiOpen && (
              <div className="emoji-grid" role="listbox" aria-label={t.meeting.emoji}>
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => {
                      setText((v) => v + e);
                      inputRef.current?.focus();
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
            <div className="compose-box">
              <IconButton icon={emojiOpen ? Smile : SmilePlus} label={t.meeting.emoji} onClick={() => setEmojiOpen((o) => !o)} className={emojiOpen ? 'is-active' : ''} />
              <textarea
                ref={inputRef}
                rows={1}
                dir="auto"
                value={text}
                maxLength={MAX_CHAT_LENGTH}
                placeholder={t.meeting.chatPlaceholder}
                onChange={(e) => {
                  setText(e.target.value);
                  chat.notifyTyping();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
              <button className="send-btn" onClick={submit} disabled={!text.trim()} aria-label={t.meeting.send} title={t.meeting.send}>
                <SendHorizontal size={18} className="flip-rtl" />
              </button>
            </div>
          </>
        )}
      </footer>
    </aside>
  );
}
