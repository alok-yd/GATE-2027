import React, { useEffect, useState } from 'react';
import { FocusMessage } from '../types';
import { focusMessageEngine } from '../services/FocusMessageEngine';
import {
  Sparkles,
  Smartphone,
  UserX,
  AlertTriangle,
  CheckCircle2,
  Brain,
  Target,
  BookOpen,
  Award,
  Play,
  ArrowRight
} from 'lucide-react';

interface ExecutionCoachBannerProps {
  motivationalMessagesEnabled?: boolean;
  eventMessagesEnabled?: boolean;
  className?: string;
}

export const ExecutionCoachBanner: React.FC<ExecutionCoachBannerProps> = ({
  motivationalMessagesEnabled = true,
  eventMessagesEnabled = true,
  className = ''
}) => {
  const [currentMessage, setCurrentMessage] = useState<FocusMessage | null>(() =>
    focusMessageEngine.getCurrentMessage()
  );
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const unsub = focusMessageEngine.subscribe((msg) => {
      // Subtle fade out then fade in on message change
      setVisible(false);
      const timer = setTimeout(() => {
        setCurrentMessage(msg);
        setVisible(true);
      }, 150);

      return () => clearTimeout(timer);
    });

    return () => unsub();
  }, []);

  const getCategoryStyles = (category?: string, priority?: string) => {
    switch (category) {
      case 'PHONE':
        return {
          icon: <Smartphone className="w-3.5 h-3.5 text-rose-400 shrink-0 animate-pulse" />,
          container: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
          dot: 'bg-rose-500'
        };
      case 'AWAY':
        return {
          icon: <UserX className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
          container: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
          dot: 'bg-amber-400'
        };
      case 'DISTRACTION':
        return {
          icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
          container: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
          dot: 'bg-amber-400'
        };
      case 'RETURN':
      case 'RECOVERY':
        return {
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
          container: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
          dot: 'bg-emerald-400'
        };
      case 'THINKING':
        return {
          icon: <Brain className="w-3.5 h-3.5 text-sky-400 shrink-0" />,
          container: 'bg-sky-500/10 border-sky-500/30 text-sky-300',
          dot: 'bg-sky-400'
        };
      case 'PYQ':
        return {
          icon: <Target className="w-3.5 h-3.5 text-teal-400 shrink-0" />,
          container: 'bg-teal-500/10 border-teal-500/30 text-teal-300',
          dot: 'bg-teal-400'
        };
      case 'REVISION':
        return {
          icon: <BookOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />,
          container: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300',
          dot: 'bg-indigo-400'
        };
      case 'TEST':
        return {
          icon: <Award className="w-3.5 h-3.5 text-purple-400 shrink-0" />,
          container: 'bg-purple-500/10 border-purple-500/30 text-purple-300',
          dot: 'bg-purple-400'
        };
      case 'SESSION_START':
      case 'FIRST_OF_DAY':
        return {
          icon: <Play className="w-3.5 h-3.5 text-indigo-400 shrink-0 fill-indigo-400/30" />,
          container: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300',
          dot: 'bg-indigo-400'
        };
      default:
        return {
          icon: <Sparkles className="w-3.5 h-3.5 text-indigo-400/80 shrink-0" />,
          container: 'bg-zinc-900/80 border-zinc-800 text-zinc-300',
          dot: 'bg-zinc-500'
        };
    }
  };

  const isEventMessage = currentMessage && ['PHONE', 'AWAY', 'DISTRACTION', 'RETURN'].includes(currentMessage.category);

  // If event messages disabled, do not show event-specific messages
  const shouldRenderDynamic =
    motivationalMessagesEnabled &&
    currentMessage &&
    (!isEventMessage || eventMessagesEnabled);

  const styles = getCategoryStyles(currentMessage?.category, currentMessage?.priority);

  return (
    <div className={`w-full flex flex-col items-center justify-center space-y-2 select-none ${className}`}>
      {/* Permanent Primary Execution Headline (Prompt Section 2 & 18 & 47) */}
      <div className="text-center font-semibold tracking-wider text-xs sm:text-sm text-zinc-400/90 uppercase letter-spacing-1">
        FOCUS ON TODAY'S EXECUTION.
      </div>

      {/* Dynamic Contextual / Rotating Coach Message Pill */}
      {shouldRenderDynamic && currentMessage && (
        <div
          role={currentMessage.priority === 'CRITICAL' || currentMessage.priority === 'HIGH' ? 'alert' : 'status'}
          aria-live={currentMessage.priority === 'CRITICAL' ? 'assertive' : 'polite'}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-medium max-w-md text-center transition-all duration-300 shadow-xs ${
            styles.container
          } ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
        >
          {styles.icon}
          <span className="tracking-wide">{currentMessage.text}</span>
        </div>
      )}
    </div>
  );
};
