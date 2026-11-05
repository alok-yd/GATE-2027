import React, { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  BrainCircuit,
  Mic,
  MicOff,
  Plus,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  getJarvisConversationSnapshot,
  JARVIS_DAILY_BRIEFING_PROMPT,
  JARVIS_PREPARATION_REVIEW_PROMPT,
  sendJarvisMessage,
  startNewJarvisConversation,
} from '../services/assistant/JarvisSession';
import type { MentorStoredMessage } from '../services/mentor/MentorStorage';

type VoiceStatus = 'idle' | 'listening' | 'thinking' | 'speaking' | 'unsupported' | 'error';

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event?: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const getSpeechRecognition = (): SpeechRecognitionConstructor | null => {
  const win = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
};

const getInitialMessages = (): MentorStoredMessage[] => {
  try {
    return getJarvisConversationSnapshot().messages;
  } catch {
    return [];
  }
};

const stripMarkdownForSpeech = (value: string) =>
  value
    .replace(/\`\`\`[\s\S]*?\`\`\`/g, ' Code block omitted. ')
    .replace(/[#>*_\`]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

const VoiceAssistant: React.FC = () => {
  const [panelOpen, setPanelOpen] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [messages, setMessages] = useState<MentorStoredMessage[]>(getInitialMessages);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [continuousConversation, setContinuousConversation] = useState(false);
  const [speakTypedReplies, setSpeakTypedReplies] = useState(false);
  const [activeModel, setActiveModel] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const statusRef = useRef<VoiceStatus>('idle');
  const panelOpenRef = useRef(false);
  const continuousRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef<HTMLInputElement | null>(null);

  const updateStatus = (next: VoiceStatus) => {
    statusRef.current = next;
    setStatus(next);
  };

  const refreshMessages = () => {
    try {
      setMessages(getJarvisConversationSnapshot().messages);
    } catch (cause) {
      console.warn('[J.A.R.V.I.S.] Could not refresh shared conversation history.', cause);
    }
  };

  useEffect(() => {
    const handleConversationUpdate = () => refreshMessages();
    window.addEventListener('gate-mentor-conversations-updated', handleConversationUpdate);
    return () => window.removeEventListener('gate-mentor-conversations-updated', handleConversationUpdate);
  }, []);

  useEffect(() => {
    panelOpenRef.current = panelOpen;
  }, [panelOpen]);

  useEffect(() => {
    continuousRef.current = continuousConversation;
  }, [continuousConversation]);

  useEffect(() => {
    if (panelOpen) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, status, panelOpen]);

  const stopListening = () => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    try {
      recognition?.stop();
    } catch {
      // The recognition session may already have ended.
    }
    if (statusRef.current === 'listening') updateStatus('idle');
  };

  const speak = (text: string) => {
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
      updateStatus('idle');
      return;
    }

    const spokenText = stripMarkdownForSpeech(text).slice(0, 1400);
    if (!spokenText) {
      updateStatus('idle');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = 'en-IN';
    utterance.rate = 0.96;
    utterance.pitch = 1;

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice =
      voices.find((voice) => voice.lang.toLowerCase() === 'en-in') ||
      voices.find((voice) => voice.lang.toLowerCase().startsWith('en-in')) ||
      voices.find((voice) => voice.lang.toLowerCase().startsWith('en-'));
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onend = () => {
      updateStatus('idle');
      if (continuousRef.current && panelOpenRef.current) {
        window.setTimeout(() => {
          if (continuousRef.current && panelOpenRef.current && statusRef.current === 'idle') {
            startListening();
          }
        }, 350);
      }
    };
    utterance.onerror = () => updateStatus('idle');

    window.speechSynthesis.cancel();
    updateStatus('speaking');
    window.speechSynthesis.speak(utterance);
  };

  const sendPrompt = async (prompt: string, speakResponse = false) => {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || statusRef.current === 'thinking') return;

    stopListening();
    window.speechSynthesis?.cancel();
    setError('');
    setDraft('');
    updateStatus('thinking');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await sendJarvisMessage(cleanPrompt, controller.signal);
      setMessages(result.conversation.messages);
      setActiveModel(result.model);
      abortControllerRef.current = null;

      if (speakResponse || speakTypedReplies) {
        speak(result.content);
      } else {
        updateStatus('idle');
      }
    } catch (cause) {
      abortControllerRef.current = null;
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        updateStatus('idle');
        return;
      }
      const message = cause instanceof Error ? cause.message : 'J.A.R.V.I.S. could not complete that request.';
      setError(message);
      updateStatus('error');
    }
  };

  const startListening = () => {
    if (!panelOpenRef.current) {
      panelOpenRef.current = true;
      setPanelOpen(true);
    }

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setError('Voice input is not supported in this browser. You can still chat using the text box.');
      updateStatus('unsupported');
      return;
    }

    stopListening();
    window.speechSynthesis?.cancel();
    setError('');

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-IN';
      recognition.interimResults = true;
      recognition.continuous = false;

      recognition.onresult = (event) => {
        let finalTranscript = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (result?.isFinal) finalTranscript += result[0]?.transcript || '';
        }
        const transcript = finalTranscript.trim();
        if (transcript) {
          void sendPrompt(transcript, true);
        }
      };

      recognition.onerror = (event) => {
        recognitionRef.current = null;
        if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
          setError('Microphone permission was denied. Allow microphone access and try again.');
        } else if (event?.error !== 'no-speech' && event?.error !== 'aborted') {
          setError('Voice recognition stopped unexpectedly. You can retry or type your message.');
        }
        updateStatus('error');
      };

      recognition.onend = () => {
        if (recognitionRef.current === recognition) recognitionRef.current = null;
        if (statusRef.current === 'listening') updateStatus('idle');
      };

      recognitionRef.current = recognition;
      updateStatus('listening');
      recognition.start();
    } catch (cause) {
      recognitionRef.current = null;
      setError(cause instanceof Error ? cause.message : 'Could not start microphone input.');
      updateStatus('error');
    }
  };

  const interruptAssistant = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    stopListening();
    window.speechSynthesis?.cancel();
    updateStatus('idle');
  };

  const closePanel = () => {
    interruptAssistant();
    panelOpenRef.current = false;
    setPanelOpen(false);
  };

  const handleFloatingMicClick = () => {
    if (!panelOpenRef.current) {
      panelOpenRef.current = true;
      setPanelOpen(true);
      startListening();
      return;
    }

    if (statusRef.current === 'listening') {
      stopListening();
      return;
    }

    if (statusRef.current === 'thinking' || statusRef.current === 'speaking') {
      interruptAssistant();
      startListening();
      return;
    }

    startListening();
  };

  const handleNewConversation = () => {
    interruptAssistant();
    const conversation = startNewJarvisConversation();
    setMessages(conversation.messages);
    setError('');
    updateStatus('idle');
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void sendPrompt(draft, false);
  };

  const handleQuickPrompt = (prompt: string) => {
    void sendPrompt(prompt, false);
  };

  useEffect(() => () => {
    recognitionRef.current?.abort?.();
    abortControllerRef.current?.abort();
    window.speechSynthesis?.cancel();
  }, []);

  const visibleMessages = messages.slice(-8);
  const statusLabel: Record<VoiceStatus, string> = {
    idle: 'Ready',
    listening: 'Listening',
    thinking: 'Thinking',
    speaking: 'Speaking',
    unsupported: 'Text chat available',
    error: 'Needs attention',
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {panelOpen && (
        <section
          role="dialog"
          aria-label="J.A.R.V.I.S. personal AI assistant"
          aria-modal="false"
          className="flex max-h-[min(680px,calc(100vh-7rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        >
          <header className="flex items-center justify-between gap-3 bg-slate-950 px-4 py-3 text-white">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600">
                <BrainCircuit className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold tracking-wide">J.A.R.V.I.S.</p>
                <p className="truncate text-[10px] text-slate-300">Personal AI Learning &amp; Intelligence</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={handleNewConversation}
                title="Start a new conversation"
                aria-label="Start a new conversation"
                className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={closePanel}
                title="Close assistant"
                aria-label="Close assistant"
                className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
              <span className={`h-2 w-2 rounded-full ${status === 'error' ? 'bg-rose-500' : status === 'listening' ? 'animate-pulse bg-rose-500' : status === 'thinking' || status === 'speaking' ? 'animate-pulse bg-indigo-500' : 'bg-emerald-500'}`} />
              {statusLabel[status]}
            </span>
            <div className="flex items-center gap-2">
              {activeModel && <span className="max-w-[130px] truncate text-[9px] text-slate-400">{activeModel}</span>}
              <NavLink to="/mentor" className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800">
                Full workspace
              </NavLink>
            </div>
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3">
            {visibleMessages.map((message) => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[92%] rounded-xl px-3 py-2.5 text-xs leading-relaxed shadow-sm ${message.role === 'user' ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-800'}`}>
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                </div>
              </div>
            ))}

            {status === 'thinking' && (
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                Checking your current ACHIEVER records…
              </div>
            )}
            {status === 'listening' && (
              <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                Listening for your question. Speak naturally; your microphone is active only after you tap the button.
              </div>
            )}
            {status === 'speaking' && (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                J.A.R.V.I.S. is speaking. Tap the microphone to interrupt.
              </div>
            )}
            {error && (
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {error}
              </div>
            )}
          </div>

          <div className="space-y-2 border-t border-slate-200 bg-white p-3">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={status === 'thinking'}
                onClick={() => handleQuickPrompt(JARVIS_DAILY_BRIEFING_PROMPT)}
                className="inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1.5 text-[10px] font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              >
                <Sparkles className="h-3 w-3" /> Daily briefing
              </button>
              <button
                type="button"
                disabled={status === 'thinking'}
                onClick={() => handleQuickPrompt(JARVIS_PREPARATION_REVIEW_PROMPT)}
                className="rounded-full border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Review preparation
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <input
                ref={draftRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ask J.A.R.V.I.S. anything…"
                aria-label="Message J.A.R.V.I.S."
                className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                disabled={status === 'thinking'}
              />
              <button
                type="submit"
                disabled={status === 'thinking' || !draft.trim()}
                title="Send message"
                aria-label="Send message"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>

            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-[10px] text-slate-500">
                <input
                  type="checkbox"
                  checked={continuousConversation}
                  onChange={(event) => setContinuousConversation(event.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Continue listening after replies
              </label>
              <button
                type="button"
                onClick={() => setSpeakTypedReplies((current) => !current)}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-indigo-700"
                aria-pressed={speakTypedReplies}
              >
                {speakTypedReplies ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                Read typed replies
              </button>
            </div>
            <p className="text-[9px] leading-relaxed text-slate-400">
              Voice is activated only by your click. Conversation history is shared with the existing AI Mentor and saved in this browser.
            </p>
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={handleFloatingMicClick}
        aria-label={status === 'listening' ? 'Stop listening to J.A.R.V.I.S.' : 'Talk to J.A.R.V.I.S.'}
        aria-expanded={panelOpen}
        className={`flex h-14 w-14 items-center justify-center rounded-full border-2 border-white shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 ${
          status === 'listening'
            ? 'bg-red-500 ring-4 ring-red-200 hover:bg-red-600'
            : status === 'thinking' || status === 'speaking'
              ? 'bg-indigo-800 ring-4 ring-indigo-200'
              : 'bg-indigo-600 ring-4 ring-indigo-200 hover:bg-indigo-700'
        }`}
        title="Talk to J.A.R.V.I.S."
      >
        {status === 'listening' ? (
          <MicOff className="h-6 w-6 text-white" />
        ) : (
          <Mic className="h-6 w-6 text-white" />
        )}
      </button>
    </div>
  );
};

export default VoiceAssistant;
