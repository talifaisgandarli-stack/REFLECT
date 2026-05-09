import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/lib/store';
import { useAuthBootstrap } from '@/lib/auth';
import { Layout } from '@/components/Layout';
// Critical-path pages — bundled into the initial chunk so first paint
// after login is instant.
import { LoginPage } from '@/pages/Login';
import { DashboardPage } from '@/pages/Dashboard';
import { TasksPage } from '@/pages/Tasks';
import { ProjectsPage } from '@/pages/Projects';
import { NotificationPreferencesPage } from '@/pages/NotificationPreferences';
import { SurveyPublicPage } from '@/pages/SurveyPublic';

// Lazy-loaded — pages that pull recharts, the chat surface, the
// settings manager etc. Each becomes its own chunk so the dashboard
// after login isn't slowed down by code paths the user might not
// touch this session.
const ProjectDetailPage = lazy(() =>
  import('@/pages/ProjectDetail').then((m) => ({ default: m.ProjectDetailPage })),
);
const TaskDetailPage = lazy(() =>
  import('@/pages/TaskDetail').then((m) => ({ default: m.TaskDetailPage })),
);
const ArchivePage = lazy(() =>
  import('@/pages/Archive').then((m) => ({ default: m.ArchivePage })),
);
const DoneListPage = lazy(() =>
  import('@/pages/DoneList').then((m) => ({ default: m.DoneListPage })),
);
const OutsourcePage = lazy(() =>
  import('@/pages/Outsource').then((m) => ({ default: m.OutsourcePage })),
);
const ClientsPage = lazy(() =>
  import('@/pages/Clients').then((m) => ({ default: m.ClientsPage })),
);
const FinancePage = lazy(() =>
  import('@/pages/Finance').then((m) => ({ default: m.FinancePage })),
);
const ReportsPage = lazy(() =>
  import('@/pages/Reports').then((m) => ({ default: m.ReportsPage })),
);
const AuditLogPage = lazy(() =>
  import('@/pages/AuditLog').then((m) => ({ default: m.AuditLogPage })),
);
const MiraiPage = lazy(() =>
  import('@/pages/Mirai').then((m) => ({ default: m.MiraiPage })),
);
const MiraiCostPage = lazy(() =>
  import('@/pages/MiraiCost').then((m) => ({ default: m.MiraiCostPage })),
);
const TelegramLinkPage = lazy(() =>
  import('@/pages/TelegramLink').then((m) => ({ default: m.TelegramLinkPage })),
);
const SettingsPage = lazy(() =>
  import('@/pages/Settings').then((m) => ({ default: m.SettingsPage })),
);
const TeamRosterPage = lazy(() =>
  import('@/pages/team/Roster').then((m) => ({ default: m.TeamRosterPage })),
);
const SalaryPage = lazy(() =>
  import('@/pages/team/Salary').then((m) => ({ default: m.SalaryPage })),
);
const PerformancePage = lazy(() =>
  import('@/pages/team/Performance').then((m) => ({ default: m.PerformancePage })),
);
const LeavePage = lazy(() =>
  import('@/pages/team/Leave').then((m) => ({ default: m.LeavePage })),
);
const CalendarPage = lazy(() =>
  import('@/pages/team/Calendar').then((m) => ({ default: m.CalendarPage })),
);
const AnnouncementsPage = lazy(() =>
  import('@/pages/team/Announcements').then((m) => ({ default: m.AnnouncementsPage })),
);
const EquipmentPage = lazy(() =>
  import('@/pages/team/Equipment').then((m) => ({ default: m.EquipmentPage })),
);
const OkrPage = lazy(() =>
  import('@/pages/company/Okr').then((m) => ({ default: m.OkrPage })),
);
const CareerPage = lazy(() =>
  import('@/pages/company/Career').then((m) => ({ default: m.CareerPage })),
);
const ContentPlanPage = lazy(() =>
  import('@/pages/company/ContentPlan').then((m) => ({ default: m.ContentPlanPage })),
);

function RequireAuth({ children }: { children: JSX.Element }) {
  const { session, hydrated } = useAuth();
  if (!hydrated) return null;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ children }: { children: JSX.Element }) {
  const { isAdmin, hydrated } = useAuth();
  if (!hydrated) return null;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

// Subtle placeholder while a chunk loads. The .card surface matches
// the rest of the dashboard so the swap is visually quiet.
function RouteFallback() {
  return <div className="card text-meta" style={{ minHeight: 120 }} />;
}

export default function App() {
  useAuthBootstrap();
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/survey/:token" element={<SurveyPublicPage />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          {/* İŞ */}
          <Route path="/" element={<DashboardPage />} />
          <Route path="/layihelər" element={<ProjectsPage />} />
          <Route path="/layihelər/:id" element={<ProjectDetailPage />} />
          <Route path="/tapşırıqlar" element={<TasksPage />} />
          <Route path="/tapşırıqlar/:id" element={<TaskDetailPage />} />
          <Route path="/tamamlandı" element={<DoneListPage />} />
          <Route path="/arxiv" element={<ArchivePage />} />
          <Route path="/podrat" element={<OutsourcePage />} />

          {/* MÜŞTƏRİLƏR (admin) */}
          <Route
            path="/müştərilər"
            element={
              <RequireAdmin>
                <ClientsPage />
              </RequireAdmin>
            }
          />

          {/* MALİYYƏ (admin) */}
          <Route
            path="/maliyyə"
            element={
              <RequireAdmin>
                <FinancePage />
              </RequireAdmin>
            }
          />

          {/* HESABATLAR (admin) */}
          <Route
            path="/hesabatlar"
            element={
              <RequireAdmin>
                <ReportsPage />
              </RequireAdmin>
            }
          />

          {/* AUDIT (admin) */}
          <Route
            path="/audit"
            element={
              <RequireAdmin>
                <AuditLogPage />
              </RequireAdmin>
            }
          />

          {/* MIRAI cost dashboard (admin) */}
          <Route
            path="/mirai/cost"
            element={
              <RequireAdmin>
                <MiraiCostPage />
              </RequireAdmin>
            }
          />

          {/* KOMANDA */}
          <Route path="/komanda/heyət" element={<TeamRosterPage />} />
          <Route path="/komanda/maaş" element={<SalaryPage />} />
          <Route path="/komanda/performans" element={<PerformancePage />} />
          <Route path="/komanda/məzuniyyət" element={<LeavePage />} />
          <Route path="/komanda/təqvim" element={<CalendarPage />} />
          <Route path="/komanda/elanlar" element={<AnnouncementsPage />} />
          <Route path="/komanda/avadanlıq" element={<EquipmentPage />} />

          {/* ŞİRKƏT */}
          <Route path="/şirkət/okr" element={<OkrPage />} />
          <Route path="/şirkət/karyera" element={<CareerPage />} />
          <Route
            path="/şirkət/məzmun"
            element={
              <RequireAdmin>
                <ContentPlanPage />
              </RequireAdmin>
            }
          />

          {/* SİSTEM (admin) */}
          <Route
            path="/parametrlər/*"
            element={
              <RequireAdmin>
                <SettingsPage />
              </RequireAdmin>
            }
          />

          {/* MIRAI + Telegram */}
          <Route path="/mirai" element={<MiraiPage />} />
          <Route path="/telegram" element={<TelegramLinkPage />} />

          {/* Personal — accessible to every authenticated user */}
          <Route path="/bildirişlər" element={<NotificationPreferencesPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
