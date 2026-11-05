import React, { useEffect, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import { sendJarvisMessage } from '../services/assistant/JarvisSession';

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

const cleanForSpeech = (value: string) =>
  value
    .replace(/```[\s\S]*?```/g, ' Code example omitted. ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_\x60]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const VoiceAssistant: React.FC = () => {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [sessionActive, setSessionActive] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionActiveRef = useRef(false);
  const processingRef = useRef(false);
  const mountedRef = useRef(true);
  const statusRef = useRef<VoiceStatus>('idle');
  const retryDelayRef = useRef(500);

  const updateStatus = (next: VoiceStatus) => {
    statusRef.current = next;
    if (mountedRef.current) setStatus(next);
  };

  const clearRestartTimer = () => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  };

  const setSession = (active: boolean) => {
    sessionActiveRef.current = active;
    if (mountedRef.current) setSessionActive(active);
  };

  const startListening = () => {
    if (
      !sessionActiveRef.current ||
      processingRef.current ||
      recognitionRef.current
    ) {
      return;
    }

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setSession(false);
      updateStatus('unsupported');
      return;
    }

    clearRestartTimer();

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-IN';
      recognition.interimResults = false;
      // Keep the browser recognizer open for a conversational session. It is
      // paused during model generation and speech playback to prevent echo.
      recognition.continuous = true;

      recognition.onresult = (event) => {
        let transcript = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (result?.isFinal) transcript += result[0]?.transcript || '';
        }
        const finalText = transcript.trim();
        if (finalText && !processingRef.current) {
          retryDelayRef.current = 500;
          void handleRecognisedSpeech(finalText);
        }
      };

      recognition.onerror = (event) => {
        if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
          setSession(false);
          updateStatus('error');
          return;
        }

        // no-speech and transient network errors are recoverable. The browser
        // fires onend afterwards; that handler restarts while the session is on.
        if (event?.error && event.error !== 'no-speech' && event.error !== 'aborted') {
          retryDelayRef.current = Math.min(5000, Math.max(800, retryDelayRef.current * 1.5));
          updateStatus('error');
        }
      };

      recognition.onend = () => {
        if (recognitionRef.current === recognition) recognitionRef.current = null;
        if (sessionActiveRef.current && !processingRef.current) {
          scheduleListeningRestart(retryDelayRef.current);
        }
      };

      recognitionRef.current = recognition;
      updateStatus('listening');
      recognition.start();
    } catch (error) {
      recognitionRef.current = null;
      console.warn('[J.A.R.V.I.S.] Could not start speech recognition.', error);
      retryDelayRef.current = Math.min(5000, retryDelayRef.current + 700);
      updateStatus('error');
      if (sessionActiveRef.current) scheduleListeningRestart(retryDelayRef.current);
    }
  };

  const scheduleListeningRestart = (delay = 450) => {
    clearRestartTimer();
    if (!sessionActiveRef.current || processingRef.current) return;

    restartTimerRef.current = window.setTimeout(() => {
      restartTimerRef.current = null;
      startListening();
    }, delay);
  };

  const finishAssistantTurn = () => {
    utteranceRef.current = null;
    processingRef.current = false;
    if (sessionActiveRef.current) {
      scheduleListeningRestart(400);
    } else {
      updateStatus('idle');
    }
  };

  const speakResponse = (text: string) => {
    const speechText = cleanForSpeech(text).slice(0, 1800);
    if (!speechText || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
      finishAssistantTurn();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.lang = 'en-IN';
    utterance.rate = 0.96;
    utterance.pitch = 1;

    const availableVoices = window.speechSynthesis.getVoices();
    const preferredVoice =
      availableVoices.find((voice) => voice.lang.toLowerCase() === 'en-in') ||
      availableVoices.find((voice) => voice.lang.toLowerCase().startsWith('en-in')) ||
      availableVoices.find((voice) => voice.lang.toLowerCase().startsWith('en-'));
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onend = finishAssistantTurn;
    utterance.onerror = finishAssistantTurn;
    utteranceRef.current = utterance;
    updateStatus('speaking');
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const handleRecognisedSpeech = async (transcript: string) => {
    if (processingRef.current || !sessionActiveRef.current) return;

    processingRef.current = true;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    try {
      recognition?.stop();
    } catch {
      // The recognizer may already have stopped after emitting its final result.
    }

    window.speechSynthesis?.cancel();
    updateStatus('thinking');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await sendJarvisMessage(transcript, controller.signal);
      abortControllerRef.current = null;

      if (!sessionActiveRef.current) {
        processingRef.current = false;
        updateStatus('idle');
        return;
      }

      if (!result.toolCalling) {
        console.info(
          '[J.A.R.V.I.S.] Read-only fallback answered because the tool-calling provider was unavailable.'
        );
      }
      speakResponse(result.content);
    } catch (error) {
      abortControllerRef.current = null;
      if (error instanceof DOMException && error.name === 'AbortError') {
        processingRef.current = false;
        updateStatus('idle');
        if (sessionActiveRef.current) scheduleListeningRestart(400);
        return;
      }

      console.error('[J.A.R.V.I.S.] Voice response failed.', error);
      if (sessionActiveRef.current) {
        speakResponse('I could not reach my intelligence service just now. Please try asking again.');
      } else {
        processingRef.current = false;
        updateStatus('idle');
      }
    }
  };

  const stopSession = () => {
    setSession(false);
    clearRestartTimer();

    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    try {
      recognition?.abort?.();
      recognition?.stop();
    } catch {
      // The browser session may already have ended.
    }

    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    window.speechSynthesis?.cancel();
    utteranceRef.current = null;
    processingRef.current = false;
    updateStatus('idle');
  };

  const toggleSession = () => {
    if (sessionActiveRef.current) {
      stopSession();
      return;
    }

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      updateStatus('unsupported');
      return;
    }

    retryDelayRef.current = 500;
    setSession(true);
    updateStatus('listening');
    startListening();
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionActiveRef.current = false;
      clearRestartTimer();
      recognitionRef.current?.abort?.();
      recognitionRef.current = null;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      window.speechSynthesis?.cancel();
      utteranceRef.current = null;
    };
  }, []);

  const buttonStateClass =
    status === 'listening'
      ? 'bg-indigo-600 ring-4 ring-indigo-200 animate-pulse hover:bg-indigo-700'
      : status === 'thinking'
        ? 'bg-amber-500 ring-4 ring-amber-200'
        : status === 'speaking'
          ? 'bg-indigo-800 ring-4 ring-indigo-200'
          : status === 'error' || status === 'unsupported'
            ? 'bg-rose-600 ring-4 ring-rose-200'
            : 'bg-indigo-600 ring-4 ring-indigo-200 hover:bg-indigo-700';

  const title =
    status === 'listening'
      ? 'J.A.R.V.I.S. is listening — click to stop'
      : status === 'thinking'
        ? 'J.A.R.V.I.S. is processing — click to stop'
        : status === 'speaking'
          ? 'J.A.R.V.I.S. is replying — click to interrupt and stop'
          : status === 'unsupported'
            ? 'Speech recognition is not supported in this browser'
            : status === 'error'
              ? 'Microphone or speech service needs attention — click to retry'
              : 'Talk to J.A.R.V.I.S.';

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <button
        type="button"
        onClick={toggleSession}
        aria-label={sessionActive ? 'Stop J.A.R.V.I.S. voice conversation' : 'Start J.A.R.V.I.S. voice conversation'}
        aria-pressed={sessionActive}
        title={title}
        className={`flex h-14 w-14 items-center justify-center rounded-full border-2 border-white text-white shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300 ${buttonStateClass}`}
      >
        <Mic className="h-6 w-6" />
        <span className="sr-only">
          {status === 'listening'
            ? 'Listening continuously. Click to stop.'
            : status === 'thinking'
              ? 'Processing your request.'
              : status === 'speaking'
                ? 'Speaking a response.'
                : status === 'unsupported'
                  ? 'Speech recognition is unavailable in this browser.'
                  : status === 'error'
                    ? 'Voice assistant needs attention.'
                    : 'Start voice conversation.'}
        </span>
      </button>
    </div>
  );
};

export default VoiceAssistant;
