import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const rawApiKey = import.meta.env.VITE_FIREBASE_API_KEY;
// Firebase requires apiKey to be a non-empty string starting with AIza
const validApiKey =
  rawApiKey && rawApiKey.trim() !== ''
    ? rawApiKey.trim()
    : 'AIzaSyDemoProjectKeyPlaceholderForPreview12345';

const firebaseConfig = {
  apiKey: validApiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'trungtamnc.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'trungtamnc',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'trungtamnc.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123456789012',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:123456789012:web:abcdef1234567890',
};

export const isFirebaseConfigured = Boolean(
  rawApiKey && rawApiKey.trim() !== '' && rawApiKey !== 'AIzaSyDemoProjectKeyPlaceholderForPreview12345'
);

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// App phụ dùng để admin/giáo viên tạo tài khoản học sinh bằng Email/Password
// mà không làm tài khoản giáo viên hiện tại bị đăng xuất.
const studentCreatorApp =
  getApps().find((a) => a.name === 'studentCreator') ||
  initializeApp(firebaseConfig, 'studentCreator');

export const auth = getAuth(app);
export const studentCreatorAuth = getAuth(studentCreatorApp);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

