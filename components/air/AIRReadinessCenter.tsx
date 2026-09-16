import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Compass,
  GraduationCap,
  HelpCircle,
  Info,
  ShieldCheck,
  Sliders,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AIRPredictionResult,
  CandidateCategory,
  evaluateCollegeCompatibility,
  getChartedAIRTrajectory,
  getCollegeCompatibilitySummary,
  PreparationAnalysis,
  runWhatIfSimulation,
  saveAIRSnapshot,
  WhatIfParameters,
} from '../../services/airPrediction';

interface AIRReadinessCenterProps {
  analysis: PreparationAnalysis;
  prediction: AIRPredictionResult;
  onRefresh?: () => void;
}

export const AIRReadinessCenter: React.FC<AIRReadinessCenterProps> = ({
  analysis,
  prediction,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<
    'prediction' | 'profile' | 'colleges' | 'explainability' | 'simulator'
  >('prediction');

  // Candidate category for college cutoffs (persisted locally)
  const [category, setCategory] = useState<CandidateCategory>(() => {
    return (localStorage.getItem('gate_candidate_category') as CandidateCategory) || 'GEN';
  });

  const handleCategoryChange = (cat: CandidateCategory) => {
    setCategory(cat);
    localStorage.setItem('gate_candidate_category', cat);
  };

  // College institute filter
  const [collegeFilter, setCollegeFilter] = useState<'ALL' | 'IIT' | 'NIT' | 'IIIT'>('ALL');

  // What-If Simulator state
  const [simulatorParams, setSimulatorParams] = useState<WhatIfParameters>({
    mockMarksDelta: 5,
    pyqAccuracyDelta: 5,
    sillyMistakesSaved: 4,
    revisionCyclesComplete: 2,
  });

  // Persist today's snapshot on render
  useMemo(() => {
    saveAIRSnapshot(prediction, analysis);
  }, [prediction, analysis]);

  // Trajectory data for charting
  const trajectoryData = useMemo(() => {
    return getChartedAIRTrajectory({
      date: new Date().toISOString().split('T')[0],
      expectedMarks: prediction.marksEstimation.expectedMarks,
      estimatedScore: prediction.marksEstimation.estimatedScore,
      medianAIR: prediction.medianAIR,
      lowerAIR: prediction.lowerAIR,
      upperAIR: prediction.upperAIR,
      readinessScore: analysis.overallReadiness,
      confidence: prediction.confidencePercentage,
    });
  }, [prediction, analysis]);

  // College matches
  const collegeMatches = useMemo(() => {
    return evaluateCollegeCompatibility(
      prediction.marksEstimation.estimatedScore,
      category,
      collegeFilter
    );
  }, [prediction.marksEstimation.estimatedScore, category, collegeFilter]);

  const collegeSummary = useMemo(() => {
    return getCollegeCompatibilitySummary(collegeMatches);
  }, [collegeMatches]);

  // Simulation result
  const simulationResult = useMemo(() => {
    return runWhatIfSimulation(prediction, simulatorParams, category);
  }, [prediction, simulatorParams, category]);

  const getStabilityBadge = (stability: AIRPredictionResult['stability']) => {
    switch (stability) {
      case 'HIGHLY_STABLE':
        return { text: 'Highly Stable', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' };
      case 'MODERATE':
        return { text: 'Moderate Stability', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' };
      case 'VOLATILE':
        return { text: 'Volatile (Need Mocks)', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' };
      case 'PRELIMINARY':
      default:
        return { text: 'Preliminary Forecast', color: 'bg-purple-500/10 text-purple-600 border-purple-500/20' };
    }
  };

  const stabilityBadge = getStabilityBadge(prediction.stability);

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. HERO INTELLIGENCE BANNER                                              */}
      {/* ========================================================================= */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6 md:p-8 text-white shadow-xl border border-slate-800">
        <div className="absolute -right-16 -bottom-16 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 right-1/4 w-48 h-48 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-2xl space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-400/20 text-amber-300 border border-amber-400/30">
                <Sparkles className="w-3.5 h-3.5" />
                GATE CSE 2027 Intelligence
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${stabilityBadge.color}`}>
                {stabilityBadge.text}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                Confidence: {prediction.confidencePercentage}%
              </span>
            </div>

            <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight text-white">
              AIR Readiness & Performance Center
            </h1>
            <p className="text-slate-300 text-sm md:text-base leading-relaxed">
              Multi-signal engine analyzing syllabus coverage, PYQ execution, mock scores,
              consistency, and error control calibrated against 8 years of historical GATE CSE distributions.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start lg:self-center">
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-sm transition flex items-center gap-2 border border-white/10 backdrop-blur-sm"
              >
                <TrendingUp className="w-4 h-4" />
                Re-evaluate Model
              </button>
            )}
          </div>
        </div>

        {/* Core Prediction Metric HUD */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-6 border-t border-slate-800">
          {/* Estimated Rank */}
          <div className="bg-slate-800/60 backdrop-blur-md rounded-xl p-4 border border-slate-700/60">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-1">
              <span>Predicted AIR</span>
              <Trophy className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl md:text-3xl font-extrabold text-amber-400">
              {prediction.airDisplay}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Likely Range: <span className="text-slate-200 font-medium">{prediction.likelyRangeDisplay}</span>
            </div>
          </div>

          {/* Expected Marks */}
          <div className="bg-slate-800/60 backdrop-blur-md rounded-xl p-4 border border-slate-700/60">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-1">
              <span>Expected Marks</span>
              <Target className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl md:text-3xl font-extrabold text-emerald-400">
              {prediction.marksEstimation.expectedMarks}
              <span className="text-xs text-slate-400 font-normal ml-1">/ 100</span>
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Spread: [{prediction.marksEstimation.marksLowerBound} – {prediction.marksEstimation.marksUpperBound}]
            </div>
          </div>

          {/* Estimated GATE Score */}
          <div className="bg-slate-800/60 backdrop-blur-md rounded-xl p-4 border border-slate-700/60">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-1">
              <span>Estimated Score</span>
              <BarChart3 className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl md:text-3xl font-extrabold text-indigo-300">
              {prediction.marksEstimation.estimatedScore}
              <span className="text-xs text-slate-400 font-normal ml-1">/ 1000</span>
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Normalized GATE Scale
            </div>
          </div>

          {/* Overall Readiness */}
          <div className="bg-slate-800/60 backdrop-blur-md rounded-xl p-4 border border-slate-700/60">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-1">
              <span>Overall Readiness</span>
              <ShieldCheck className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl md:text-3xl font-extrabold text-purple-400">
              {analysis.overallReadiness}%
            </div>
            <div className="w-full bg-slate-700/70 h-1.5 rounded-full overflow-hidden mt-2">
              <div
                className="h-full bg-purple-500 rounded-full transition-all"
                style={{ width: `${analysis.overallReadiness}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. SUB-NAVIGATION TABS                                                    */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-1.5 flex flex-wrap gap-1">
        {[
          { id: 'prediction', label: 'AIR Prediction & Scenarios', icon: Trophy },
          { id: 'profile', label: 'Preparation Profile (8D)', icon: BrainCircuit },
          { id: 'colleges', label: 'College Compatibility', icon: GraduationCap },
          { id: 'explainability', label: 'Why This AIR?', icon: HelpCircle },
          { id: 'simulator', label: 'What-If Simulator', icon: Sliders },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition flex-1 min-w-[170px] justify-center ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* 3. TAB CONTENT                                                            */}
      {/* ========================================================================= */}

      {/* TAB 1: AIR PREDICTION & SCENARIOS */}
      {activeTab === 'prediction' && (
        <div className="space-y-6">
          {/* 3-Scenarios Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Conservative Scenario */}
            <div className="bg-white rounded-2xl p-6 border-2 border-slate-200 shadow-sm hover:shadow-md transition">
              <div className="flex items-center justify-between mb-3">
                <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700 uppercase">
                  Conservative (20%)
                </span>
                <span className="text-xs font-semibold text-slate-400">Tough Paper</span>
              </div>
              <h3 className="text-3xl font-extrabold text-slate-800">
                {prediction.scenarios.conservative.airDisplay}
              </h3>
              <p className="text-sm font-semibold text-slate-500 mt-1">
                {prediction.scenarios.conservative.marks} Marks • {prediction.scenarios.conservative.gateScore} Score
              </p>
              <p className="text-xs text-slate-600 mt-3 leading-relaxed">
                {prediction.scenarios.conservative.description}
              </p>
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-1.5">
                {prediction.scenarios.conservative.assumptions.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs text-slate-500">
                    <span className="text-slate-400 mt-0.5">•</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Expected Scenario (Dominant) */}
            <div className="bg-gradient-to-b from-indigo-50/70 to-white rounded-2xl p-6 border-2 border-indigo-500 shadow-md relative">
              <div className="absolute -top-3 right-6 bg-indigo-600 text-white text-[11px] font-extrabold px-3 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                Most Probable
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-indigo-100 text-indigo-800 uppercase">
                  Expected (60%)
                </span>
                <span className="text-xs font-semibold text-indigo-600">Standard Conditions</span>
              </div>
              <h3 className="text-3xl font-extrabold text-indigo-700">
                {prediction.scenarios.expected.airDisplay}
              </h3>
              <p className="text-sm font-semibold text-indigo-900/70 mt-1">
                {prediction.scenarios.expected.marks} Marks • {prediction.scenarios.expected.gateScore} Score
              </p>
              <p className="text-xs text-slate-700 mt-3 leading-relaxed">
                {prediction.scenarios.expected.description}
              </p>
              <div className="mt-4 pt-4 border-t border-indigo-100 space-y-1.5">
                {prediction.scenarios.expected.assumptions.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs text-slate-600">
                    <span className="text-indigo-500 mt-0.5">•</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* High-Performance Scenario */}
            <div className="bg-white rounded-2xl p-6 border-2 border-emerald-200 shadow-sm hover:shadow-md transition">
              <div className="flex items-center justify-between mb-3">
                <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 uppercase">
                  High Performance (20%)
                </span>
                <span className="text-xs font-semibold text-emerald-600">Peak Execution</span>
              </div>
              <h3 className="text-3xl font-extrabold text-emerald-600">
                {prediction.scenarios.highPerformance.airDisplay}
              </h3>
              <p className="text-sm font-semibold text-slate-500 mt-1">
                {prediction.scenarios.highPerformance.marks} Marks • {prediction.scenarios.highPerformance.gateScore} Score
              </p>
              <p className="text-xs text-slate-600 mt-3 leading-relaxed">
                {prediction.scenarios.highPerformance.description}
              </p>
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-1.5">
                {prediction.scenarios.highPerformance.assumptions.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs text-slate-500">
                    <span className="text-emerald-500 mt-0.5">•</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Historical Trajectory Chart */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-indigo-600" />
                  Estimated Rank Trajectory Over Time
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tracks how your expected AIR has sharpened as mocks, PYQs, and revision cycles were logged.
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-indigo-600 inline-block" />
                  <span>Expected AIR (Lower is better)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                  <span>Expected Marks</span>
                </div>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trajectoryData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis
                    yAxisId="air"
                    reversed={true}
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    tickFormatter={(val) => `${val}`}
                  />
                  <YAxis
                    yAxisId="marks"
                    orientation="right"
                    domain={[0, 100]}
                    tick={{ fontSize: 12, fill: '#10b981' }}
                    tickFormatter={(val) => `${val}m`}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white text-xs p-3 rounded-xl shadow-xl border border-slate-700">
                            <p className="font-bold text-slate-300 mb-1">{data.date}</p>
                            <p className="text-amber-400 font-extrabold">Predicted: AIR {data.air}</p>
                            <p className="text-emerald-400">Expected Marks: {data.marks} / 100</p>
                            <p className="text-purple-300">Readiness: {data.readiness}%</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Line
                    yAxisId="air"
                    type="monotone"
                    dataKey="air"
                    stroke="#4f46e5"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#4f46e5' }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    yAxisId="marks"
                    type="monotone"
                    dataKey="marks"
                    stroke="#10b981"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={{ r: 3, fill: '#10b981' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Mathematical Reliability Card */}
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-slate-800">
                  Mathematical Model & Confidence Rationale ({prediction.confidencePercentage}%)
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  Confidence is derived mathematically: +{Math.round(analysis.dataHealth.totalMocksLogged * 1.5)}% from mock evidence ({analysis.dataHealth.totalMocksLogged} tests),
                  +{Math.round((analysis.dataHealth.totalPYQsLogged / 1500) * 20)}% from PYQs ({analysis.dataHealth.totalPYQsLogged} solved),
                  and +{Math.round((analysis.overallReadiness / 100) * 20)}% from verified syllabus coverage.
                </p>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="text-xs font-semibold text-slate-500 block">Silly Mark Risk</span>
              <span className="text-sm font-bold text-red-600">
                ~{prediction.marksEstimation.negativeMarkingRiskMarks} marks lost to traps
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PREPARATION PROFILE (8 DIMENSIONS) */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          {/* 8 Dimensions Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {analysis.dimensionList.map((dim) => {
              const levelColor =
                dim.score >= 85
                  ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                  : dim.score >= 70
                    ? 'text-blue-600 bg-blue-50 border-blue-200'
                    : dim.score >= 50
                      ? 'text-amber-600 bg-amber-50 border-amber-200'
                      : 'text-red-600 bg-red-50 border-red-200';

              const barColor =
                dim.score >= 85
                  ? 'bg-emerald-500'
                  : dim.score >= 70
                    ? 'bg-blue-500'
                    : dim.score >= 50
                      ? 'bg-amber-500'
                      : 'bg-red-500';

              return (
                <div
                  key={dim.id}
                  className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Weight {dim.weight}%
                      </span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${levelColor}`}>
                        {dim.level}
                      </span>
                    </div>

                    <h4 className="font-bold text-slate-800 text-sm leading-snug">
                      {dim.name}
                    </h4>

                    <div className="mt-3 flex items-baseline justify-between">
                      <span className="text-2xl font-black text-slate-900">{dim.score}</span>
                      <span className="text-xs text-slate-400">/ 100</span>
                    </div>

                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-1.5">
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${dim.score}%` }}
                      />
                    </div>

                    <p className="text-xs font-semibold text-slate-700 mt-3">
                      {dim.primaryMetric}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      {dim.supportingDetail}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <p className="text-[11px] text-indigo-700 font-medium bg-indigo-50/70 p-2 rounded-lg">
                      💡 {dim.actionableTip}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Subject-Wise Intelligence Breakdown Table */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  Subject-Wise Readiness & Exam Weight Mapping
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tracks individual mastery against GATE CSE marks allocation (100 marks total).
                </p>
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                12 GATE CSE Subjects
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 text-xs uppercase tracking-wider">
                    <th className="pb-3 font-semibold">Subject</th>
                    <th className="pb-3 font-semibold">Weight</th>
                    <th className="pb-3 font-semibold">Syllabus</th>
                    <th className="pb-3 font-semibold">PYQs Solved</th>
                    <th className="pb-3 font-semibold">Accuracy</th>
                    <th className="pb-3 font-semibold">Readiness</th>
                    <th className="pb-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {analysis.subjectReadiness.map((subj) => {
                    const statusPill =
                      subj.status === 'EXCELLENT'
                        ? 'bg-emerald-100 text-emerald-700'
                        : subj.status === 'ON_TRACK'
                          ? 'bg-blue-100 text-blue-700'
                          : subj.status === 'ATTENTION_NEEDED'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-red-100 text-red-700';

                    return (
                      <tr key={subj.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3.5 font-bold text-slate-800">
                          {subj.name}
                        </td>
                        <td className="py-3.5 text-slate-600 font-semibold">
                          ~{subj.examWeight}%
                        </td>
                        <td className="py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-700">
                              {subj.syllabusCompletion}%
                            </span>
                            <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-600 rounded-full"
                                style={{ width: `${subj.syllabusCompletion}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 text-slate-700 font-semibold">
                          {subj.pyqsSolved}
                          <span className="text-[11px] text-slate-400 font-normal ml-1">
                            / 180 target
                          </span>
                        </td>
                        <td className="py-3.5 text-slate-700 font-semibold">
                          {subj.pyqAccuracy != null ? `${subj.pyqAccuracy}%` : `${subj.testAccuracy}% (test)`}
                        </td>
                        <td className="py-3.5 font-extrabold text-slate-900">
                          {subj.compositeScore}%
                        </td>
                        <td className="py-3.5">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${statusPill}`}>
                            {subj.status.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: COLLEGE COMPATIBILITY */}
      {activeTab === 'colleges' && (
        <div className="space-y-6">
          {/* Strict Separation Notice & Filters */}
          <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Compass className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-900">
                  Independent Historical Admission Comparison
                </p>
                <p className="text-xs text-amber-800 mt-1">
                  Cutoffs are historical closing scores and are <span className="font-bold underline">never</span> used to calculate your AIR.
                  Scores reflect past COAP & CCMT closing rounds for your selected category.
                </p>
              </div>
            </div>

            {/* Category Selector */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-600">Category:</span>
              {(['GEN', 'OBC', 'EWS', 'SC', 'ST'] as CandidateCategory[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => handleCategoryChange(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    category === cat
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Match Statistics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-5 border border-emerald-200 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                <span>Direct Offer Likely</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-bold text-emerald-600 mt-2">
                {collegeSummary.directOfferCount} Programs
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Score comfortably above closing cutoff (+25+)
              </p>
            </div>

            <div className="bg-white rounded-xl p-5 border border-blue-200 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                <span>Competitive Range</span>
                <Target className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-2xl font-bold text-blue-600 mt-2">
                {collegeSummary.competitiveCount} Programs
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Within typical closing score range
              </p>
            </div>

            <div className="bg-white rounded-xl p-5 border border-amber-200 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                <span>Borderline / Special Rounds</span>
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-2xl font-bold text-amber-600 mt-2">
                {collegeSummary.borderlineCount} Programs
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Potential in subsequent or spot rounds
              </p>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <span className="text-xs font-bold text-slate-500 mr-2">Institute:</span>
            {[
              ['ALL', 'All Institutes'],
              ['IIT', 'IITs (COAP)'],
              ['NIT', 'NITs (CCMT)'],
              ['IIIT', 'IIITs & Premier'],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setCollegeFilter(id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  collegeFilter === id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Institute Cutoff Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 text-xs uppercase tracking-wider">
                    <th className="py-3.5 px-4 font-semibold">Institute & Program</th>
                    <th className="py-3.5 px-4 font-semibold">Admission Mode</th>
                    <th className="py-3.5 px-4 font-semibold">{category} Cutoff</th>
                    <th className="py-3.5 px-4 font-semibold">Your Score</th>
                    <th className="py-3.5 px-4 font-semibold">Delta</th>
                    <th className="py-3.5 px-4 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {collegeMatches.map((item) => {
                    const statusBadge =
                      item.status === 'HISTORICALLY_ABOVE'
                        ? 'bg-emerald-100 text-emerald-800'
                        : item.status === 'HISTORICALLY_WITHIN_RANGE'
                          ? 'bg-blue-100 text-blue-800'
                          : item.status === 'BORDERLINE'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-600';

                    const cutoffModeText =
                      item.record.cutoffType === 'DIRECT_COAP'
                        ? 'Direct COAP'
                        : item.record.cutoffType === 'WRITTEN_AND_INTERVIEW'
                          ? 'Written + Interview'
                          : item.record.cutoffType === 'CCMT_REGULAR'
                            ? 'CCMT Rounds 1-3'
                            : 'Direct Institute Round';

                    return (
                      <tr key={item.record.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-4 px-4">
                          <p className="font-bold text-slate-900">{item.record.shortName}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{item.record.program}</p>
                          {item.record.notes && (
                            <p className="text-[11px] text-slate-400 mt-1 italic">
                              {item.record.notes}
                            </p>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                            {cutoffModeText}
                          </span>
                          {item.record.interviewWeightage && (
                            <p className="text-[10px] text-slate-500 mt-1 font-medium">
                              {item.record.interviewWeightage}
                            </p>
                          )}
                        </td>
                        <td className="py-4 px-4 font-bold text-slate-800">
                          {item.closingScore}
                        </td>
                        <td className="py-4 px-4 font-extrabold text-indigo-600">
                          {item.userScore}
                        </td>
                        <td className="py-4 px-4">
                          <span
                            className={`font-bold text-xs ${
                              item.delta >= 0 ? 'text-emerald-600' : 'text-slate-500'
                            }`}
                          >
                            {item.delta >= 0 ? `+${item.delta}` : item.delta}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${statusBadge}`}>
                            {item.statusText}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: WHY THIS AIR? (EXPLAINABILITY) */}
      {activeTab === 'explainability' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Positive Drivers */}
            <div className="bg-white rounded-2xl p-6 border-t-4 border-t-emerald-500 border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-800 text-base">Key Positive Drivers</h3>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Strengths currently anchoring your rank and elevating your score potential:
              </p>
              <div className="space-y-3">
                {prediction.positiveDrivers.map((driver, idx) => (
                  <div key={idx} className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 text-xs text-slate-700 leading-relaxed">
                    <span className="font-bold text-emerald-700 mr-1.5">✓</span>
                    {driver}
                  </div>
                ))}
              </div>
            </div>

            {/* Limiting Factors */}
            <div className="bg-white rounded-2xl p-6 border-t-4 border-t-amber-500 border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-800 text-base">Limiting Factors</h3>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Specific bottlenecks that currently depress your rank ceiling:
              </p>
              <div className="space-y-3">
                {prediction.limitingFactors.map((factor, idx) => (
                  <div key={idx} className="p-3 bg-amber-50/50 rounded-xl border border-amber-100 text-xs text-slate-700 leading-relaxed">
                    <span className="font-bold text-amber-700 mr-1.5">!</span>
                    {factor}
                  </div>
                ))}
              </div>
            </div>

            {/* Uncertainty Sources */}
            <div className="bg-white rounded-2xl p-6 border-t-4 border-t-indigo-500 border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-800 text-base">Uncertainty Sources</h3>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Why your likely rank has a range, and how to narrow the variance:
              </p>
              <div className="space-y-3">
                {prediction.uncertaintySources.map((source, idx) => (
                  <div key={idx} className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 text-xs text-slate-700 leading-relaxed">
                    <span className="font-bold text-indigo-700 mr-1.5">?</span>
                    {source}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* High-ROI Action Checklist */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 text-lg mb-1 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              High-ROI Action Plan to Jump Tiers
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Estimated marks gain achievable within the next 3 weeks by addressing critical levers:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60">
                <span className="text-xs font-bold text-indigo-600 uppercase">Lever 1: Error Notebook</span>
                <h4 className="font-bold text-slate-800 mt-1">Eliminate 3 Silly Calculation Errors</h4>
                <p className="text-xs text-slate-600 mt-1">
                  Recovers +4.0 to +6.0 marks immediately. Double-check NAT bounds and negative signs.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60">
                <span className="text-xs font-bold text-emerald-600 uppercase">Lever 2: General Aptitude & Math</span>
                <h4 className="font-bold text-slate-800 mt-1">Push GA + EM to 24+ Marks</h4>
                <p className="text-xs text-slate-600 mt-1">
                  28 marks total in GATE. Consistent daily 30-minute practice converts to high-certainty rank lift.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60">
                <span className="text-xs font-bold text-purple-600 uppercase">Lever 3: Full Mock Cadence</span>
                <h4 className="font-bold text-slate-800 mt-1">Log 5 Full-Length 3-Hour Mocks</h4>
                <p className="text-xs text-slate-600 mt-1">
                  Tames exam fatigue and tightens prediction confidence from {prediction.confidencePercentage}% to 85%+.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: WHAT-IF SIMULATOR */}
      {activeTab === 'simulator' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Sliders Control Panel */}
            <div className="lg:col-span-7 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-indigo-600" />
                  "What If I Improve?" Sensitivity Simulator
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Adjust concrete preparation levers below to see real-time projected marks, GATE score, and rank jump.
                </p>
              </div>

              {/* Slider 1: Mock Score Boost */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-bold text-slate-700">Improve Average Mock Score</span>
                  <span className="font-extrabold text-indigo-600">
                    {simulatorParams.mockMarksDelta >= 0 ? `+${simulatorParams.mockMarksDelta}` : simulatorParams.mockMarksDelta} marks
                  </span>
                </div>
                <input
                  type="range"
                  min="-5"
                  max="20"
                  step="1"
                  value={simulatorParams.mockMarksDelta}
                  onChange={(e) =>
                    setSimulatorParams({ ...simulatorParams, mockMarksDelta: Number(e.target.value) })
                  }
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>-5 marks</span>
                  <span>Baseline</span>
                  <span>+20 marks</span>
                </div>
              </div>

              {/* Slider 2: Silly Mistakes Saved */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-bold text-slate-700">Silly Mistakes Saved via Error Notebook</span>
                  <span className="font-extrabold text-emerald-600">
                    +{simulatorParams.sillyMistakesSaved} marks saved
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="12"
                  step="1"
                  value={simulatorParams.sillyMistakesSaved}
                  onChange={(e) =>
                    setSimulatorParams({ ...simulatorParams, sillyMistakesSaved: Number(e.target.value) })
                  }
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                />
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>0 marks</span>
                  <span>6 marks</span>
                  <span>12 marks</span>
                </div>
              </div>

              {/* Slider 3: PYQ Accuracy Boost */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-bold text-slate-700">PYQ Problem Solving Accuracy Boost</span>
                  <span className="font-extrabold text-purple-600">
                    {simulatorParams.pyqAccuracyDelta >= 0 ? `+${simulatorParams.pyqAccuracyDelta}%` : `${simulatorParams.pyqAccuracyDelta}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min="-5"
                  max="20"
                  step="1"
                  value={simulatorParams.pyqAccuracyDelta}
                  onChange={(e) =>
                    setSimulatorParams({ ...simulatorParams, pyqAccuracyDelta: Number(e.target.value) })
                  }
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>-5%</span>
                  <span>0%</span>
                  <span>+20%</span>
                </div>
              </div>

              {/* Slider 4: Revision Cycles */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-bold text-slate-700">Completed Revision Cycles</span>
                  <span className="font-extrabold text-amber-600">
                    Cycle {simulatorParams.revisionCyclesComplete} of 3
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((cycle) => (
                    <button
                      key={cycle}
                      onClick={() =>
                        setSimulatorParams({ ...simulatorParams, revisionCyclesComplete: cycle })
                      }
                      className={`py-2 rounded-xl text-xs font-bold transition border ${
                        simulatorParams.revisionCyclesComplete === cycle
                          ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Cycle {cycle} Complete
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() =>
                    setSimulatorParams({
                      mockMarksDelta: 0,
                      sillyMistakesSaved: 0,
                      pyqAccuracyDelta: 0,
                      revisionCyclesComplete: 1,
                    })
                  }
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline"
                >
                  Reset to Current Preparation Baseline
                </button>
              </div>
            </div>

            {/* Projected Impact Preview Card */}
            <div className="lg:col-span-5 bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 rounded-2xl p-6 text-white shadow-lg flex flex-col justify-between border border-indigo-800/60">
              <div>
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 uppercase tracking-wider">
                  Simulation Outcome
                </span>

                <div className="mt-5 space-y-4">
                  <div>
                    <span className="text-xs font-semibold text-slate-400">Projected AIR</span>
                    <div className="flex items-baseline gap-3 mt-1">
                      <span className="text-4xl font-extrabold text-amber-400">
                        AIR {simulationResult.projectedAIR.toLocaleString()}
                      </span>
                      {simulationResult.airDelta > 0 && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          +{simulationResult.airDelta.toLocaleString()} ranks jump
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Projected Band: {simulationResult.projectedRange}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800">
                    <div>
                      <span className="text-xs text-slate-400">Projected Marks</span>
                      <p className="text-xl font-bold text-emerald-400 mt-0.5">
                        {simulationResult.projectedMarks} / 100
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {simulationResult.marksDelta >= 0 ? `+${simulationResult.marksDelta}` : simulationResult.marksDelta} marks delta
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400">Projected Score</span>
                      <p className="text-xl font-bold text-indigo-300 mt-0.5">
                        {simulationResult.projectedScore} / 1000
                      </p>
                      <p className="text-[11px] text-slate-400">
                        GATE Scale
                      </p>
                    </div>
                  </div>
                </div>

                {/* Newly Unlocked Programs */}
                {simulationResult.newMatchesUnlocked.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-slate-800">
                    <span className="text-xs font-bold text-amber-300 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      Programs Unlocked by this Improvement
                    </span>
                    <div className="space-y-1.5">
                      {simulationResult.newMatchesUnlocked.map((inst, idx) => (
                        <div
                          key={idx}
                          className="text-xs bg-white/10 px-3 py-1.5 rounded-lg border border-white/10 text-slate-200"
                        >
                          {inst}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800 text-[11px] text-slate-400 italic">
                Every 1-mark improvement at this rank level can jump your standing by 50–200 ranks.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
