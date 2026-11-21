import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Hash,
  LoaderCircle,
  LogOut,
  MessageCircle,
  Reply,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { cloudAuth } from '../services/CloudSyncService';
import {
  CommunityMember,
  CommunityMessage,
  CommunityRoom,
  deleteCommunityMessage,
  ensureDefaultCommunityRooms,
  getCommunityMembership,
  joinCommunityRoom,
  leaveCommunityRoom,
  sendCommunityMessage,
  subscribeToCommunityRooms,
  subscribeToRoomMembers,
  subscribeToRoomMessages,
} from '../services/CommunityChatService';
import type { Timestamp } from 'firebase/firestore';

type MembershipState = 'checking' | 'joined' | 'not-joined';
const MESSAGE_MAX_LENGTH = 4000;

const timestampDate = (value: Timestamp | null | undefined): Date | null => {
  if (!value || typeof value.toDate !== 'function') return null;
  return value.toDate();
};

const formatMessageTime = (value: Timestamp | null | undefined): string => {
  const date = timestampDate(value);
  if (!date) return 'Sending…';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const initials = (name: string): string =>
  name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || 'G';

const Avatar: React.FC<{ name: string; photoURL?: string; size?: 'sm' | 'md' }> = ({
  name,
  photoURL = '',
  size = 'md',
}) => (
  <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-100 font-bold text-indigo-700 ${size === 'sm' ? 'h-8 w-8 text-[10px]' : 'h-10 w-10 text-xs'}`}>
    {photoURL ? (
      <img src={photoURL} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
    ) : initials(name)}
  </div>
);

const Community: React.FC = () => {
  const user = cloudAuth.currentUser;
  const uid = user?.uid || '';
  const currentUserName = user?.displayName?.trim() || 'GATE Student';
  const [rooms, setRooms] = useState<CommunityRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState('general-community');
  const [searchText, setSearchText] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [membership, setMembership] = useState<MembershipState>('checking');
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<CommunityMessage | null>(null);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [joining, setJoining] = useState(false);
  const [sending, setSending] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState('');
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) || null;
  const categories = useMemo(
    () => ['All', ...Array.from(new Set(rooms.map((room) => room.category)))],
    [rooms]
  );
  const filteredRooms = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    return rooms.filter((room) => (
      (activeCategory === 'All' || room.category === activeCategory) &&
      (!search || room.name.toLowerCase().includes(search) || room.description.toLowerCase().includes(search))
    ));
  }, [rooms, searchText, activeCategory]);

  useEffect(() => {
    let mounted = true;
    setLoadingRooms(true);
    setError('');
    ensureDefaultCommunityRooms().catch((cause) => {
      if (mounted) setError(cause instanceof Error ? cause.message : 'Could not prepare the study rooms.');
    });
    const unsubscribe = subscribeToCommunityRooms(
      (nextRooms) => {
        if (!mounted) return;
        setRooms(nextRooms);
        setLoadingRooms(false);
      },
      (cause) => {
        if (!mounted) return;
        setError(cause.message || 'Could not load community rooms.');
        setLoadingRooms(false);
      }
    );
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!selectedRoomId || !uid) {
      setMembership('not-joined');
      return;
    }
    let active = true;
    setMembership('checking');
    setMessages([]);
    setMembers([]);
    setReplyTo(null);
    getCommunityMembership(selectedRoomId)
      .then((joined) => {
        if (active) setMembership(joined ? 'joined' : 'not-joined');
      })
      .catch((cause) => {
        if (active) {
          setMembership('not-joined');
          setError(cause instanceof Error ? cause.message : 'Could not check room membership.');
        }
      });
    return () => {
      active = false;
    };
  }, [selectedRoomId, uid]);

  useEffect(() => {
    if (membership !== 'joined' || !selectedRoomId) return;
    const unsubscribeMessages = subscribeToRoomMessages(
      selectedRoomId,
      setMessages,
      (cause) => setError(cause.message || 'Could not receive room messages.')
    );
    const unsubscribeMembers = subscribeToRoomMembers(
      selectedRoomId,
      setMembers,
      (cause) => setError(cause.message || 'Could not load room members.')
    );
    return () => {
      unsubscribeMessages();
      unsubscribeMembers();
    };
  }, [membership, selectedRoomId]);

  useEffect(() => {
    const element = messageListRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.length, selectedRoomId]);

  const handleJoinRoom = async () => {
    if (!selectedRoom) return;
    setJoining(true);
    setError('');
    try {
      await joinCommunityRoom(selectedRoom.id);
      setMembership('joined');
      setSuccessNotice(`You joined ${selectedRoom.name}.`);
      window.setTimeout(() => setSuccessNotice(''), 3000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not join this room.');
    } finally {
      setJoining(false);
    }
  };

  const handleLeaveRoom = async () => {
    if (!selectedRoom) return;
    const confirmed = window.confirm(`Leave ${selectedRoom.name}? You can rejoin it later.`);
    if (!confirmed) return;
    try {
      await leaveCommunityRoom(selectedRoom.id);
      setMembership('not-joined');
      setMessages([]);
      setMembers([]);
      setReplyTo(null);
      setSuccessNotice('You left the study room.');
      window.setTimeout(() => setSuccessNotice(''), 3000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not leave this room.');
    }
  };

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedRoom || membership !== 'joined' || !draft.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      await sendCommunityMessage(
        selectedRoom.id,
        draft,
        replyTo ? { id: replyTo.id, senderName: replyTo.senderName, text: replyTo.text } : undefined
      );
      setDraft('');
      setReplyTo(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Message could not be sent.');
    } finally {
      setSending(false);
      composerRef.current?.focus();
    }
  };

  const handleDeleteMessage = async (message: CommunityMessage) => {
    if (!selectedRoom || message.senderUid !== uid) return;
    if (!window.confirm('Delete this message for everyone in this room?')) return;
    setDeletingMessageId(message.id);
    try {
      await deleteCommunityMessage(selectedRoom.id, message.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete this message.');
    } finally {
      setDeletingMessageId('');
    }
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      const form = event.currentTarget.form;
      form?.requestSubmit();
    }
  };

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-sky-50 p-5 md:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Learn together. Grow together.</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900 md:text-2xl">ACHIEVER Community</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                Discuss GATE questions, exchange explanations and learn with fellow aspirants.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            Authenticated student rooms
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span>{error}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => setError('')} className="rounded p-1 hover:bg-rose-100"><X className="h-4 w-4" /></button>
        </div>
      )}
      {successNotice && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successNotice}
        </div>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[310px_minmax(0,1fr)]">
        <aside className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Study rooms</h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{rooms.length}</span>
            </div>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Find a subject or room…"
                aria-label="Search study rooms"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${activeCategory === category ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[560px] space-y-1 overflow-y-auto p-2">
            {loadingRooms ? (
              <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-slate-500">
                <LoaderCircle className="h-4 w-4 animate-spin" /> Loading rooms…
              </div>
            ) : filteredRooms.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">No rooms match your search.</p>
            ) : filteredRooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => setSelectedRoomId(room.id)}
                className={`flex w-full items-start gap-3 rounded-xl p-3 text-left transition ${selectedRoomId === room.id ? 'bg-indigo-50 ring-1 ring-indigo-100' : 'hover:bg-slate-50'}`}
              >
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${selectedRoomId === room.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {room.category === 'Computer Science' ? <BookOpen className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-semibold ${selectedRoomId === room.id ? 'text-indigo-900' : 'text-slate-800'}`}>{room.name}</span>
                  <span className="mt-0.5 block line-clamp-2 text-xs leading-5 text-slate-500">{room.description}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <div className="flex min-h-[620px] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {selectedRoom ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 md:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700"><Hash className="h-5 w-5" /></div>
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-slate-900">{selectedRoom.name}</h3>
                    <p className="text-xs text-slate-500">{membership === 'joined' ? `${members.length === 50 ? '50+' : members.length} members` : selectedRoom.category + ' · Public room'}</p>
                  </div>
                </div>
                {membership === 'joined' && (
                  <button type="button" onClick={handleLeaveRoom} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700">
                    <LogOut className="h-4 w-4" /> Leave room
                  </button>
                )}
              </div>

              {membership === 'checking' ? (
                <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500">
                  <LoaderCircle className="h-5 w-5 animate-spin" /> Checking membership…
                </div>
              ) : membership === 'not-joined' ? (
                <div className="flex flex-1 flex-col items-center justify-center px-6 py-14 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><MessageCircle className="h-8 w-8" /></div>
                  <h4 className="mt-5 text-lg font-bold text-slate-900">Join the conversation</h4>
                  <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{selectedRoom.description} Join this public room to read messages and participate in the discussion.</p>
                  <button type="button" disabled={joining} onClick={handleJoinRoom} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
                    {joining ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                    {joining ? 'Joining…' : 'Join study room'}
                  </button>
                  <p className="mt-3 text-xs text-slate-400">Only room members can read or send messages.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
                    <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Members</span>
                    {members.slice(0, 8).map((member) => (
                      <div key={member.uid} className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-2 py-1 ring-1 ring-slate-100" title={member.displayName}>
                        <Avatar name={member.displayName} photoURL={member.photoURL} size="sm" />
                        <span className="max-w-24 truncate text-[11px] font-medium text-slate-600">{member.displayName}</span>
                      </div>
                    ))}
                    {members.length > 8 && <span className="shrink-0 text-xs text-slate-400">+{members.length - 8} more</span>}
                  </div>

                  <div ref={messageListRef} className="flex-1 space-y-4 overflow-y-auto bg-slate-50/60 px-3 py-4 md:px-5">
                    {messages.length === 0 ? (
                      <div className="flex h-full min-h-64 flex-col items-center justify-center text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-indigo-500 shadow-sm ring-1 ring-slate-100"><MessageCircle className="h-7 w-7" /></div>
                        <h4 className="mt-4 font-bold text-slate-800">Start the discussion</h4>
                        <p className="mt-1 max-w-sm text-sm text-slate-500">Ask a GATE question, share your solution or help another student understand a concept.</p>
                      </div>
                    ) : messages.map((message) => {
                      const ownMessage = message.senderUid === uid;
                      return (
                        <article key={message.id} className={`flex min-w-0 items-end gap-2 ${ownMessage ? 'flex-row-reverse' : ''}`}>
                          {!ownMessage && <Avatar name={message.senderName} photoURL={message.senderPhotoURL} size="sm" />}
                          <div className={`min-w-0 max-w-[88%] md:max-w-[78%] ${ownMessage ? 'text-right' : ''}`}>
                            <div className={`mb-1 flex items-center gap-2 text-[11px] ${ownMessage ? 'justify-end' : ''}`}>
                              <span className="font-semibold text-slate-600">{ownMessage ? 'You' : message.senderName}</span>
                              <span className="text-slate-400">{formatMessageTime(message.createdAt)}</span>
                            </div>
                            <div className={`rounded-2xl px-3.5 py-3 text-left shadow-sm ${ownMessage ? 'rounded-br-md bg-indigo-600 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'}`}>
                              {message.replyToMessageId && (
                                <div className={`mb-2 rounded-lg border-l-2 px-2.5 py-1.5 text-xs ${ownMessage ? 'border-indigo-200 bg-indigo-500/50 text-indigo-50' : 'border-indigo-400 bg-slate-50 text-slate-500'}`}>
                                  <p className="font-semibold">{message.replyToSenderName}</p>
                                  <p className="mt-0.5 line-clamp-2">{message.replyToText}</p>
                                </div>
                              )}
                              <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.text}</p>
                            </div>
                            <div className={`mt-1 flex items-center gap-3 text-[11px] ${ownMessage ? 'justify-end' : ''}`}>
                              <button type="button" onClick={() => { setReplyTo(message); composerRef.current?.focus(); }} className="inline-flex items-center gap-1 rounded px-1 py-1 font-medium text-slate-500 hover:text-indigo-600">
                                <Reply className="h-3 w-3" /> Reply
                              </button>
                              {ownMessage && (
                                <button type="button" disabled={deletingMessageId === message.id} onClick={() => handleDeleteMessage(message)} className="inline-flex items-center gap-1 rounded px-1 py-1 font-medium text-slate-400 hover:text-rose-600 disabled:opacity-50">
                                  <Trash2 className="h-3 w-3" /> {deletingMessageId === message.id ? 'Deleting…' : 'Delete'}
                                </button>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <form onSubmit={handleSendMessage} className="border-t border-slate-200 bg-white p-3 md:p-4">
                    {replyTo && (
                      <div className="mb-2 flex items-start justify-between gap-3 rounded-lg border-l-2 border-indigo-500 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                        <div className="min-w-0">
                          <p className="font-bold">Replying to {replyTo.senderName}</p>
                          <p className="mt-0.5 line-clamp-2 text-indigo-700">{replyTo.text}</p>
                        </div>
                        <button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(null)} className="rounded p-1 hover:bg-indigo-100"><X className="h-4 w-4" /></button>
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      <textarea
                        ref={composerRef}
                        rows={2}
                        maxLength={MESSAGE_MAX_LENGTH}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={handleComposerKeyDown}
                        placeholder={`Message ${selectedRoom.name}…`}
                        aria-label="Write a community message"
                        className="min-h-12 min-w-0 flex-1 resize-y rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                      />
                      <button type="submit" disabled={!draft.trim() || sending} className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                        {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        <span className="hidden sm:inline">{sending ? 'Sending' : 'Send'}</span>
                      </button>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-slate-400">
                      <span>Enter a message · Ctrl/⌘ + Enter to send</span>
                      <span>{draft.length}/{MESSAGE_MAX_LENGTH}</span>
                    </div>
                  </form>
                </>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <LoaderCircle className="h-6 w-6 animate-spin text-indigo-500" />
              <p className="mt-3 text-sm text-slate-500">Preparing your study rooms…</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><ShieldCheck className="h-5 w-5" /></div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Community guidelines</p>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">Be respectful, explain your reasoning, and never share passwords, OTPs or private contact details in public rooms.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Avatar name={currentUserName} photoURL={user?.photoURL || ''} size="sm" />
          <span>Signed in as <strong className="text-slate-700">{currentUserName}</strong></span>
        </div>
      </div>
    </section>
  );
};

export default Community;
