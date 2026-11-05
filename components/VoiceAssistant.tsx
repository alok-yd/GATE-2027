import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import { sendJarvisMessage } from '../services/assistant/JarvisSession';
import JarvisOverlay, { JarvisVoiceStatus } from './assistant/JarvisOverlay';

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
  const [status, setStatus] = useState<JarvisVoiceStatus>('idle');
  const [sessionActive, setSessionActive] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [reducedMotion, setReducedMotion] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioFrameRef = useRef<number | null>(null);
  const sessionActiveRef = useRef(false);
  const processingRef = useRef(false);
  const mountedRef = useRef(true);
  const statusRef = useRef<JarvisVoiceStatus>('idle');
  const retryDelayRef = useRef(500);
  const meterGenerationRef = useRef(0);

  const updateStatus = (next: JarvisVoiceStatus) => {
    statusRef.current = next;
    if (mountedRef.current) setStatus(next);
  };

  const setSession = (active: boolean) => {
    sessionActiveRef.current = active;
    if (mountedRef.current) setSessionActive(active);
  };

  const clearRestartTimer = () => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  };

  /**
   * Microphone amplitude is measured locally only while SpeechRecognition is
   * listening. No audio is recorded, uploaded or retained. If getUserMedia or
   * Web Audio is unavailable, the orb falls back to state-based animation.
   */
  const stopMicrophoneMeter = () => {
    meterGenerationRef.current += 1;

    if (audioFrameRef.current !== null) {
      window.cancelAnimationFrame(audioFrameRef.current);
      audioFrameRef.current = null;
    }

    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
    analyserRef.current = null;

    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== 'closed') {
      void context.close().catch(() => undefined);
    }

    if (mountedRef.current) setInputLevel(0);
  };

  const startMicrophoneMeter = async () => {
    if (
      !sessionActiveRef.current ||
      statusRef.current !== 'listening' ||
      audioStreamRef.current
    ) {
      return;
    }

    const generation = ++meterGenerationRef.current;
    if (!navigator.mediaDevices?.getUserMedia) return;

    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      if (
        generation !== meterGenerationRef.current ||
        !sessionActiveRef.current ||
        statusRef.current !== 'listening'
      ) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const AudioContextConstructor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!AudioContextConstructor) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      context = new AudioContextConstructor();
      if (context.state === 'suspended') await context.resume();

      if (
        generation !== meterGenerationRef.current ||
        !sessionActiveRef.current ||
        statusRef.current !== 'listening'
      ) {
        stream.getTracks().forEach((track) => track.stop());
        if (context.state !== 'closed') void context.close();
        return;
      }

      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;
      source.connect(analyser);

      audioStreamRef.current = stream;
      audioContextRef.current = context;
      analyserRef.current = analyser;

      const samples = new Uint8Array(analyser.fftSize);
      let lastUiUpdate = 0;

      const sampleMicrophone = (now: number) => {
        if (
          generation !== meterGenerationRef.current ||
          !sessionActiveRef.current ||
          statusRef.current !== 'listening' ||
          !analyserRef.current
        ) {
          return;
        }

        analyserRef.current.getByteTimeDomainData(samples);
        let sumSquares = 0;
        for (let index = 0; index < samples.length; index += 1) {
          const normalized = (samples[index] - 128) / 128;
          sumSquares += normalized * normalized;
        }

        const rms = Math.sqrt(sumSquares / samples.length);
        const normalizedLevel = Math.min(1, Math.max(0, rms * 4.2));

        // Cap React updates to approximately 15 per second. The browser's
        // animation remains smooth through CSS transforms between updates.
        if (now - lastUiUpdate >= 66) {
          lastUiUpdate = now;
          if (mountedRef.current) setInputLevel(normalizedLevel);
        }

        audioFrameRef.current = window.requestAnimationFrame(sampleMicrophone);
      };

      audioFrameRef.current = window.requestAnimationFrame(sampleMicrophone);
    } catch (error) {
      // The voice-recognition engine remains usable even when an additional
      // Web Audio analyser cannot be opened. Do not block the conversation.
      stream?.getTracks().forEach((track) => track.stop());
      if (context && context.state !== 'closed') void context.close();
      if (generation === meterGenerationRef.current) {
        console.info('[J.A.R.V.I.S.] Audio-reactive input meter is unavailable; using state animation.', error);
      }
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

  const startListening = () => {
    if (!sessionActiveRef.current || processingRef.current || recognitionRef.current) return;

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setSession(false);
      stopMicrophoneMeter();
      setErrorMessage('Speech recognition is not supported in this browser. Try the latest version of Chrome or Edge.');
      updateStatus('unsupported');
      return;
    }

    clearRestartTimer();
    setErrorMessage('');

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-IN';
      recognition.interimResults = false;
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
          stopMicrophoneMeter();
          setErrorMessage('Microphone permission was denied. Allow microphone access in your browser settings, then retry.');
          updateStatus('error');
          return;
        }

        if (event?.error && event.error !== 'no-speech' && event.error !== 'aborted') {
          retryDelayRef.current = Math.min(5000, Math.max(800, retryDelayRef.current * 1.5));
          setErrorMessage('The speech service paused unexpectedly. J.A.R.V.I.S. is attempting to reconnect.');
          updateStatus('error');
        }
      };

      recognition.onend = () => {
        if (recognitionRef.current === recognition) recognitionRef.current = null;
        stopMicrophoneMeter();
        if (sessionActiveRef.current && !processingRef.current) {
          scheduleListeningRestart(retryDelayRef.current);
        }
      };

      recognitionRef.current = recognition;
      updateStatus('listening');
      recognition.start();
      void startMicrophoneMeter();
    } catch (error) {
      recognitionRef.current = null;
      stopMicrophoneMeter();
      console.warn('[J.A.R.V.I.S.] Could not start speech recognition.', error);
      setErrorMessage('Could not start microphone capture. Check browser permission and try again.');
      retryDelayRef.current = Math.min(5000, retryDelayRef.current + 700);
      updateStatus('error');
      if (sessionActiveRef.current) scheduleListeningRestart(retryDelayRef.current);
    }
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
    stopMicrophoneMeter();

    try {
      recognition?.stop();
    } catch {
      // The recognizer may already have stopped after emitting a final result.
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
        console.info('[J.A.R.V.I.S.] Read-only fallback answered because the tool-calling provider was unavailable.');
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
      setErrorMessage('I could not reach the AI service. Check your connection; you can retry the voice session.');
      if (sessionActiveRef.current) {
        speakResponse('I could not reach my intelligence service just now. Please check your connection and try again.');
      } else {
        processingRef.current = false;
        updateStatus('error');
      }
    }
  };

  const startSession = () => {
    if (sessionActiveRef.current) return;

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setErrorMessage('Speech recognition is not supported in this browser. Try the latest version of Chrome or Edge.');
      updateStatus('unsupported');
      return;
    }

    retryDelayRef.current = 500;
    setErrorMessage('');
    setSession(true);
    updateStatus('listening');
    startListening();
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
    stopMicrophoneMeter();
    window.speechSynthesis?.cancel();
    utteranceRef.current = null;
    processingRef.current = false;
    setErrorMessage('');
    updateStatus('idle');
  };

  const handleFloatingMicClick = () => {
    setOverlayOpen(true);
    if (!sessionActiveRef.current) startSession();
  };

  const handleMinimize = useCallback(() => {
    // Hiding the holographic overlay must not end the live voice session.
    setOverlayOpen(false);
  }, []);

  const handleEndConversation = () => {
    stopSession();
  };

  const handleStartConversation = () => {
    startSession();
  };

  useEffect(() => {
    mountedRef.current = true;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateReducedMotion = () => setReducedMotion(mediaQuery.matches);
    updateReducedMotion();
    mediaQuery.addEventListener?.('change', updateReducedMotion);

    return () => {
      mountedRef.current = false;
      sessionActiveRef.current = false;
      clearRestartTimer();

      recognitionRef.current?.abort?.();
      recognitionRef.current = null;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;

      stopMicrophoneMeter();
      window.speechSynthesis?.cancel();
      utteranceRef.current = null;
      mediaQuery.removeEventListener?.('change', updateReducedMotion);
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

  const buttonTitle =
    sessionActive
      ? 'Open J.A.R.V.I.S. — voice conversation is active'
      : 'Open J.A.R.V.I.S. and start a voice conversation';

  return (
    <>
      <JarvisOverlay
        open={overlayOpen}
        status={status}
        sessionActive={sessionActive}
        inputLevel={inputLevel}
        errorMessage={errorMessage}
        reducedMotion={reducedMotion}
        onMinimize={handleMinimize}
        onEndConversation={handleEndConversation}
        onStartConversation={handleStartConversation}
      />

      {!overlayOpen && (
        <div className="fixed bottom-6 right-6 z-50">
          <button
            type="button"
            onClick={handleFloatingMicClick}
            aria-label="Open J.A.R.V.I.S. voice assistant"
            aria-pressed={sessionActive}
            title={buttonTitle}
            className={`flex h-14 w-14 items-center justify-center rounded-full border-2 border-white text-white shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300 ${buttonStateClass}`}
          >
            <Mic className="h-6 w-6" />
          </button>
        </div>
      )}
    </>
  );
};

export default VoiceAssistant;
