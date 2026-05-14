import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import NewVerification from "./pages/NewVerification";
import ReportViewer from "./pages/ReportViewer";
import History from "./pages/History";
import SettingsPage from "./pages/Settings";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="new" element={<NewVerification />} />
        <Route path="report/:id" element={<ReportViewer />} />
        <Route path="history" element={<History />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

export default App;
