import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  BarChart3,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { getStudentProfile } from '../services/DataExtractor';
import {
  analyzePreparationState,
  predictAIR,
  HISTORICAL_COLLEGE_CUTOFFS,
} from '../services/airPrediction';

interface PredictedAIRWidgetProps {
  onOpen?: () => void;
}

export const PredictedAIRWidget: React.FC<PredictedAIRWidgetProps> = ({ onOpen }) => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(() => getStudentProfile());

  useEffect(() => {
    const refresh = () => setProfile(getStudentProfile());
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);

  const analysis = useMemo(() => analyzePreparationState(profile), [profile]);
  const prediction = useMemo(() => predictAIR(analysis), [analysis]);

  // IIT Bombay benchmark
  const iitbRecord = useMemo(() => {
    return (
      HISTORICAL_COLLEGE_CUTOFFS.find((c) => c.id === 'iitb-cse-ta') || {
        institute: 'IIT Bombay',
        shortName: 'IIT Bombay',
        program: 'M.Tech CSE',
        closingScores: { GEN: 780, OBC: 700, SC: 520, ST: 410, EWS: 745 },
      }
    );
  }, []);

  const category = (localStorage.getItem('gate_candidate_category') || 'GEN') as
    | 'GEN'
    | 'OBC'
    | 'SC'
    | 'ST'
    | 'EWS';

  const iitbCutoff = iitbRecord.closingScores[category] || 780;
  const userScore = prediction.marksEstimation.estimatedScore;
  const scoreDelta = userScore - iitbCutoff;

  let iitbStatusText = 'Competitive Range';
  let iitbStatusColor = 'bg-blue-100 text-blue-800 border-blue-200';
  if (scoreDelta >= 25) {
    iitbStatusText = 'Direct Offer Likely';
    iitbStatusColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
  } else if (scoreDelta >= -10) {
    iitbStatusText = 'Competitive Range (COAP)';
    iitbStatusColor = 'bg-indigo-100 text-indigo-800 border-indigo-200';
  } else if (scoreDelta >= -35) {
    iitbStatusText = 'Borderline (Subsequent Rounds)';
    iitbStatusColor = 'bg-amber-100 text-amber-800 border-amber-200';
  } else {
    iitbStatusText = `${Math.abs(scoreDelta)} pts below 2026 cutoff`;
    iitbStatusColor = 'bg-slate-100 text-slate-700 border-slate-200';
  }

  const handleCardClick = () => {
    if (onOpen) {
      onOpen();
    } else {
      navigate('/analytics');
    }
  };

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm transition hover:border-indigo-300 hover:shadow-md">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-indigo-600 text-white shadow-md shadow-amber-500/20">
            <Trophy className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-extrabold text-slate-900 text-base md:text-lg tracking-tight">
                Predicted AIR & Performance
              </h3>
              {/* IIT Bombay Target Tag */}
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-500/10 text-amber-700 border border-amber-500/30">
                <GraduationCap className="w-3.5 h-3.5 text-amber-600" />
                Target: IIT Bombay
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-black tracking-wider uppercase bg-indigo-600 text-white shadow-sm">
                IITB
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Empirical multi-signal forecast from AI Analytics • {prediction.confidencePercentage}% confidence model
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCardClick}
          className="inline-flex items-center gap-1.5 self-start sm:self-center px-4 py-2 rounded-xl text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition"
        >
          <span>Open AIR Center</span>
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>

      {/* 4 Metric Tiles Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mt-5">
        {/* Metric 1: Predicted AIR */}
        <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200/80">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-1">
            <span>Predicted AIR</span>
            <Trophy className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <p className="text-2xl md:text-3xl font-black text-indigo-900 tracking-tight">
            {prediction.airDisplay}
          </p>
          <p className="text-[11px] text-slate-500 mt-1 font-medium truncate">
            Range: <span className="font-semibold text-slate-700">{prediction.likelyRangeDisplay}</span>
          </p>
        </div>

        {/* Metric 2: Expected Marks */}
        <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200/80">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-1">
            <span>Expected Marks</span>
            <Target className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <p className="text-2xl md:text-3xl font-black text-emerald-600 tracking-tight">
            {prediction.marksEstimation.expectedMarks}
            <span className="text-xs text-slate-400 font-normal ml-1">/ 100</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-1 font-medium truncate">
            Spread: [{prediction.marksEstimation.marksLowerBound} – {prediction.marksEstimation.marksUpperBound}]
          </p>
        </div>

        {/* Metric 3: GATE Score */}
        <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200/80">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-1">
            <span>Estimated Score</span>
            <BarChart3 className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <p className="text-2xl md:text-3xl font-black text-indigo-600 tracking-tight">
            {prediction.marksEstimation.estimatedScore}
            <span className="text-xs text-slate-400 font-normal ml-1">/ 1000</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">
            Normalized GATE Scale
          </p>
        </div>

        {/* Metric 4: Overall Readiness */}
        <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200/80">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-1">
            <span>Prep Readiness</span>
            <ShieldCheck className="w-3.5 h-3.5 text-purple-500" />
          </div>
          <p className="text-2xl md:text-3xl font-black text-purple-600 tracking-tight">
            {analysis.overallReadiness}%
          </p>
          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-purple-600 rounded-full transition-all duration-500"
              style={{ width: `${analysis.overallReadiness}%` }}
            />
          </div>
        </div>
      </div>

      {/* Target: IIT Bombay Benchmark Banner */}
      <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-amber-50/60 via-indigo-50/40 to-white p-3.5 rounded-xl border border-amber-200/60">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-white font-extrabold text-xs shadow-sm">
            IITB
          </span>
          <div>
            <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <span>IIT Bombay M.Tech CSE Benchmark:</span>
              <span className="text-indigo-700 font-extrabold">Cutoff ~{iitbCutoff} score</span>
            </p>
            <p className="text-[11px] text-slate-500">
              Your Current Score: <span className="font-bold text-slate-800">{userScore}</span> ({scoreDelta >= 0 ? `+${scoreDelta}` : scoreDelta} delta)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <span className={`px-2.5 py-1 rounded-md text-xs font-extrabold border ${iitbStatusColor}`}>
            {iitbStatusText}
          </span>
          <button
            type="button"
            onClick={handleCardClick}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-0.5 ml-1"
          >
            <span>View Cutoffs</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PredictedAIRWidget;
