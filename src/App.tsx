import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Suspense, lazy, useState, useEffect } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { ContentProvider } from './contexts/ContentContext';
import { PWAProvider } from './contexts/PWAContext';
import { CartProvider } from './contexts/CartContext';
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
const TopUp = lazy(() => import('./pages/user/TopUp'));
const Cart = lazy(() => import('./pages/user/Cart'));

import AdminLayout from './pages/admin/AdminLayout';
import Analytics from './pages/admin/Analytics';
import ContentManagement from './pages/admin/ContentManagement';
import GenreManagement from './pages/admin/GenreManagement';
import LanguageManagement from './pages/admin/LanguageManagement';
import QualityManagement from './pages/admin/QualityManagement';
import UserManagement from './pages/admin/UserManagement';
import UserManagers from './pages/admin/UserManagers';
import TemporaryUsers from './pages/admin/TemporaryUsers';
import SelectedContentUsers from './pages/admin/SelectedContentUsers';
import IncomeManagement from './pages/admin/IncomeManagement';
import ErrorLinks from './pages/admin/ErrorLinks';
import ReportedLinks from './pages/admin/ReportedLinks';
import Notifications from './pages/admin/Notifications';
import MovieRequestsManagement from './pages/admin/MovieRequestsManagement';
import OrdersManagement from './pages/admin/OrdersManagement';
const InstallApp = lazy(() => import('./pages/InstallApp'));

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
      <ContentProvider>
        <CartProvider>
          <PWAProvider>
            <SystemNotificationWrapper />
            <BrowserRouter>
              <MediaModalController isOpen={isMediaModalOpen} onClose={() => setIsMediaModalOpen(false)} />
              <Suspense fallback={<LoadingFallback />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/app" element={<InstallApp />} />
                  <Route path="/install" element={<InstallApp />} />
                  
                  {/* User Routes */}
                  <Route path="/" element={<ProtectedRoute><Home onOpenMediaModal={() => setIsMediaModalOpen(true)} /></ProtectedRoute>} />
                  <Route path="/movie/:id" element={<MovieDetails />} />
                  <Route path="/watch-later" element={<ProtectedRoute><WatchLater /></ProtectedRoute>} />
                  <Route path="/favorites" element={<ProtectedRoute><Favorites /></ProtectedRoute>} />
                  <Route path="/requests" element={<ProtectedRoute><MovieRequests /></ProtectedRoute>} />
                  <Route path="/top-up" element={<ProtectedRoute><TopUp /></ProtectedRoute>} />
                  <Route path="/cart" element={<ProtectedRoute><Cart /></ProtectedRoute>} />
                  
                  {/* Admin Routes */}
                  <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminLayout /></ProtectedRoute>}>
                    <Route index element={<Navigate to="content" replace />} />
                    <Route path="analytics" element={<Analytics />} />
                    <Route path="orders" element={<OrdersManagement />} />
                    <Route path="content" element={<ContentManagement />} />
                    <Route path="genres" element={<GenreManagement />} />
                    <Route path="languages" element={<LanguageManagement />} />
                    <Route path="qualities" element={<QualityManagement />} />
                    <Route path="users" element={<UserManagement />} />
                    <Route path="user-managers" element={<UserManagers />} />
                    <Route path="temporary-users" element={<TemporaryUsers />} />
                    <Route path="selected-content" element={<SelectedContentUsers />} />
                    <Route path="income" element={<IncomeManagement />} />
                    <Route path="error-links" element={<ErrorLinks />} />
                    <Route path="reported-links" element={<ReportedLinks />} />
                    <Route path="notifications" element={<Notifications />} />
                    <Route path="requests" element={<MovieRequestsManagement />} />
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
          </PWAProvider>
        </CartProvider>
      </ContentProvider>
    </AuthProvider>
  );
}
