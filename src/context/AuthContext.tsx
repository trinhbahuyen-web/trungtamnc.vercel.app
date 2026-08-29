import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { AppUser } from '../types';
import {
  getUserProfile,
  signInWithGoogle,
  signOutUser,
  subscribeToAuth,
} from '../services/authService';
import { auth } from '../config/firebase';

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  login: () => Promise<AppUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (uid: string) => {
    try {
      const profile = await getUserProfile(uid);
      setUser(profile);
    } catch (err) {
      console.error('Error loading user profile:', err);
      setUser(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    const current = auth.currentUser;
    if (current) {
      await fetchProfile(current.uid);
    } else {
      setUser(null);
    }
  }, [fetchProfile]);

  useEffect(() => {
    const unsubscribe = subscribeToAuth(async (fbUser) => {
      if (fbUser) {
        await fetchProfile(fbUser.uid);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [fetchProfile]);

  const login = useCallback(async (): Promise<AppUser> => {
    setLoading(true);
    try {
      const u = await signInWithGoogle();
      setUser(u);
      return u;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    await signOutUser();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
