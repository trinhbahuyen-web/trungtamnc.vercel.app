import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { auth, db, googleProvider } from '../config/firebase';
import { AppUser, Role } from '../types';

const toDate = (v: unknown): Date | undefined => {
  if (!v) return undefined;
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  return undefined;
};

const mapUser = (id: string, data: Record<string, unknown>): AppUser => ({
  id,
  name: (data.name as string) || '',
  email: data.email as string | undefined,
  avatar: data.avatar as string | undefined,
  role: (data.role as Role) || Role.TEACHER,
  isApproved: (data.isApproved as boolean) ?? false,
  createdAt: toDate(data.createdAt),
  studentId: data.studentId as string | undefined,
  classIds: Array.isArray(data.classIds) ? (data.classIds as string[]) : [],
});

/** True if the users collection already has at least one document. */
const hasAnyUsers = async (): Promise<boolean> => {
  const snap = await getDocs(collection(db, 'users'));
  return !snap.empty;
};

/**
 * Sign in with Google. The very first account to ever sign in becomes an
 * approved ADMIN. Every later account is created as a pending TEACHER and
 * must be approved by an admin before it can use the app.
 */
export const signInWithGoogle = async (): Promise<AppUser> => {
  const result = await signInWithPopup(auth, googleProvider);
  const fb = result.user;
  const userRef = doc(db, 'users', fb.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    const isFirst = !(await hasAnyUsers());
    const newUser = {
      name: fb.displayName || 'Người dùng mới',
      email: fb.email || '',
      avatar: fb.photoURL || '',
      role: isFirst ? Role.ADMIN : Role.TEACHER,
      isApproved: isFirst,
      classIds: [],
      createdAt: serverTimestamp(),
    };
    await setDoc(userRef, newUser);
    return {
      id: fb.uid,
      ...newUser,
      createdAt: new Date(),
    } as AppUser;
  }

  return mapUser(userSnap.id, userSnap.data());
};

export const signOutUser = () => signOut(auth);

/** Read the app profile for a Firebase user (or null if none exists yet). */
export const getUserProfile = async (uid: string): Promise<AppUser | null> => {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? mapUser(snap.id, snap.data()) : null;
};

export const subscribeToAuth = (cb: (fb: FirebaseUser | null) => void) => {
  try {
    return onAuthStateChanged(auth, cb, (err) => {
      console.warn('Auth state subscription warning:', err);
      cb(null);
    });
  } catch (err) {
    console.warn('Unable to subscribe to auth state:', err);
    cb(null);
    return () => {};
  }
};

// ====== ADMIN USER MANAGEMENT ======
export const getAllUsers = async (): Promise<AppUser[]> => {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map((d) => mapUser(d.id, d.data()));
};

export const approveUser = (uid: string) =>
  updateDoc(doc(db, 'users', uid), { isApproved: true });

export const setUserRole = (uid: string, role: Role) =>
  updateDoc(doc(db, 'users', uid), { role });

export const setUserApproval = (uid: string, isApproved: boolean) =>
  updateDoc(doc(db, 'users', uid), { isApproved });

export const deleteUserProfile = (uid: string) =>
  deleteDoc(doc(db, 'users', uid));
