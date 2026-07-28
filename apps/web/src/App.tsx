import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { useAuth } from './lib/auth.js';
import { AdminLayout } from './components/AdminLayout.js';
import { MobileLayout } from './components/MobileLayout.js';
import { LoginPage } from './routes/Login.js';
import { Spinner } from './components/ui.js';

// admin bundle 較大，用 lazy 讓手機端不必下載
const Dashboard = lazy(() => import('./routes/admin/Dashboard.js'));
const Attendants = lazy(() => import('./routes/admin/Attendants.js'));
const AttendantDetail = lazy(() => import('./routes/admin/AttendantDetail.js'));
const AttendantForm = lazy(() => import('./routes/admin/AttendantForm.js'));
const Recipients = lazy(() => import('./routes/admin/Recipients.js'));
const RecipientDetail = lazy(() => import('./routes/admin/RecipientDetail.js'));
const RecipientForm = lazy(() => import('./routes/admin/RecipientForm.js'));
const Schedule = lazy(() => import('./routes/admin/Schedule.js'));
const Patterns = lazy(() => import('./routes/admin/Patterns.js'));
const Leaves = lazy(() => import('./routes/admin/Leaves.js'));
const PaymentCodes = lazy(() => import('./routes/admin/PaymentCodes.js'));
const Audit = lazy(() => import('./routes/admin/Audit.js'));
const Policy = lazy(() => import('./routes/admin/Policy.js'));
const Users = lazy(() => import('./routes/admin/Users.js'));

const MobileToday = lazy(() => import('./routes/mobile/Today.js'));
const MobileSchedule = lazy(() => import('./routes/mobile/Schedule.js'));
const MobileVisit = lazy(() => import('./routes/mobile/VisitDetail.js'));
const MobileProfile = lazy(() => import('./routes/mobile/Profile.js'));
const MobileLeaves = lazy(() => import('./routes/mobile/Leaves.js'));

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner label="載入中…" />
    </div>
  );
}

export function App() {
  const { user, loading, isAttendantOnly } = useAuth();

  if (loading) return <FullPageSpinner />;

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/m/login" element={<LoginPage mobile />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // 照服員只有行動端介面 —— 直接輸入 admin 網址也會被導回
  if (isAttendantOnly) {
    return (
      <Suspense fallback={<FullPageSpinner />}>
        <Routes>
          <Route path="/m" element={<MobileLayout />}>
            <Route index element={<MobileToday />} />
            <Route path="schedule" element={<MobileSchedule />} />
            <Route path="visits/:id" element={<MobileVisit />} />
            <Route path="profile" element={<MobileProfile />} />
            <Route path="leaves" element={<MobileLeaves />} />
          </Route>
          <Route path="*" element={<Navigate to="/m" replace />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="attendants" element={<Attendants />} />
          {/* new 需排在 :id 之前，否則會被當成 id */}
          <Route path="attendants/new" element={<AttendantForm />} />
          <Route path="attendants/:id/edit" element={<AttendantForm />} />
          <Route path="attendants/:id" element={<AttendantDetail />} />
          <Route path="recipients" element={<Recipients />} />
          <Route path="recipients/new" element={<RecipientForm />} />
          <Route path="recipients/:id/edit" element={<RecipientForm />} />
          <Route path="recipients/:id" element={<RecipientDetail />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="schedule/patterns" element={<Patterns />} />
          <Route path="leaves" element={<Leaves />} />
          <Route path="payment-codes" element={<PaymentCodes />} />
          <Route path="settings/policy" element={<Policy />} />
          <Route path="settings/users" element={<Users />} />
          <Route path="audit" element={<Audit />} />
        </Route>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
