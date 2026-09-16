import React, { useEffect, useRef, useState } from 'react';
import { aiHub } from '../services/AIServiceHub';

type VoiceStatus = 'idle' | 'listening' | 'thinking' | 'speaking' | 'unsupported';

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: any) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

const getSpeechRecognition = () => {
  const win = window as any;
  return win.SpeechRecognition || win.webkitSpeechRecognition;
};

const VoiceAssistant: React.FC = () => {
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const stopSession = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    window.speechSynthesis?.cancel();
    setActive(false);
    setStatus('idle');
  };

  const speak = (text: string) => {
    if (!window.speechSynthesis) {
      setActive(false);
      setStatus('idle');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text.slice(0, 700));
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => {
      setActive(false);
      setStatus('idle');
    };
    setStatus('speaking');
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const answerTranscript = async (transcript: string) => {
    setStatus('thinking');
    const response =
      (await aiHub.askAchiever(transcript)) ||
      `I could not reach the AI Gateway. Open the AI Mentor and ask: ${transcript}`;
    speak(response);
  };

  const startSession = () => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setStatus('unsupported');
      setActive(true);
      return;
    }

    const recognition = new SpeechRecognition() as SpeechRecognitionLike;
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) void answerTranscript(transcript);
      else stopSession();
    };
    recognition.onerror = () => stopSession();
    recognition.onend = () => {
      if (status === 'listening') stopSession();
    };

    recognitionRef.current = recognition;
    setActive(true);
    setStatus('listening');
    recognition.start();
  };

  useEffect(() => () => stopSession(), []);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {active && (
        <div
          className={`rounded-xl px-4 py-2 text-sm font-semibold shadow-lg transition-all duration-300 ${
            status === 'speaking'
              ? 'bg-indigo-600 text-white'
              : status === 'thinking'
                ? 'bg-slate-800 text-slate-200'
                : status === 'unsupported'
                  ? 'bg-amber-500 text-slate-900'
                  : 'bg-red-500 text-white'
          }`}
        >
          {status === 'listening' && 'Listening...'}
          {status === 'thinking' && 'Thinking...'}
          {status === 'speaking' && 'Speaking...'}
          {status === 'unsupported' && 'Voice input is not supported in this browser'}
        </div>
      )}

      <button
        onClick={active ? stopSession : startSession}
        className={`flex h-14 w-14 items-center justify-center rounded-full border-2 border-white shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 ${
          active
            ? 'bg-red-500 ring-4 ring-red-200 hover:bg-red-600'
            : 'bg-indigo-600 ring-4 ring-indigo-200 hover:bg-indigo-700'
        }`}
        title="Talk to Achiever"
      >
        {active ? (
          <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
        )}
      </button>
    </div>
  );
};

export default VoiceAssistant;
