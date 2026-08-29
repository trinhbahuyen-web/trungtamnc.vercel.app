import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Role } from './types';
import Layout from './components/Layout';
import Login from './pages/Login';
import PendingApproval from './pages/PendingApproval';
import Dashboard from './pages/Dashboard';
import Classes from './pages/Classes';
import Timetable from './pages/Timetable';
import Students from './pages/Students';
import Attendance from './pages/Attendance';
import Grades from './pages/Grades';
import Tuition from './pages/Tuition';
import Users from './pages/Users';
import ParentView from './pages/ParentView';
import PayView from './pages/PayView';
import Assignments from './pages/Assignments';
import AssignmentCreate from './pages/AssignmentCreate';
import AssignmentMonitor from './pages/AssignmentMonitor';
import AssignmentGrading from './pages/AssignmentGrading';
import StudentAccounts from './pages/StudentAccounts';
import StudentLogin from './pages/StudentLogin';
import StudentPortal from './pages/StudentPortal';
import StudentWorkRoom from './pages/StudentWorkRoom';
import Backup from './pages/Backup';
import Payroll from './pages/Payroll';

function FullScreenLoader() {
  return (
    <div className="center-screen" id="app-loading-screen">
      <div style={{ textAlign: 'center', color: 'var(--primary)' }}>
        <div className="spinner" style={{ margin: '0 auto' }} />
        <div style={{ marginTop: 12, fontWeight: 600 }}>Đang tải...</div>
      </div>
    </div>
  );
}

function Protected({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isApproved) return <PendingApproval />;
  if (user.role === Role.STUDENT) return <Navigate to="/student" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/classes" replace />;
  return <Layout>{children}</Layout>;
}

function StudentProtected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/student-login" replace />;
  if (!user.isApproved || user.role !== Role.STUDENT) return <Navigate to="/student-login" replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isApproved) return <PendingApproval />;
  if (user.role === Role.STUDENT) return <Navigate to="/student" replace />;
  return <Navigate to={user.role === Role.ADMIN ? '/dashboard' : '/classes'} replace />;
}

function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (user) return <HomeRedirect />;
  return <Login />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/student-login" element={<StudentLogin />} />
      <Route path="/parent/:studentId" element={<ParentView />} />
      <Route path="/pay/:studentId" element={<PayView />} />

      <Route path="/student" element={<StudentProtected><StudentPortal /></StudentProtected>} />
      <Route path="/student/assignment/:assignmentId" element={<StudentProtected><StudentWorkRoom /></StudentProtected>} />

      <Route path="/dashboard" element={<Protected roles={[Role.ADMIN]}><Dashboard /></Protected>} />
      <Route path="/classes" element={<Protected><Classes /></Protected>} />
      <Route path="/timetable" element={<Protected roles={[Role.ADMIN, Role.TEACHER]}><Timetable /></Protected>} />
      <Route path="/students" element={<Protected roles={[Role.ADMIN, Role.TEACHER]}><Students /></Protected>} />
      <Route path="/student-accounts" element={<Protected roles={[Role.ADMIN, Role.TEACHER]}><StudentAccounts /></Protected>} />
      <Route path="/attendance" element={<Protected><Attendance /></Protected>} />
      <Route path="/grades" element={<Protected roles={[Role.ADMIN, Role.TEACHER]}><Grades /></Protected>} />
      <Route path="/tuition" element={<Protected roles={[Role.ADMIN, Role.TEACHER]}><Tuition /></Protected>} />
      <Route path="/payroll" element={<Protected roles={[Role.ADMIN]}><Payroll /></Protected>} />
      <Route path="/assignments" element={<Protected roles={[Role.ADMIN, Role.TEACHER, Role.TA]}><Assignments /></Protected>} />
      <Route path="/assignments/create" element={<Protected roles={[Role.ADMIN, Role.TEACHER]}><AssignmentCreate /></Protected>} />
      <Route path="/assignments/:assignmentId/monitor" element={<Protected roles={[Role.ADMIN, Role.TEACHER, Role.TA]}><AssignmentMonitor /></Protected>} />
      <Route path="/assignments/:assignmentId/grading" element={<Protected roles={[Role.ADMIN, Role.TEACHER, Role.TA]}><AssignmentGrading /></Protected>} />
      <Route path="/users" element={<Protected roles={[Role.ADMIN]}><Users /></Protected>} />
      <Route path="/backup" element={<Protected roles={[Role.ADMIN]}><Backup /></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
