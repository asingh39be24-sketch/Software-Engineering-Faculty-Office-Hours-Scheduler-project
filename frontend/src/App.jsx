import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth, homeFor } from './context/AuthContext.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import Landing from './pages/Landing.jsx';
import { LoginPage, RegisterPage } from './pages/Auth.jsx';
import NotFound from './pages/NotFound.jsx';
import { Button } from './components/ui/index.js';

const StudentOverview = lazy(() => import('./pages/student/Overview.jsx'));
const FindFaculty = lazy(() => import('./pages/student/FindFaculty.jsx'));
const FacultySchedule = lazy(() => import('./pages/student/FacultySchedule.jsx'));
const MyBookings = lazy(() => import('./pages/student/MyBookings.jsx'));
const FacultyOverview = lazy(() => import('./pages/faculty/Overview.jsx'));
const Availability = lazy(() => import('./pages/faculty/Availability.jsx'));
const Appointments = lazy(() => import('./pages/faculty/Appointments.jsx'));
const AdminOverview = lazy(() => import('./pages/admin/Overview.jsx'));
const Users = lazy(() => import('./pages/admin/Users.jsx'));
const Activity = lazy(() => import('./pages/admin/Activity.jsx'));
const AdminSlots = lazy(() => import('./pages/admin/Slots.jsx'));
const Notifications = lazy(() => import('./pages/Notifications.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50" role="status" aria-label="Loading">
      <Loader2 className="h-5 w-5 animate-spin text-ink-400" />
    </div>
  );
}

function RequireAuth({ roles, children }) {
  const { user, status, retry } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ink-50 p-6 text-center">
        <p className="text-md font-medium">Can’t reach the server</p>
        <p className="max-w-sm text-sm text-ink-500">Make sure the backend is running, then try again.</p>
        <Button variant="secondary" onClick={retry}>Retry</Button>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return children;
}

function GuestOnly({ children }) {
  const { user, status } = useAuth();
  if (status === 'loading') return <FullPageSpinner />;
  if (user) return <Navigate to={homeFor(user.role)} replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />

        <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route path="/app" element={<RoleHome />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/profile" element={<Profile />} />

          <Route path="/student" element={<RequireAuth roles={['student']}><StudentOverview /></RequireAuth>} />
          <Route path="/student/faculty" element={<RequireAuth roles={['student']}><FindFaculty /></RequireAuth>} />
          <Route path="/student/faculty/:id" element={<RequireAuth roles={['student']}><FacultySchedule /></RequireAuth>} />
          <Route path="/student/bookings" element={<RequireAuth roles={['student']}><MyBookings /></RequireAuth>} />

          <Route path="/faculty" element={<RequireAuth roles={['faculty']}><FacultyOverview /></RequireAuth>} />
          <Route path="/faculty/availability" element={<RequireAuth roles={['faculty']}><Availability /></RequireAuth>} />
          <Route path="/faculty/appointments" element={<RequireAuth roles={['faculty']}><Appointments /></RequireAuth>} />

          <Route path="/admin" element={<RequireAuth roles={['admin']}><AdminOverview /></RequireAuth>} />
          <Route path="/admin/users" element={<RequireAuth roles={['admin']}><Users /></RequireAuth>} />
          <Route path="/admin/activity" element={<RequireAuth roles={['admin']}><Activity /></RequireAuth>} />
          <Route path="/admin/slots" element={<RequireAuth roles={['admin']}><AdminSlots /></RequireAuth>} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

function RoleHome() {
  const { user } = useAuth();
  return <Navigate to={homeFor(user.role)} replace />;
}
