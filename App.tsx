import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Timeline from './components/Timeline';
import Tracker from './components/Tracker';
import PYQExecutionTracker from './components/PYQExecutionTracker';
import Strategies from './components/Strategies';
import AIMentor from './components/AIMentor';
import AIAnalyticsDashboard from './components/AIAnalyticsDashboard';
import TestPerformance from './components/TestPerformance';
import Revision from './components/Revision';
import HealthTracker from './components/HealthTracker';
import SpeakingDashboard from './components/SpeakingDashboard';
import AINativeWorkbench from './components/AINativeWorkbench';
import FocusTracker from './components/FocusTracker';
import SectionErrorBoundary from './components/SectionErrorBoundary';

const protectSection = (sectionName: string, content: React.ReactNode) => (
  <SectionErrorBoundary sectionName={sectionName}>{content}</SectionErrorBoundary>
);

const App: React.FC = () => {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={protectSection('Dashboard', <Dashboard />)} />
          <Route path="/roadmap" element={protectSection('Roadmap', <Timeline />)} />
          <Route path="/focus" element={protectSection('AI Focus', <FocusTracker />)} />
          <Route path="/tracker" element={protectSection('Lecture Tracker', <Tracker />)} />
          <Route path="/pyq-tracker" element={protectSection('PYQ Execution Tracker', <PYQExecutionTracker />)} />
          <Route path="/strategy" element={protectSection('Strategy & Tips', <Strategies />)} />
          <Route path="/health" element={protectSection('Health Tracker', <HealthTracker />)} />
          <Route path="/speaking" element={protectSection('Speaking Coach', <SpeakingDashboard />)} />
          <Route path="/tests" element={protectSection('Test Performance', <TestPerformance />)} />
          <Route path="/revision" element={protectSection('Revision', <Revision />)} />
          <Route path="/mentor" element={protectSection('AI Mentor', <AIMentor />)} />
          <Route path="/analytics" element={protectSection('AI Analytics', <AIAnalyticsDashboard />)} />
          <Route path="/ai-native" element={protectSection('AI Native', <AINativeWorkbench />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
};

export default App;
