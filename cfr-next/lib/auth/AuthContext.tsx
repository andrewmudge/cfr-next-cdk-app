'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { formatPhoneForCognito } from '@/lib/phone-utils';
// All auth actions will be handled via Next.js API routes


interface User {
  id: string;
  username: string;
  email: string;
  attributes?: {
    given_name?: string;
    family_name?: string;
    phone_number?: string;
  };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, firstName: string, lastName: string, phone: string) => Promise<{ nextStep: string }>;
  signOut: () => Promise<void>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  confirmResetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  isAuthModalOpen: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);


  // Configure Amplify on client side
  // No Amplify config needed

  useEffect(() => {
    // On mount, check if user is authenticated via API route
    const fetchUser = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, []);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sign in failed');
      // Map backend user response to expected User shape
      const attributes = data.user?.attributes || {};
      setUser({
        id: data.user?.attributes?.sub || '',
        username: attributes.given_name || data.user?.attributes?.preferred_username || data.user?.email || '',
        email: data.user?.email || '',
        attributes: {
          given_name: attributes.given_name,
          family_name: attributes.family_name,
          phone_number: attributes.phone_number,
        }
      });
      setIsAuthModalOpen(false);
      // Optionally redirect admin
      if (data.user?.email === 'mudge.andrew@gmail.com' && window.location.search.includes('admin=true')) {
        window.location.href = '/admin';
      }
    } catch (error: unknown) {
      if (error instanceof Error) throw error;
      throw new Error('Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, firstName: string, lastName: string, phone: string) => {
    setLoading(true);
    try {
      const formattedPhone = formatPhoneForCognito(phone);
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, firstName, lastName, phone: formattedPhone })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sign up failed');
      return { nextStep: data.nextStep };
    } catch (error: unknown) {
      if (error instanceof Error) throw error;
      throw new Error('Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
      setUser(null);
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const confirmSignUp = async (email: string, code: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Confirmation failed');
    } catch (error: unknown) {
      if (error instanceof Error) throw error;
      throw new Error('Confirmation failed');
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (email: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset password failed');
    } catch (error: unknown) {
      if (error instanceof Error) throw error;
      throw new Error('Reset password failed');
    } finally {
      setLoading(false);
    }
  };

  const confirmResetPassword = async (email: string, code: string, newPassword: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/confirm-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Confirm reset failed');
    } catch (error: unknown) {
      if (error instanceof Error) throw error;
      throw new Error('Confirm reset failed');
    } finally {
      setLoading(false);
    }
  };

  const openAuthModal = () => setIsAuthModalOpen(true);
  const closeAuthModal = () => setIsAuthModalOpen(false);


  const value: AuthContextType = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    confirmSignUp,
    resetPassword,
    confirmResetPassword,
    openAuthModal,
    closeAuthModal,
    isAuthModalOpen,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};