import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import NewVerification from "./pages/NewVerification";
import ReportViewer from "./pages/ReportViewer";
import History from "./pages/History";
import SettingsPage from "./pages/Settings";
import ProfilesPage from "./pages/Profiles";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="new" element={<NewVerification />} />
        <Route path="report/:id" element={<ReportViewer />} />
        <Route path="history" element={<History />} />
        <Route path="profiles" element={<ProfilesPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

/*
__ai_context__
应用入口路由配置，将对应的页面组件挂载到前端 React-Router-DOM 的各子路径下。
*/

// [For Future AI]
// 1. Key assumptions made:
//    - App component wraps inside BrowserRouter in main.tsx.
// 2. Potential edge cases to watch:
//    - None.
// 3. Dependencies on other modules:
//    - Layout.tsx and page components.
export default App;
