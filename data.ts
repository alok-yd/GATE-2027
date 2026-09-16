import { LectureSubject, StrategyItem, WeeklyPlanItem } from './types';

export const INITIAL_SUBJECTS: LectureSubject[] = [
  // Syllabus is complete. The app now tracks AIR-1 execution:
  // revision cycles, PYQ mastery, mock tests, and error-log repair.
  { id: 'aptitude', name: 'General Aptitude', totalLectures: 30, completedLectures: 30, phase: 1, color: 'bg-amber-500' },
  { id: 'math', name: 'Engineering Math', totalLectures: 40, completedLectures: 40, phase: 2, color: 'bg-blue-500' },
  { id: 'algo', name: 'Algorithms', totalLectures: 50, completedLectures: 50, phase: 1, color: 'bg-emerald-500' },
  { id: 'ds', name: 'Data Structures', totalLectures: 45, completedLectures: 45, phase: 1, color: 'bg-teal-500' },
  { id: 'os', name: 'Operating Systems', totalLectures: 40, completedLectures: 40, phase: 1, color: 'bg-cyan-500' },
  { id: 'cn', name: 'Computer Networks', totalLectures: 64, completedLectures: 64, phase: 2, color: 'bg-pink-500' },
  { id: 'toc', name: 'Theory of Computation', totalLectures: 35, completedLectures: 35, phase: 1, color: 'bg-green-500' },
  { id: 'dbms', name: 'DBMS', totalLectures: 40, completedLectures: 40, phase: 1, color: 'bg-sky-500' },
  { id: 'coa', name: 'Computer Org & Arch', totalLectures: 42, completedLectures: 42, phase: 2, color: 'bg-indigo-500' },
  { id: 'compiler', name: 'Compiler Design', totalLectures: 26, completedLectures: 26, phase: 2, color: 'bg-purple-500' },
  { id: 'digital', name: 'Digital Logic', totalLectures: 38, completedLectures: 38, phase: 2, color: 'bg-rose-500' },
  { id: 'cprog', name: 'C Programming', totalLectures: 24, completedLectures: 24, phase: 1, color: 'bg-orange-500' },
  { id: 'discrete', name: 'Discrete Mathematics', totalLectures: 51, completedLectures: 51, phase: 2, color: 'bg-violet-500' },
];

export const ROADMAP_PHASE_1: WeeklyPlanItem[] = [
  {
    id: 'p1-1',
    title: 'Syllabus Completion Baseline',
    period: 'Completed before May 2026',
    focus: ['All GATE CS subjects', 'Short notes', 'Class notes'],
    tasks: ['Freeze new-learning work', 'Confirm notes are revision-ready', 'Move every subject into PYQ mode'],
    goal: 'Syllabus complete. The battle now shifts to revision, PYQs, and mocks.',
    status: 'completed',
  },
  {
    id: 'p1-2',
    title: 'AIR-1 Operating System',
    period: 'Current setup',
    focus: ['Error Log', 'PYQ Register', 'Mock Analysis'],
    tasks: ['Every wrong answer gets a reason', 'Every weak topic gets a revisit date', 'Every mock gets equal-time analysis'],
    goal: 'Build the feedback loop that runs until exam day.',
    status: 'completed',
  },
  {
    id: 'p1-3',
    title: 'Daily AIR-1 Schedule',
    period: 'May 2026 onward',
    focus: ['5:00-8:00 AM hard revision', '9:30 AM-1:00 PM PYQs', '2:00-6:00 PM mock/error repair'],
    tasks: ['10+ hours GATE deep work', 'SKY meditation and sleep protected', 'Data Science 6-8 PM as reset'],
    goal: 'Repeatable daily execution without burnout.',
    status: 'in-progress',
  },
  {
    id: 'p1-4',
    title: 'AIR-1 Mindset Rules',
    period: 'Always active',
    focus: ['Accuracy before speed', 'No guessing below 70% confidence', 'Sleep and recovery'],
    tasks: ['Never skip error-log analysis', 'Protect Aptitude + Math daily', 'Avoid last-minute cramming'],
    goal: 'Win through clean execution, not panic intensity.',
    status: 'in-progress',
  },
];

export const ROADMAP_PHASE_2_WEEKLY: WeeklyPlanItem[] = [
  {
    id: 'p2-may',
    title: 'Deep Revision Sprint: High ROI Start',
    period: 'May 2026',
    focus: ['General Aptitude', 'Engineering Math', 'Algorithms + DS'],
    tasks: ['One subject per week minimum', 'PYQs 2015-2020 with revision', 'One sectional mock per week', 'Start error log'],
    goal: 'Baseline score 40-50/100 and clean error-log habit.',
    status: 'in-progress',
  },
  {
    id: 'p2-jun',
    title: 'Deep Revision Sprint: Core Systems',
    period: 'June 2026',
    focus: ['Operating Systems', 'Computer Networks', 'Theory of Computation', 'DBMS'],
    tasks: ['Revise from short notes only', 'Topic-wise PYQs 2015-2020', 'Categorize every mistake', 'Weekly sectional test'],
    goal: 'Core systems revised with weak topics clearly identified.',
    status: 'pending',
  },
  {
    id: 'p2-jul',
    title: 'Deep Revision Sprint: Medium Weight Finish',
    period: 'July 2026',
    focus: ['COA', 'Compiler Design', 'Digital Logic', 'C Programming'],
    tasks: ['Finish full revision cycle', 'Repair all Type-A concept gaps', 'Sectional mocks continue', 'Prepare Phase 2 weak-area list'],
    goal: 'Full revision cycle complete and baseline score stable.',
    status: 'pending',
  },
  {
    id: 'p2-aug',
    title: 'PYQ Mastery Begins',
    period: 'August 2026',
    focus: ['PYQs 2024-2021 first', '2 full mocks/week', 'Weak-topic revision'],
    tasks: ['Saturday full mock', 'Sunday full mock + analysis', 'Re-solve wrong PYQs after 2 weeks', 'Target 50-55/100'],
    goal: 'Recent-trend PYQs become automatic.',
    status: 'pending',
  },
  {
    id: 'p2-sep',
    title: 'PYQ Mastery: Accuracy Lock',
    period: 'September 2026',
    focus: ['PYQs 2020-2017', 'Error Log Revision', 'Timed sprints'],
    tasks: ['90%+ accuracy before marking a topic done', '20-question speed drills', 'Fix Type B and Type C mistakes', '2 full mocks/week'],
    goal: 'Accuracy climbs before speed is pushed.',
    status: 'pending',
  },
  {
    id: 'p2-oct',
    title: 'PYQ Mastery: Mock Score Lift',
    period: 'October 2026',
    focus: ['Remaining PYQs', 'Wrong PYQ re-attempts', 'Second revision cycle'],
    tasks: ['Skip strong chapters', 'Revise only error log + weak chapters', '2 full mocks/week', 'Target 55-62+/100'],
    goal: 'PYQ bank mastered and full mock score ready for blitz phase.',
    status: 'pending',
  },
];

export const ROADMAP_PHASE_3_MASTERY: WeeklyPlanItem[] = [
  {
    id: 'p3-nov',
    title: 'Full Mock Blitz Starts',
    period: 'November 2026',
    focus: ['3 full mocks/week', 'Strict exam simulation', 'Equal-time analysis'],
    tasks: ['Use 9:30 AM slot whenever possible', 'No phone, no breaks', 'Fix Type-A errors before next mock'],
    goal: 'Mock stamina and accuracy under pressure.',
    status: 'pending',
  },
  {
    id: 'p3-dec',
    title: 'Score Stabilization',
    period: 'December 2026',
    focus: ['65+/100 consistency', 'Third revision cycle', 'Formula sheets'],
    tasks: ['Concise notes only', 'No heavy textbook reading', 'Weak-area micro drills', '3 full mocks/week'],
    goal: 'Scores consistently cross 65+/100.',
    status: 'pending',
  },
  {
    id: 'p3-jan',
    title: 'AIR-1 Final Sharpening',
    period: 'January 2027',
    focus: ['70+/100 target', 'Error log only', 'Exam temperament'],
    tasks: ['3 full mocks/week until final stretch', 'Daily Aptitude + Math', 'Simulate exact exam routine'],
    goal: '70+/100 by January with calm execution.',
    status: 'pending',
  },
  {
    id: 'p3-feb',
    title: 'Final 10 Days: Confidence Mode',
    period: 'Final 10 days before GATE 2027',
    focus: ['Zero new mocks', 'Error log', 'Formula sheets', 'Rest'],
    tasks: ['No study after 2 PM day before exam', 'Sleep by 9:30 PM', 'Protect confidence', 'No cramming'],
    goal: 'Enter the exam rested, accurate, and ready for AIR 1.',
    status: 'pending',
  },
];

export const STRATEGIES: StrategyItem[] = [
  {
    title: 'AIR-1 Target',
    description: 'The syllabus is complete. Your goal is no longer coverage; it is winning through revision, PYQs, mocks, and error repair.',
    icon: '1',
  },
  {
    title: 'PYQ Mastery',
    description: 'Solve 2024-2021 first, then 2020-2017. Never mark a PYQ done until you can solve it without hints.',
    icon: 'P',
  },
  {
    title: '108 Mock System',
    description: 'Phase 2 has 2 full mocks/week. Phase 3 has 3 full mocks/week. Analyze for the same time you spent testing.',
    icon: 'M',
  },
  {
    title: 'Error Notebook',
    description: 'Bucket every mistake: concept gap, silly mistake, time pressure, or never studied. Fix Type-A errors before the next mock.',
    icon: 'E',
  },
  {
    title: 'Revision Cycles',
    description: 'Cycle 1: all subjects. Cycle 2: error log and weak chapters. Cycle 3: concise notes and formula sheets.',
    icon: 'R',
  },
  {
    title: 'Aptitude & Math',
    description: 'Aptitude + Engineering Math are about 28 marks. Scoring 25+ here is non-negotiable for AIR under 10.',
    icon: 'A',
  },
];
