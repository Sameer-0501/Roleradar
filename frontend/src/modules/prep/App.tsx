
import { Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import DashboardLayout from './layouts/DashboardLayout';
import { DashboardHome, Practice, Assessments, Resources, Profile, AnalysisInput, AnalysisResults, AnalysisHistory } from './pages/dashboard';
import { TestChecklist } from './pages/prp/TestChecklist';
import { ShipPage } from './pages/prp/ShipPage';
import { ProofPage } from './pages/prp/ProofPage';
import { PRPLayout } from './layouts/PRPLayout';

function App() {
    return (
        <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/dashboard" element={<DashboardLayout />}>
                <Route index element={<DashboardHome />} />
                <Route path="analyze" element={<AnalysisInput />} />
                <Route path="results/:id" element={<AnalysisResults />} />
                <Route path="history" element={<AnalysisHistory />} />
                <Route path="practice" element={<Practice />} />
                <Route path="assessments" element={<Assessments />} />
                <Route path="resources" element={<Resources />} />
                <Route path="profile" element={<Profile />} />
            </Route>
            {/* PRP Workflow Routes */}
            <Route path="/prp" element={<PRPLayout />}>
                <Route path="07-test" element={<TestChecklist />} />
                <Route path="08-ship" element={<ShipPage />} />
                <Route path="proof" element={<ProofPage />} />
            </Route>
        </Routes>
    );
}

export default App;
