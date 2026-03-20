import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  console.log('ProtectedRoute:', { 
    path: location.pathname, 
    user: user?.email, 
    role: profile?.role, 
    status: profile?.status,
    requireAdmin 
  });

  if (!user || !profile) {
    console.log('ProtectedRoute: No user or profile, redirecting to login');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireAdmin && profile.role !== 'admin' && profile.role !== 'data_editor') {
    console.log('ProtectedRoute: Admin required but user is not admin/editor, redirecting to home');
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
