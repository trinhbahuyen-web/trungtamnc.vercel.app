import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { GraduationCap, Lock, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { loginStudent } from '../services/studentAuthService';
import { Role } from '../types';

export default function StudentLogin() {
  const { user, loading, refresh } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (loading) return <div className="center-screen"><div className="spinner" /></div>;
  if (user?.role === Role.STUDENT) return <Navigate to="/student" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await loginStudent(username, password);
      await refresh();
      window.location.href = '/student';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page student-login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">
          <span className="icon"><GraduationCap size={30} /></span>
          <h1>Cổng học sinh</h1>
          <p>Làm bài tập và bài kiểm tra online</p>
        </div>
        {error && <div className="login-error">{error}</div>}
        <div className="form-group" style={{ textAlign: 'left', marginTop: 18 }}>
          <label className="form-label"><User size={14} /> Tên đăng nhập</label>
          <input className="form-control" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="VD: phuc_t8" autoFocus />
        </div>
        <div className="form-group" style={{ textAlign: 'left' }}>
          <label className="form-label"><Lock size={14} /> Mật khẩu</label>
          <input className="form-control" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mật khẩu được giáo viên cấp" />
        </div>
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={busy}>
          {busy ? 'Đang đăng nhập...' : 'Đăng nhập học sinh'}
        </button>
        <p className="page-sub" style={{ marginTop: 14 }}>Tài khoản do giáo viên hoặc trung tâm cấp.</p>
      </form>
    </div>
  );
}
