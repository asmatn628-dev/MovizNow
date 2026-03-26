import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Suspense, lazy, useState, useEffect } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Loader2 } from 'lucide-react';
import { SystemNotificationWrapper } from './components/SystemNotificationWrapper';
import { MediaModal } from './components/MediaModal';

// Pages
const Login = lazy(() => import('./pages/Login'));
const Home = lazy(() => import('./pages/user/Home'));
const MovieDetails = lazy(() => import('./pages/user/MovieDetails'));
const WatchLater = lazy(() => import('./pages/user/WatchLater'));
const Favorites = lazy(() => import('./pages/user/Favorites'));
const MovieRequests = lazy(() => import('./pages/user/MovieRequests'));

// Admin Pages
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const Analytics = lazy(() => import('./pages/admin/Analytics'));
const ContentManagement = lazy(() => import('./pages/admin/ContentManagement'));
const GenreManagement = lazy(() => import('./pages/admin/GenreManagement'));
const LanguageManagement = lazy(() => import('./pages/admin/LanguageManagement'));
const QualityManagement = lazy(() => import('./pages/admin/QualityManagement'));
const UserManagement = lazy(() => import('./pages/admin/UserManagement'));
const TemporaryUsers = lazy(() => import('./pages/admin/TemporaryUsers'));
const SelectedContentUsers = lazy(() => import('./pages/admin/SelectedContentUsers'));
const IncomeManagement = lazy(() => import('./pages/admin/IncomeManagement'));
const ErrorLinks = lazy(() => import('./pages/admin/ErrorLinks'));
const Notifications = lazy(() => import('./pages/admin/Notifications'));
const MovieRequestsManagement = lazy(() => import('./pages/admin/MovieRequestsManagement'));

const LoadingFallback = () => (
  <div className="min-h-screen bg-zinc-950" />
);

function MediaModalController({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const navigate = useNavigate();

  const handleApply = (data: any) => {
    navigate('/admin/content', { state: { prefilledData: data } });
    onClose();
  };

  return <MediaModal isOpen={isOpen} onClose={onClose} onApply={handleApply} />;
}

export default function App() {
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);

  return (
    <AuthProvider>
      <SystemNotificationWrapper />
      <BrowserRouter>
        <MediaModalController isOpen={isMediaModalOpen} onClose={() => setIsMediaModalOpen(false)} />
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            {/* User Routes */}
            <Route path="/" element={<ProtectedRoute><Home onOpenMediaModal={() => setIsMediaModalOpen(true)} /></ProtectedRoute>} />
            <Route path="/movie/:id" element={<MovieDetails />} />
            <Route path="/watch-later" element={<ProtectedRoute><WatchLater /></ProtectedRoute>} />
            <Route path="/favorites" element={<ProtectedRoute><Favorites /></ProtectedRoute>} />
            <Route path="/requests" element={<ProtectedRoute><MovieRequests /></ProtectedRoute>} />
            
            {/* Admin Routes */}
            <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminLayout /></ProtectedRoute>}>
              <Route index element={<Navigate to="content" replace />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="content" element={<ContentManagement />} />
              <Route path="genres" element={<GenreManagement />} />
              <Route path="languages" element={<LanguageManagement />} />
              <Route path="qualities" element={<QualityManagement />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="temporary-users" element={<TemporaryUsers />} />
              <Route path="selected-content" element={<SelectedContentUsers />} />
              <Route path="income" element={<IncomeManagement />} />
              <Route path="error-links" element={<ErrorLinks />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="requests" element={<MovieRequestsManagement />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
