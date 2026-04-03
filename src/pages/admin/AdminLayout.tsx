import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Film, Users, Tags, Languages, Clock, LogOut, Menu, X, MonitorPlay, BarChart3, DollarSign, AlertTriangle, Bell, MessageCircle } from 'lucide-react';
import { clsx } from 'clsx';
import ConfirmModal from '../../components/ConfirmModal';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';

export default function AdminLayout() {
  const { logout, profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [reportedLinksCount, setReportedLinksCount] = useState(0);

  useEffect(() => {
    if (profile?.role !== 'admin' && profile?.role !== 'owner' && profile?.role !== 'content_manager' && profile?.role !== 'manager') return;

    const fetchReportedLinksCount = async () => {
      try {
        const q = query(collection(db, 'reported_links'), where('status', '==', 'pending'));
        const snapshot = await getDocs(q);
        setReportedLinksCount(snapshot.size);
      } catch (error) {
        console.error("Error fetching reported links count:", error);
      }
    };
    fetchReportedLinksCount();
  }, [profile]);

  const allNavItems = [
    { path: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
    { path: '/admin/orders', label: 'Orders', icon: DollarSign },
    { path: '/admin/content', label: 'Movies & Series', icon: Film },
    { path: '/admin/users', label: 'Membership', icon: Users },
    { path: '/admin/user-managers', label: 'User Managers', icon: Users },
    { path: '/admin/temporary-users', label: 'Temporary Users', icon: Clock },
    { path: '/admin/selected-content', label: 'Selected Content Only', icon: Film },
    { path: '/admin/income', label: 'Income / Earn', icon: DollarSign },
    { path: '/admin/error-links', label: 'Error Links', icon: AlertTriangle },
    { path: '/admin/reported-links', label: `Reported Links${reportedLinksCount > 0 ? ` (${reportedLinksCount})` : ''}`, icon: AlertTriangle },
    { path: '/admin/notifications', label: 'Notifications', icon: Bell },
    { path: '/admin/requests', label: 'Movie Requests', icon: MessageCircle },
  ];

  let navItems = allNavItems;
  if (profile?.role === 'content_manager') {
    navItems = allNavItems.filter(item => ['/admin/content'].includes(item.path));
  } else if (profile?.role === 'user_manager') {
    navItems = allNavItems.filter(item => ['/admin/users'].includes(item.path));
  } else if (profile?.role === 'manager') {
    navItems = allNavItems.filter(item => ['/admin/content', '/admin/users'].includes(item.path));
  }

  if (profile?.role === 'content_manager' && !['/admin/content'].includes(location.pathname)) {
    return <Navigate to="/admin/content" replace />;
  }
  if (profile?.role === 'user_manager' && !['/admin/users'].includes(location.pathname)) {
    return <Navigate to="/admin/users" replace />;
  }
  if (profile?.role === 'manager' && !['/admin/content', '/admin/users'].includes(location.pathname)) {
    return <Navigate to="/admin/content" replace />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-zinc-900 border-b border-zinc-800">
        <h1 className="text-xl font-bold text-emerald-500 flex items-center gap-3">
          <img src="/logo.svg?v=2" alt="Logo" className="w-6 h-6" />
          <span className="tracking-tight">
            {profile?.role === 'user_manager' ? 'MovizNow User Manager' : 
             profile?.role === 'content_manager' ? 'MovizNow Content Manager' : 
             profile?.role === 'manager' ? 'MovizNow Manager' : 
             profile?.role === 'owner' ? 'MovizNow Owner' : 'MovizNow Admin'}
          </span>
        </h1>
        {(profile?.role === 'admin' || profile?.role === 'owner') ? (
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 text-zinc-400 hover:text-white"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        ) : (
          <button 
            onClick={() => navigate('/')}
            className="p-2 text-zinc-400 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Sidebar */}
      <aside className={clsx(
        "fixed md:static inset-y-0 left-0 z-50 w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col transform transition-transform duration-300 ease-in-out",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-6 hidden md:block">
          <h1 className="text-2xl font-bold text-emerald-500 flex items-center gap-3">
            <img src="/logo.svg?v=2" alt="Logo" className="w-8 h-8" />
            <span className="tracking-tight">MovizNow</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1 uppercase tracking-wider font-semibold">
            {profile?.role === 'user_manager' ? 'User Manager' : 
             profile?.role === 'content_manager' ? 'Content Manager' : 
             profile?.role === 'manager' ? 'Manager' : 
             profile?.role === 'owner' ? 'Owner Panel' : 'Admin Panel'}
          </p>
        </div>

        <nav className="flex-1 px-4 py-4 md:py-0 space-y-2 overflow-y-auto">
          <Link
            to="/"
            className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium text-emerald-500 hover:bg-zinc-800 mb-4 border border-emerald-500/20"
          >
            <Film className="w-5 h-5" />
            Back to App
          </Link>
          
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={clsx(
                  'flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium',
                  isActive 
                    ? 'bg-emerald-500/10 text-emerald-500' 
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                )}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-zinc-800 mt-auto">
          <button
            onClick={() => setIsLogoutModalOpen(true)}
            className="flex items-center gap-3 px-4 py-3 w-full text-left text-zinc-400 hover:bg-zinc-800 hover:text-white rounded-xl transition-colors font-medium"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-4 md:p-8">
        <Outlet />
      </main>

      <ConfirmModal
        isOpen={isLogoutModalOpen}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        confirmText="Sign Out"
        onConfirm={logout}
        onCancel={() => setIsLogoutModalOpen(false)}
      />
    </div>
  );
}
