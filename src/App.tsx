import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/lib/store';
import { useAuthBootstrap } from '@/lib/auth';
import { Layout } from '@/components/Layout';
import { LoginPage } from '@/pages/Login';
import { DashboardPage } from '@/pages/Dashboard';
import { ProjectsPage } from '@/pages/Projects';
import { ProjectDetailPage } from '@/pages/ProjectDetail';
import { TasksPage } from '@/pages/Tasks';
import { ArchivePage } from '@/pages/Archive';
import { DoneListPage } from '@/pages/DoneList';
import { NotificationPreferencesPage } from '@/pages/NotificationPreferences';
import { OutsourcePage } from '@/pages/Outsource';
import { ClientsPage } from '@/pages/Clients';
import { FinancePage } from '@/pages/Finance';
import { TeamRosterPage } from '@/pages/team/Roster';
import { SalaryPage } from '@/pages/team/Salary';
import { PerformancePage } from '@/pages/team/Performance';
import { LeavePage } from '@/pages/team/Leave';
import { CalendarPage } from '@/pages/team/Calendar';
import { AnnouncementsPage } from '@/pages/team/Announcements';
import { EquipmentPage } from '@/pages/team/Equipment';
import { OkrPage } from '@/pages/company/Okr';
import { CareerPage } from '@/pages/company/Career';
import { ContentPlanPage } from '@/pages/company/ContentPlan';
import { SettingsPage } from '@/pages/Settings';
import { MiraiPage } from '@/pages/Mirai';
import { TelegramLinkPage } from '@/pages/TelegramLink';
import { SurveyPublicPage } from '@/pages/SurveyPublic';

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

export default function App() {
  useAuthBootstrap();
  return (
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
  );
}
