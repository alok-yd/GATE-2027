import React, { useState, useEffect, useMemo } from 'react';
import { LectureSubject, PreparationPhase } from '../types';
import {
  areAllSubjectsLecturesComplete,
  getLecturePhaseStatus,
  getStoredSubjects,
  getSubjectLectureStatus,
} from '../services/DataExtractor';

interface DailyProgress {
  date: string;
  count: number;
  goal: number;
}

interface DailyTarget {
  date: string;
  subject: string;
  goalDescription: string;
  hoursStudied: number;
  completionPercentage: number;
}

interface WeeklyTarget {
  weekId: string; // Start date of the week (Sunday)
  focus: string;
  targetLectures: number;
  completedLectures: number;
}

const Tracker: React.FC = () => {
  const [subjects, setSubjects] = useState<LectureSubject[]>([]);
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly'>('daily');

  // Dynamic Lecture Phase Status
  const phaseStatus = useMemo(() => getLecturePhaseStatus(subjects), [subjects]);
  const allSubjectsComplete = phaseStatus.allComplete;
  
  // Date State for Daily View
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Daily Lecture Counter
  const [dailyProgress, setDailyProgress] = useState<DailyProgress>({ date: '', count: 0, goal: 3 });
  
  // Daily Target/Log State
  const [dailyTarget, setDailyTarget] = useState<DailyTarget>({
    date: selectedDate,
    subject: '',
    goalDescription: '',
    hoursStudied: 0,
    completionPercentage: 0
  });

  // Weekly Target State
  const [weeklyTarget, setWeeklyTarget] = useState<WeeklyTarget>({
    weekId: '',
    focus: '',
    targetLectures: 15,
    completedLectures: 0
  });
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<LectureSubject | null>(null);
  const [modalFormData, setModalFormData] = useState<Partial<LectureSubject>>({
    name: '',
    totalLectures: 0,
    phase: 2,
    color: 'bg-indigo-500',
    completedLectures: 0,
  });

  const COLORS = [
    'bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-pink-500', 
    'bg-rose-500', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 
    'bg-sky-500', 'bg-green-500', 'bg-orange-500', 'bg-red-500'
  ];

  const normalizeSubject = (value: string) =>
    value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

  const subjectAliases: Record<string, string> = {
    aptitude: 'aptitude',
    generalaptitude: 'aptitude',
    math: 'math',
    maths: 'math',
    engineeringmath: 'math',
    engineeringmathematics: 'math',
    algorithm: 'algo',
    algorithms: 'algo',
    algo: 'algo',
    ds: 'ds',
    datastructure: 'ds',
    datastructures: 'ds',
    os: 'os',
    operatingsystem: 'os',
    operatingsystems: 'os',
    dbms: 'dbms',
    databasemanagementsystem: 'dbms',
    databasemanagementsystems: 'dbms',
    cn: 'cn',
    computernetwork: 'cn',
    computernetworks: 'cn',
    toc: 'toc',
    theoryofcomputation: 'toc',
    compiler: 'compiler',
    compilerdesign: 'compiler',
    compilers: 'compiler',
    digital: 'digital',
    digitallogic: 'digital',
    coa: 'coa',
    computerorgandarch: 'coa',
    computerorganizationandarchitecture: 'coa',
    computerarchitecture: 'coa',
    cprog: 'cprog',
    clanguage: 'cprog',
    cprogramming: 'cprog',
  };

  const getSubjectKey = (subject: LectureSubject) => {
    const normalizedName = normalizeSubject(subject.name);
    const normalizedId = normalizeSubject(subject.id);
    return subjectAliases[normalizedName] || subjectAliases[normalizedId] || normalizedName || normalizedId;
  };

  const shouldReplaceDuplicate = (candidate: LectureSubject, current: LectureSubject) => {
    const key = getSubjectKey(candidate);
    if (key !== 'cprog') return false;
    return normalizeSubject(candidate.name) === 'cprogramming' && normalizeSubject(current.name) !== 'cprogramming';
  };

  const removeDuplicateSubjects = (items: LectureSubject[]) => {
    const uniqueSubjects = new Map<string, LectureSubject>();
    items.forEach((subject) => {
      const key = getSubjectKey(subject);
      const existing = uniqueSubjects.get(key);
      if (!existing || shouldReplaceDuplicate(subject, existing)) {
        uniqueSubjects.set(key, subject);
      }
    });
    return Array.from(uniqueSubjects.values());
  };

  // Helper: Get Week ID (Sunday)
  const getWeekId = (dateString: string) => {
    const d = new Date(dateString);
    const day = d.getDay();
    const diff = d.getDate() - day; // Adjust when day is Sunday
    const weekStart = new Date(d.setDate(diff));
    return weekStart.toISOString().split('T')[0];
  };

  // Helper: Update Streak
  const checkAndUpdateStreak = () => {
    const today = new Date().toISOString().split('T')[0];
    const stored = localStorage.getItem('gate_streak_data');
    let data = stored ? JSON.parse(stored) : { currentStreak: 0, lastLogDate: '' };

    // If already logged today, do nothing to the count (streak maintained)
    if (data.lastLogDate === today) {
      return;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // If last log was yesterday, increment. Otherwise (older than yesterday), reset to 1.
    if (data.lastLogDate === yesterdayStr) {
      data.currentStreak += 1;
    } else {
      data.currentStreak = 1;
    }

    data.lastLogDate = today;
    localStorage.setItem('gate_streak_data', JSON.stringify(data));
    
    // Dispatch storage event to update dashboard if needed immediately (though usually separate page)
    window.dispatchEvent(new Event('storage'));
  };

  // Initialize Data & Load on Date Change
  useEffect(() => {
    // 1. Load Subjects (Once)
    if (subjects.length === 0) {
      const migratedSubjects = removeDuplicateSubjects(getStoredSubjects());
      setSubjects(migratedSubjects);
      localStorage.setItem('gate_subjects', JSON.stringify(migratedSubjects));
    }

    // 2. Load Daily Progress for Selected Date
    const dateSpecificProgress = localStorage.getItem(`gate_progress_${selectedDate}`);
    if (dateSpecificProgress) {
        setDailyProgress(JSON.parse(dateSpecificProgress));
    } else {
        // Default new entry
        setDailyProgress({ date: selectedDate, count: 0, goal: 3 });
    }

    // 3. Load Daily Target Log for Selected Date
    const storedTarget = localStorage.getItem(`gate_daily_target_${selectedDate}`);
    if (storedTarget) {
      setDailyTarget(JSON.parse(storedTarget));
    } else {
      setDailyTarget({
        date: selectedDate,
        subject: '',
        goalDescription: '',
        hoursStudied: 0,
        completionPercentage: 0
      });
    }

    // 4. Load Weekly Target
    const currentWeekId = getWeekId(selectedDate);
    const storedWeekly = localStorage.getItem(`gate_weekly_target_${currentWeekId}`);
    if (storedWeekly) {
      setWeeklyTarget(JSON.parse(storedWeekly));
    } else {
      setWeeklyTarget({
        weekId: currentWeekId,
        focus: '',
        targetLectures: 15,
        completedLectures: 0
      });
    }

  }, [selectedDate, subjects.length]);

  // Save Subjects
  const saveSubjects = (newSubjects: LectureSubject[]) => {
    const uniqueSubjects = removeDuplicateSubjects(newSubjects);
    setSubjects(uniqueSubjects);
    localStorage.setItem('gate_subjects', JSON.stringify(uniqueSubjects));
  };

  // Save Daily Progress
  const updateDailyProgress = (newProgress: DailyProgress) => {
    setDailyProgress(newProgress);
    localStorage.setItem(`gate_progress_${newProgress.date}`, JSON.stringify(newProgress));
    // Also update global for dashboard reference if it's today
    const today = new Date().toISOString().split('T')[0];
    if (newProgress.date === today) {
        localStorage.setItem('gate_daily_progress', JSON.stringify(newProgress));
    }
  };

  // Save Daily Target Log
  const handleTargetChange = (field: keyof DailyTarget, value: any) => {
    const updated = { ...dailyTarget, [field]: value };
    setDailyTarget(updated);
    localStorage.setItem(`gate_daily_target_${updated.date}`, JSON.stringify(updated));

    // Update streak if user is logging meaningful progress (hours or completion) for TODAY
    const today = new Date().toISOString().split('T')[0];
    if (updated.date === today && (field === 'hoursStudied' || field === 'completionPercentage')) {
      if (Number(value) > 0) {
        checkAndUpdateStreak();
      }
    }
  };

  // Save Weekly Target
  const handleWeeklyChange = (field: keyof WeeklyTarget, value: any) => {
    const updated = { ...weeklyTarget, [field]: value };
    setWeeklyTarget(updated);
    localStorage.setItem(`gate_weekly_target_${updated.weekId}`, JSON.stringify(updated));
  };

  const updateLectures = (id: string, delta: number) => {
    // Update Subject
    const updatedSubjects = subjects.map(s => {
      if (s.id === id) {
        const newVal = Math.max(0, Math.min(s.totalLectures, s.completedLectures + delta));
        return { ...s, completedLectures: newVal };
      }
      return s;
    });
    saveSubjects(updatedSubjects);

    // Update Daily Progress if incrementing (only if selected date is today, generally)
    // We allow editing past dates, so we update the counter for the *selected* date
    if (delta > 0) {
      updateDailyProgress({ ...dailyProgress, count: dailyProgress.count + 1 });
      // Also update Weekly Progress
      handleWeeklyChange('completedLectures', weeklyTarget.completedLectures + 1);

      // Check Streak only if updating for TODAY (or assume any active work counts)
      // Usually strict apps require the date to be today.
      const today = new Date().toISOString().split('T')[0];
      if (selectedDate === today) {
        checkAndUpdateStreak();
      }
    } else if (delta < 0) {
      if (dailyProgress.count > 0) updateDailyProgress({ ...dailyProgress, count: dailyProgress.count - 1 });
      if (weeklyTarget.completedLectures > 0) handleWeeklyChange('completedLectures', weeklyTarget.completedLectures - 1);
    }
  };

  const handleGoalChange = (newGoal: number) => {
    updateDailyProgress({ ...dailyProgress, goal: Math.max(1, newGoal) });
  };

  const downloadReport = () => {
    const today = new Date().toISOString().split('T')[0];
    let reportContent = `GATE 2027 PROGRESS REPORT\nGenerated on: ${today}\n\n`;

    // 1. Overall Stats
    const streakData = JSON.parse(localStorage.getItem('gate_streak_data') || '{"currentStreak": 0}');
    reportContent += `CURRENT STREAK: ${streakData.currentStreak} Days\n`;
    reportContent += `PREPARATION PHASE: ${allSubjectsComplete ? 'POST-LECTURE MASTERY' : 'LECTURE COMPLETION'}\n`;

    const totalLectures = subjects.reduce((acc, s) => acc + s.totalLectures, 0);
    const completedLectures = subjects.reduce((acc, s) => acc + s.completedLectures, 0);
    const percentage = totalLectures > 0 ? Math.round((completedLectures / totalLectures) * 100) : 0;
    reportContent += `OVERALL SYLLABUS COMPLETION: ${percentage}% (${completedLectures}/${totalLectures} Lectures)\n\n`;

    // 2. Subject Breakdown
    reportContent += `--- SUBJECT BREAKDOWN ---\n`;
    subjects.forEach(s => {
      const p = Math.round((s.completedLectures / s.totalLectures) * 100);
      const isDone = s.completedLectures >= s.totalLectures;
      reportContent += `[${s.phase === 1 ? 'Phase 1' : 'Phase 2'}] ${s.name}: ${s.completedLectures}/${s.totalLectures} (${p}%) ${isDone ? '✓ COMPLETED' : 'IN PROGRESS'}\n`;
    });
    reportContent += '\n';

    // 3. Weekly Goals
    reportContent += `--- WEEKLY GOALS HISTORY ---\n`;
    const weeklyKeys = Object.keys(localStorage).filter(k => k.startsWith('gate_weekly_target_')).sort().reverse();
    if (weeklyKeys.length === 0) {
        reportContent += "No weekly data recorded.\n";
    }
    weeklyKeys.forEach(key => {
        try {
            const w = JSON.parse(localStorage.getItem(key) || '{}');
            reportContent += `Week of ${w.weekId}:\n`;
            reportContent += `  Focus: ${w.focus ? w.focus.replace(/\n/g, ', ') : 'No focus set'}\n`;
            if (allSubjectsComplete && (!w.targetLectures || w.targetLectures <= 0)) {
              reportContent += `  Target: No mandatory lectures (Completed Syllabus) | Optional Review: ${w.completedLectures || 0}\n`;
              reportContent += `  Status: 100% (Post-Lecture Phase)\n\n`;
            } else {
              reportContent += `  Target: ${w.targetLectures} Lectures | Completed: ${w.completedLectures}\n`;
              const rate = w.targetLectures > 0 ? Math.round((w.completedLectures / w.targetLectures) * 100) : 100;
              reportContent += `  Status: ${rate}%\n\n`;
            }
        } catch (e) {}
    });

    // 4. Daily Logs
    reportContent += `--- DAILY LOGS HISTORY ---\n`;
    const dailyKeys = Object.keys(localStorage).filter(k => k.startsWith('gate_daily_target_')).sort().reverse();
    if (dailyKeys.length === 0) {
        reportContent += "No daily logs recorded.\n";
    }
    dailyKeys.forEach(key => {
        try {
            const d = JSON.parse(localStorage.getItem(key) || '{}');
            reportContent += `Date: ${d.date}\n`;
            reportContent += `  Subject: ${d.subject || 'N/A'}\n`;
            reportContent += `  Goal: ${d.goalDescription ? d.goalDescription.replace(/\n/g, ' ') : 'N/A'}\n`;
            reportContent += `  Studied: ${d.hoursStudied} hrs | Completion: ${d.completionPercentage}%\n\n`;
        } catch (e) {}
    });

    // Trigger Download
    const blob = new Blob([reportContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GATE_Progress_Report_${today}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  // Modal Handlers
  const openAddModal = () => {
    setEditingSubject(null);
    setModalFormData({
      name: '',
      totalLectures: 20,
      phase: 2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      completedLectures: 0
    });
    setIsModalOpen(true);
  };

  const openEditModal = (subject: LectureSubject) => {
    setEditingSubject(subject);
    setModalFormData({ ...subject });
    setIsModalOpen(true);
  };

  const handleDeleteSubject = (id: string) => {
    if (window.confirm("Are you sure you want to delete this subject?")) {
      const filtered = subjects.filter(s => s.id !== id);
      saveSubjects(filtered);
    }
  };

  const handleModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingSubject) {
      // Edit
      const updated = subjects.map(s => s.id === editingSubject.id ? { ...s, ...modalFormData } as LectureSubject : s);
      saveSubjects(updated);
    } else {
      // Add
      const newSubject: LectureSubject = {
        ...(modalFormData as LectureSubject),
        id: `custom_${Date.now()}`,
      };
      saveSubjects([...subjects, newSubject]);
    }
    setIsModalOpen(false);
  };

  const displaySubjects = removeDuplicateSubjects(subjects);
  const phase2Subjects = displaySubjects.filter(s => s.phase === 2);
  const phase1Subjects = displaySubjects.filter(s => s.phase === 1);

  return (
    <div className="space-y-8">
      
      {/* View Toggle */}
      <div className="flex justify-center pb-4">
        <div className="bg-slate-200 p-1 rounded-lg flex items-center shadow-inner">
          <button
            onClick={() => setActiveTab('daily')}
            className={`px-6 py-2 rounded-md text-sm font-bold transition-all ${
              activeTab === 'daily' 
                ? 'bg-white text-indigo-600 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Daily Tracker
          </button>
          <button
            onClick={() => setActiveTab('weekly')}
            className={`px-6 py-2 rounded-md text-sm font-bold transition-all ${
              activeTab === 'weekly' 
                ? 'bg-white text-indigo-600 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Weekly Goals
          </button>
        </div>
      </div>

      {activeTab === 'daily' ? (
        <>
          {/* Daily Target Log Section */}
          <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 px-6 py-4 flex flex-col md:flex-row justify-between items-center text-white">
              <div className="flex items-center gap-3 mb-2 md:mb-0">
                <div className="p-2 bg-amber-500 rounded-lg text-slate-900">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                </div>
                <div>
                    <h2 className="font-bold text-lg leading-none">Daily Study Log</h2>
                    <p className="text-xs text-slate-400 mt-1">Select date to track past progress.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                 <input 
                   type="date"
                   value={selectedDate}
                   onChange={(e) => setSelectedDate(e.target.value)}
                   className="bg-slate-800 text-amber-400 font-bold px-3 py-1.5 rounded border border-slate-700 focus:outline-none focus:border-amber-500 text-sm"
                 />
              </div>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Subject Focus</label>
                  <input 
                    type="text" 
                    value={dailyTarget.subject}
                    onChange={(e) => handleTargetChange('subject', e.target.value)}
                    placeholder="e.g. DBMS, Algorithms, or Aptitude"
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Today's Goal / Target</label>
                  <textarea 
                    value={dailyTarget.goalDescription}
                    onChange={(e) => handleTargetChange('goalDescription', e.target.value)}
                    placeholder={allSubjectsComplete ? "e.g. Revise Memory Management, Solve 30 CN PYQs, Sectional Mock..." : "e.g. Revise Unit 3, Solve 20 PYQs, Complete 2 lectures..."}
                    rows={4}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-none transition shadow-sm"
                  />
                </div>
              </div>

              <div className="space-y-6 flex flex-col justify-center">
                <div className="bg-slate-50 p-5 rounded-xl border border-slate-100">
                  <label className="block text-sm font-bold text-slate-700 mb-2">Total Hours Studied</label>
                  <div className="flex items-center gap-4">
                    <input 
                      type="number" 
                      value={dailyTarget.hoursStudied}
                      onChange={(e) => handleTargetChange('hoursStudied', parseFloat(e.target.value) || 0)}
                      className="w-32 px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-xl font-bold text-slate-800"
                      min="0"
                      step="0.5"
                    />
                    <span className="text-slate-500 font-medium">hours</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-5 rounded-xl border border-slate-100">
                  <div className="flex justify-between items-end mb-4">
                    <label className="block text-sm font-bold text-slate-700">Goal Completion (End of Day)</label>
                    <span className={`font-bold text-2xl ${dailyTarget.completionPercentage === 100 ? 'text-green-600' : 'text-indigo-600'}`}>
                      {dailyTarget.completionPercentage}%
                    </span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={dailyTarget.completionPercentage}
                    onChange={(e) => handleTargetChange('completionPercentage', parseInt(e.target.value))}
                    className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 hover:accent-indigo-700 transition-all"
                  />
                  <div className="flex justify-between text-xs text-slate-400 mt-2 font-medium uppercase tracking-wide">
                    <span>Started (0%)</span>
                    <span>Halfway (50%)</span>
                    <span>Done (100%)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Daily Lecture / Review Goal Counter */}
          <div className={`p-6 rounded-xl border shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 ${allSubjectsComplete ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-100' : 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-100'}`}>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h2 className={`text-lg font-bold ${allSubjectsComplete ? 'text-emerald-950' : 'text-amber-900'}`}>
                  {allSubjectsComplete ? "Today's Concept Review" : "Today's Lecture Count"}
                </h2>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${allSubjectsComplete ? 'text-emerald-700 bg-emerald-200' : 'text-amber-700 bg-amber-200'}`}>
                  {allSubjectsComplete ? "Optional • Self-Paced" : "Automated"}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className={`flex-1 h-4 rounded-full overflow-hidden ${allSubjectsComplete ? 'bg-emerald-200' : 'bg-amber-200'}`}>
                    <div 
                      className={`h-full transition-all duration-500 ease-out ${allSubjectsComplete ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      style={{ width: `${allSubjectsComplete ? (dailyProgress.count > 0 ? 100 : 0) : Math.min(100, (dailyProgress.count / (dailyProgress.goal || 1)) * 100)}%` }}
                    ></div>
                </div>
                <span className={`font-bold whitespace-nowrap ${allSubjectsComplete ? 'text-emerald-900' : 'text-amber-900'}`}>
                  {allSubjectsComplete 
                    ? `${dailyProgress.count} Review Session${dailyProgress.count === 1 ? '' : 's'}` 
                    : `${dailyProgress.count} / ${dailyProgress.goal} Lectures`}
                </span>
              </div>
              <p className={`text-xs mt-2 ${allSubjectsComplete ? 'text-emerald-700' : 'text-amber-700'}`}>
                {allSubjectsComplete 
                  ? "Optional review sessions logged. No mandatory daily lecture quota." 
                  : "Updates automatically when you click '+' on subjects below."}
              </p>
            </div>
            
            <div className={`flex items-center gap-3 bg-white/60 p-3 rounded-lg border ${allSubjectsComplete ? 'border-emerald-100' : 'border-amber-100'}`}>
              <label className={`text-sm font-medium ${allSubjectsComplete ? 'text-emerald-900' : 'text-amber-900'}`}>
                {allSubjectsComplete ? "Sessions:" : "Target:"}
              </label>
              <div className="flex items-center">
                <button onClick={() => handleGoalChange(Math.max(0, dailyProgress.goal - 1))} className={`w-8 h-8 flex items-center justify-center bg-white border rounded-l font-bold ${allSubjectsComplete ? 'border-emerald-200 hover:bg-emerald-50 text-emerald-700' : 'border-amber-200 hover:bg-amber-100 text-amber-700'}`}>-</button>
                <span className={`w-10 text-center font-bold bg-white border-y h-8 flex items-center justify-center ${allSubjectsComplete ? 'border-emerald-200 text-emerald-900' : 'border-amber-200 text-amber-900'}`}>{dailyProgress.goal}</span>
                <button onClick={() => handleGoalChange(dailyProgress.goal + 1)} className={`w-8 h-8 flex items-center justify-center bg-white border rounded-r font-bold ${allSubjectsComplete ? 'border-emerald-200 hover:bg-emerald-50 text-emerald-700' : 'border-amber-200 hover:bg-amber-100 text-amber-700'}`}>+</button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Weekly Planner Section */}
          <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
            <div className="bg-indigo-900 px-6 py-4 flex flex-col md:flex-row justify-between items-center text-white">
              <div className="flex items-center gap-3">
                 <div className="p-2 bg-indigo-500 rounded-lg text-white">
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                 </div>
                 <div>
                    <h2 className="font-bold text-lg leading-none">Weekly Planner</h2>
                    <p className="text-xs text-indigo-300 mt-1">Plan your week to stay ahead.</p>
                 </div>
              </div>
              <div className="text-indigo-200 font-mono text-sm mt-2 md:mt-0">
                Week of: <span className="text-white font-bold">{new Date(weeklyTarget.weekId || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
              </div>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                 <label className="block text-sm font-bold text-slate-700 uppercase tracking-wide">Weekly Focus / Priorities</label>
                 <textarea 
                   value={weeklyTarget.focus}
                   onChange={(e) => handleWeeklyChange('focus', e.target.value)}
                   className="w-full h-64 p-4 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none bg-slate-50 text-slate-800 placeholder-slate-400"
                   placeholder={allSubjectsComplete ? "1. Solve 100+ OS & CN PYQs&#10;2. Revise Engineering Math Short Notes&#10;3. Attempt 1 Full Mock + 2hr Error Analysis" : "1. Finish COA Module 2&#10;2. Revise OS PYQs&#10;3. Attempt 1 Full Mock"}
                 />
              </div>
              
              <div className="space-y-6">
                 {allSubjectsComplete ? (
                   /* STATE B: ALL LECTURES COMPLETE (POST-LECTURE MASTERY) */
                   <div className="bg-white p-6 rounded-xl border border-emerald-100 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-5">
                         <svg className="w-32 h-32 text-emerald-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                      </div>

                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                          </span>
                          <div>
                            <h3 className="text-emerald-950 font-bold text-lg leading-tight">LECTURE PHASE COMPLETE</h3>
                            <p className="text-xs font-semibold text-emerald-600">✓ All planned lectures completed (100% Syllabus)</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">
                          POST-LECTURE MASTERY
                        </span>
                      </div>

                      {/* Weekly Lecture Goal Banner */}
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-5">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Weekly Lecture Goal</span>
                            <div className="text-base font-bold text-slate-800 mt-0.5">NO MANDATORY LECTURES</div>
                          </div>
                          <span className="text-xs font-semibold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-md">
                            Completed Syllabus
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-2">
                          Weekly lecture quota relaxed. Focus this week: <span className="font-semibold text-slate-700">PYQs • Revision • Tests • Error Analysis</span>.
                        </p>
                      </div>
                      
                      {/* Progress Display */}
                      <div className="mb-2 flex justify-between items-end">
                         <div className="flex items-baseline gap-2">
                             <span className="text-3xl font-bold text-emerald-600">{weeklyTarget.completedLectures}</span>
                             <span className="text-sm text-slate-500 font-medium">Review Sessions (Optional)</span>
                         </div>
                         <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded">
                              100% Coverage
                         </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-slate-100 rounded-full h-4 mb-6 overflow-hidden">
                         <div 
                           className="h-4 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500 shadow-sm"
                           style={{ width: '100%' }}
                         ></div>
                      </div>

                      {/* Optional Review Controls */}
                      <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                           <div>
                              <span className="text-xs text-slate-600 font-bold uppercase tracking-wide block">Optional Review Sessions</span>
                              <span className="text-[11px] text-slate-400">Rewatch difficult concepts only when needed</span>
                           </div>
                           <div className="flex gap-3">
                              <button 
                                  onClick={() => handleWeeklyChange('completedLectures', Math.max(0, weeklyTarget.completedLectures - 1))} 
                                  className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition"
                                  title="Decrease review sessions"
                              >-</button>
                              <button 
                                  onClick={() => handleWeeklyChange('completedLectures', weeklyTarget.completedLectures + 1)} 
                                  className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white hover:bg-emerald-700 shadow-md transition"
                                  title="Log optional review session"
                              >+</button>
                           </div>
                      </div>
                   </div>
                 ) : (
                   /* STATE A: LECTURES INCOMPLETE */
                   <div className="bg-white p-6 rounded-xl border border-indigo-100 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-5">
                         <svg className="w-32 h-32 text-indigo-600" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" /><path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" /></svg>
                      </div>

                      <h3 className="text-indigo-900 font-bold mb-6 text-lg">Lecture Goals</h3>
                      
                      {/* Target Input */}
                      <div className="flex items-center justify-between mb-8">
                         <span className="text-slate-600 font-medium">Weekly Target</span>
                         <div className="flex items-center gap-2 bg-indigo-50 px-4 py-2 rounded-lg border border-indigo-100">
                            <input 
                              type="number" 
                              value={weeklyTarget.targetLectures}
                              onChange={(e) => handleWeeklyChange('targetLectures', parseInt(e.target.value) || 0)}
                              className="w-16 text-right font-bold bg-transparent focus:outline-none text-indigo-700 text-lg" 
                            />
                            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wide">Lectures</span>
                         </div>
                      </div>
                      
                      {/* Progress Display */}
                      <div className="mb-2 flex justify-between items-end">
                         <div className="flex items-baseline gap-2">
                             <span className="text-5xl font-bold text-indigo-600">{weeklyTarget.completedLectures}</span>
                             <span className="text-sm text-slate-400 font-medium">/ {weeklyTarget.targetLectures} Completed</span>
                         </div>
                         <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                              {Math.round((weeklyTarget.completedLectures / (weeklyTarget.targetLectures || 1)) * 100)}%
                         </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-slate-100 rounded-full h-4 mb-8 overflow-hidden">
                         <div 
                           className="h-4 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500 shadow-sm"
                           style={{ width: `${Math.min(100, (weeklyTarget.completedLectures / (weeklyTarget.targetLectures || 1)) * 100)}%` }}
                         ></div>
                      </div>

                      {/* Manual Adjust Controls */}
                      <div className="flex justify-between items-center pt-6 border-t border-slate-100">
                           <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">Manual Adjustment</span>
                           <div className="flex gap-3">
                              <button 
                                  onClick={() => handleWeeklyChange('completedLectures', Math.max(0, weeklyTarget.completedLectures - 1))} 
                                  className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition"
                              >-</button>
                              <button 
                                  onClick={() => handleWeeklyChange('completedLectures', weeklyTarget.completedLectures + 1)} 
                                  className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white hover:bg-indigo-700 shadow-md transition"
                              >+</button>
                           </div>
                      </div>
                   </div>
                 )}

                 {/* Review Tip */}
                 <div className="bg-green-50 p-4 rounded-xl border border-green-100 flex items-start gap-3">
                    <div className="p-2 bg-green-200 rounded-full text-green-700 mt-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-green-800">Review Tip</h4>
                        <p className="text-xs text-green-700 mt-1">
                          {allSubjectsComplete
                            ? "Your lecture syllabus is complete. Protect your preparation time for revision, PYQs, tests, and error correction."
                            : '"Consistency beats intensity." Ensure you meet at least 80% of your weekly lecture goal to stay on track for Jan 2027.'}
                        </p>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Action Bar */}
      <div className="flex justify-between items-center pt-4">
         <h3 className="text-lg font-bold text-slate-800">Your Subjects</h3>
         <div className="flex gap-2">
            <button
               onClick={downloadReport}
               className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition shadow-sm"
            >
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
               Download Report
            </button>
            <button 
              onClick={openAddModal}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
              Add Subject
            </button>
         </div>
      </div>

      {/* Phase 2 Grid */}
      <div>
        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">Phase 2 (Mastery)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {phase2Subjects.length > 0 ? (
              phase2Subjects.map(subject => (
                  <SubjectCard 
                    key={subject.id} 
                    subject={subject} 
                    onUpdate={updateLectures} 
                    onEdit={() => openEditModal(subject)}
                  />
              ))
            ) : (
              <p className="text-slate-400 italic text-sm">No Phase 2 subjects added yet.</p>
            )}
        </div>
      </div>

      {/* Phase 1 Grid */}
      <div>
        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2 mt-2">Phase 1 (Foundation)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-80 hover:opacity-100 transition-opacity">
            {phase1Subjects.length > 0 ? (
              phase1Subjects.map(subject => (
                  <SubjectCard 
                    key={subject.id} 
                    subject={subject} 
                    onUpdate={updateLectures}
                    onEdit={() => openEditModal(subject)} 
                  />
              ))
            ) : (
               <p className="text-slate-400 italic text-sm">No Phase 1 subjects added yet.</p>
            )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center">
               <h3 className="font-bold text-slate-800">{editingSubject ? 'Edit Subject' : 'Add New Subject'}</h3>
               <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
               </button>
            </div>
            <form onSubmit={handleModalSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Subject Name</label>
                <input 
                  type="text" 
                  required
                  value={modalFormData.name}
                  onChange={e => setModalFormData({...modalFormData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Machine Learning"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Total Lectures</label>
                  <input 
                    type="number" 
                    required
                    min="1"
                    value={modalFormData.totalLectures}
                    onChange={e => setModalFormData({...modalFormData, totalLectures: parseInt(e.target.value) || 0})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phase</label>
                  <select 
                    value={modalFormData.phase}
                    onChange={e => setModalFormData({...modalFormData, phase: parseInt(e.target.value) as 1 | 2})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value={1}>Phase 1</option>
                    <option value={2}>Phase 2</option>
                  </select>
                </div>
              </div>
              
              <div>
                 <label className="block text-sm font-medium text-slate-700 mb-2">Color Tag</label>
                 <div className="flex flex-wrap gap-2">
                   {COLORS.map(color => (
                     <button
                       type="button"
                       key={color}
                       onClick={() => setModalFormData({...modalFormData, color})}
                       className={`w-6 h-6 rounded-full ${color} ${modalFormData.color === color ? 'ring-2 ring-offset-2 ring-slate-400' : ''}`}
                     />
                   ))}
                 </div>
              </div>

              <div className="pt-4 flex gap-3">
                 <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium">Cancel</button>
                 <button type="submit" className="flex-1 px-4 py-2 bg-indigo-600 rounded-lg text-white hover:bg-indigo-700 font-medium">
                   {editingSubject ? 'Save Changes' : 'Create Subject'}
                 </button>
              </div>
              
              {editingSubject && (
                <div className="pt-2 border-t border-slate-100 mt-2">
                  <button 
                    type="button" 
                    onClick={() => { setIsModalOpen(false); handleDeleteSubject(editingSubject.id); }}
                    className="text-red-500 text-sm hover:text-red-700 flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    Delete Subject
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

const SubjectCard: React.FC<{ 
  subject: LectureSubject; 
  onUpdate: (id: string, delta: number) => void;
  onEdit: () => void;
}> = ({ subject, onUpdate, onEdit }) => {
  const status = getSubjectLectureStatus(subject);
  const percentage = status.completionPercentage;
  const isCompleted = status.isComplete;
  
  return (
    <div className={`bg-white rounded-xl shadow-sm border ${isCompleted ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-slate-200'} overflow-hidden flex flex-col transition-all duration-300 group relative`}>
      <div className={`h-2 w-full ${isCompleted ? 'bg-emerald-500' : subject.color}`}></div>
      
      {/* Edit Button */}
      <button 
        onClick={onEdit}
        className="absolute top-4 right-4 text-slate-300 hover:text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Edit Subject"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
      </button>

      <div className="p-5 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-3 pr-6">
            <h4 className="font-bold text-slate-800 text-lg flex flex-col">
              {subject.name}
              {isCompleted ? (
                <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 mt-1 uppercase tracking-wide">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                  Lectures Complete
                </span>
              ) : (
                <span className="text-xs font-medium text-amber-600 flex items-center gap-1 mt-1">
                  In Progress ({status.remainingLectures} remaining)
                </span>
              )}
            </h4>
        </div>
        
        {isCompleted ? (
          <div className="bg-emerald-50/70 border border-emerald-100 rounded-lg p-2.5 mb-4">
            <div className="flex justify-between text-xs font-semibold text-emerald-800 mb-1">
              <span>100% Lecture Coverage</span>
              <span className="font-mono">{subject.completedLectures}/{subject.totalLectures}</span>
            </div>
            <div className="text-[11px] font-medium text-emerald-700 flex items-center gap-1">
              <span className="text-emerald-500 font-bold">Next Focus:</span> PYQs + Spaced Revision
            </div>
          </div>
        ) : (
          <div className="flex justify-between text-xs text-slate-500 mb-1 font-medium">
             <span>Progress</span>
             <span>{subject.completedLectures} / {subject.totalLectures}</span>
          </div>
        )}

        {/* Progress Bar */}
        <div className="w-full bg-slate-100 rounded-full h-3 mb-5 relative overflow-hidden">
            <div 
                className={`h-3 rounded-full transition-all duration-500 ${isCompleted ? 'bg-emerald-500' : subject.color}`} 
                style={{ width: `${Math.min(100, percentage)}%` }}
            ></div>
        </div>

        <div className="mt-auto flex items-center justify-between pt-2 border-t border-slate-50">
            <button 
                onClick={() => onUpdate(subject.id, -1)}
                className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition"
                disabled={subject.completedLectures <= 0}
                aria-label="Decrease completed lectures"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4"></path></svg>
            </button>
            <span className={`font-mono font-bold text-sm ${isCompleted ? 'text-emerald-600' : 'text-slate-700'}`}>
              {isCompleted ? '✓ 100%' : `${percentage}%`}
            </span>
            <button 
                onClick={() => onUpdate(subject.id, 1)}
                className={`w-9 h-9 rounded-full flex items-center justify-center shadow-sm transition transform active:scale-95 ${
                    isCompleted 
                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
                aria-label={isCompleted ? "Optional Review / Rewatch Session" : "Increase completed lectures"}
                title={isCompleted ? "Log optional review / rewatch" : "Mark lecture completed"}
            >
                {isCompleted ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                )}
            </button>
        </div>
      </div>
    </div>
  );
};

export default Tracker;
