import React, { useState } from 'react';
import { FocusMode, StudyMedium, SubjectItem } from '../types';
import { BookOpen, Clock, FileText, Monitor, Plus, Target, X } from 'lucide-react';

interface SessionSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjects: SubjectItem[];
  onAddSubject: (name: string, category: string) => SubjectItem;
  onStartSession: (
    subject: string,
    topic: string,
    targetSeconds: number,
    mode: FocusMode,
    goal: string,
    medium: StudyMedium
  ) => void;
}

const DURATION_PRESETS = [
  { label: '45 min', seconds: 45 * 60 },
  { label: '1 hour', seconds: 60 * 60 },
  { label: '90 min', seconds: 90 * 60 },
  { label: '2 hours', seconds: 120 * 60 },
  { label: '3 hours', seconds: 180 * 60 },
  { label: '4 hours', seconds: 240 * 60 },
];

export const SessionSetupModal: React.FC<SessionSetupModalProps> = ({
  isOpen,
  onClose,
  subjects,
  onAddSubject,
  onStartSession,
}) => {
  const [selectedSubject, setSelectedSubject] = useState(subjects[0]?.name || 'Algorithms');
  const [topic, setTopic] = useState('');
  const [goal, setGoal] = useState('');
  const [targetSeconds, setTargetSeconds] = useState(120 * 60);
  const [selectedMedium, setSelectedMedium] = useState<StudyMedium>('Screen Study');
  const [isAddingSubject, setIsAddingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');

  if (!isOpen) return null;

  const handleCreateSubject = (event: React.FormEvent) => {
    event.preventDefault();
    const name = newSubjectName.trim();
    if (!name) return;

    const added = onAddSubject(name, 'Custom');
    setSelectedSubject(added.name);
    setNewSubjectName('');
    setIsAddingSubject(false);
  };

  const handleStart = (event: React.FormEvent) => {
    event.preventDefault();
    onStartSession(
      selectedSubject,
      topic.trim() || 'General Study',
      targetSeconds,
      'Deep Focus',
      goal.trim() || 'Study session',
      selectedMedium
    );
    onClose();
  };

  const selectedDuration = () => {
    const hours = Math.floor(targetSeconds / 3600);
    const minutes = Math.floor((targetSeconds % 3600) / 60);
    return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : '']
      .filter(Boolean)
      .join(' ') || '0m';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/15 text-indigo-300">
              <Target className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold">Start Study Session</h2>
              <p className="text-xs text-zinc-400">Choose your subject and countdown duration</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close session setup"
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleStart} className="space-y-5 p-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                <BookOpen className="h-3.5 w-3.5 text-indigo-300" />
                Subject
              </label>
              <button
                type="button"
                onClick={() => setIsAddingSubject((value) => !value)}
                className="flex items-center gap-1 text-xs font-semibold text-indigo-300 hover:text-indigo-200"
              >
                <Plus className="h-3 w-3" />
                Add subject
              </button>
            </div>

            {isAddingSubject ? (
              <div className="flex gap-2">
                <input
                  value={newSubjectName}
                  onChange={(event) => setNewSubjectName(event.target.value)}
                  placeholder="New subject name"
                  className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleCreateSubject}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500"
                >
                  Save
                </button>
              </div>
            ) : (
              <select
                value={selectedSubject}
                onChange={(event) => setSelectedSubject(event.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-indigo-500"
              >
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.name}>
                    {subject.name}{subject.isGateSubject ? ' (GATE)' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-zinc-300">Topic / Study task</label>
            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="e.g. Dynamic Programming, Cache Memory, OS Scheduling"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-zinc-300">Study mode</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {([
                { value: 'Screen Study' as StudyMedium, label: 'Screen Study', Icon: Monitor },
                { value: 'Paper / PYQ Study' as StudyMedium, label: 'Paper / PYQ', Icon: FileText },
                { value: 'Mixed Study' as StudyMedium, label: 'Mixed Study', Icon: BookOpen },
              ]).map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSelectedMedium(value)}
                  aria-pressed={selectedMedium === value}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2.5 text-[11px] font-semibold transition ${
                    selectedMedium === value
                      ? 'border-indigo-500 bg-indigo-500/15 text-indigo-200'
                      : 'border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-zinc-500'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between text-xs font-semibold text-zinc-300">
              <span className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-emerald-300" />
                Target duration
              </span>
              <span className="font-mono text-sm text-emerald-300">{selectedDuration()}</span>
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {DURATION_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setTargetSeconds(preset.seconds)}
                  className={`rounded-lg border px-3 py-2.5 text-xs font-semibold transition ${
                    targetSeconds === preset.seconds
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-200'
                      : 'border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-zinc-300">Session outcome (optional)</label>
            <input
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="e.g. Solve 5 GATE PYQs"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-indigo-500"
            />
          </div>

          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-xs leading-relaxed text-emerald-200">
            The countdown runs only while a person is detected in front of your webcam. Leaving the frame pauses the timer without resetting the remaining time.
          </div>

          <div className="flex justify-end gap-3 border-t border-zinc-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-xs font-semibold text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:brightness-110"
            >
              Start Session
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SessionSetupModal;
