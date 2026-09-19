import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Timeline from './components/Timeline';
import Tracker from './components/Tracker';
import PYQExecutionTracker from './components/PYQExecutionTracker';
import Strategies from './components/Strategies';
import FocusTracker from './components/FocusTracker';
import AIMentor from './components/AIMentor';
import AIAnalyticsDashboard from './components/AIAnalyticsDashboard';
import TestPerformance from './components/TestPerformance';
import Revision from './components/Revision';
import HealthTracker from './components/HealthTracker';
import SpeakingDashboard from './components/SpeakingDashboard';
import AINativeWorkbench from './components/AINativeWorkbench';

const App: React.FC = () => {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/roadmap" element={<Timeline />} />
          <Route path="/tracker" element={<Tracker />} />
          <Route path="/pyq-tracker" element={<PYQExecutionTracker />} />
          <Route path="/strategy" element={<Strategies />} />
          <Route path="/focus" element={<FocusTracker />} />
          <Route path="/health" element={<HealthTracker />} />
          <Route path="/speaking" element={<SpeakingDashboard />} />
          <Route path="/tests" element={<TestPerformance />} />
          <Route path="/revision" element={<Revision />} />
          <Route path="/mentor" element={<AIMentor />} />
          <Route path="/analytics" element={<AIAnalyticsDashboard />} />
          <Route path="/ai-native" element={<AINativeWorkbench />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
};

export default App;
