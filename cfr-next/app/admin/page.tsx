'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';
import { Shield, LogOut, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ManagePhotos from '@/components/admin/ManagePhotos';
import Registrations from '@/components/admin/Registrations';
import Messaging from '@/components/admin/Messaging';
import Chronicle from '@/components/admin/Chronicle';
import { isAdminEmail } from '@/lib/admin-emails';

// Who counts as admin: lib/admin-emails.ts

export default function AdminDashboard() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [showManagePhotos, setShowManagePhotos] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/?admin=true');
        return;
      }
      if (isAdminEmail(user.email)) {
        setIsAuthorized(true);
      } else {
        router.push('/');
      }
    }
  }, [user, loading, router]);

  // Redirect authenticated admin users from home page
  useEffect(() => {
    if (user && isAdminEmail(user.email) && window.location.pathname === '/' && window.location.search.includes('admin=true')) {
      router.push('/admin');
    }
  }, [user, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Access Denied</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <Shield className="w-8 h-8 text-red-500 mr-3" />
              <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-300">Welcome, {user?.attributes?.given_name || 'Admin'}</span>
              <Button
                onClick={signOut}
                variant="outline"
                size="sm"
                className="border-red-400 text-red-300 hover:bg-red-400 hover:text-white"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
          {/* Right-justified Back Button */}
          <div className="flex justify-end pb-4">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="border-blue-400 text-blue-600 hover:bg-blue-400 hover:text-white"
            >
              <a href="https://churchwellreunion.com" target="_blank" rel="noopener noreferrer">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to churchwellreunion.com
              </a>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Quick Actions */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h2 className="text-xl font-bold text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Button asChild className="bg-red-600 hover:bg-red-700 text-white">
              {/* The tree is edited in place: tap anyone on the tree while signed in as admin. */}
              <Link href="/#family-tree-preview">Edit Family Tree</Link>
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => setShowManagePhotos(!showManagePhotos)}
            >
              {showManagePhotos ? 'Hide Manage Photos' : 'Manage Photos'}
            </Button>
          </div>
        </div>

        {/* Manage Photos */}
        {showManagePhotos && (
          <div className="mt-8">
            <ManagePhotos />
          </div>
        )}

        {/* Family email (SES) */}
        <div className="mt-8">
          <Messaging />
        </div>

        {/* Reunion sign-ups */}
        <div className="mt-8">
          <Registrations />
        </div>

        {/* Churchwell Chronicle newsletter */}
        <div className="mt-8">
          <Chronicle />
        </div>
      </main>
    </div>
  );
}