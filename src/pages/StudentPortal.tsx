import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, LogOut, RefreshCcw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { signOutUser } from '../services/authService';
import { getAssignment, getStudentAssignmentTargets } from '../services/assignmentService';
import { Assignment, AssignmentTarget, Role } from '../types';

interface Row { target: AssignmentTarget; assignment: Assignment | null }

export default function StudentPortal() {
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.studentId]);

  async function load() {
    if (!user?.studentId) return;
    setLoading(true);
    try {
      const targets = await getStudentAssignmentTargets(user.studentId);
      const loaded = await Promise.all(targets.map(async (t) => ({ target: t, assignment: await getAssignment(t.assignmentId) })));
      setRows(loaded.filter((r) => r.assignment?.status === 'published' || r.target.status !== 'assigned'));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi tải bài học sinh', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await signOutUser();
    window.location.href = '/student-login';
  }

  if (!user || user.role !== Role.STUDENT) return null;
  if (loading) return <div className="center-screen"><div className="spinner" /></div>;

  return (
    <div className="student-portal-page">
      <div className="student-topbar">
        <div><strong>{user.name}</strong><span>Cổng học sinh</span></div>
        <button className="btn btn-ghost btn-sm" onClick={logout}><LogOut size={14} /> Đăng xuất</button>
      </div>
      <main className="student-main fade-up">
        <div className="page-header">
          <div>
            <h1 className="page-title"><BookOpen size={26} /> <span>Bài được giao</span></h1>
            <p className="page-sub">Xem bài tập, bài kiểm tra và kết quả chấm</p>
          </div>
          <button className="btn btn-ghost" onClick={load}><RefreshCcw size={16} /> Tải lại</button>
        </div>

        {rows.length === 0 ? (
          <div className="card"><div className="empty-state"><h3>Chưa có bài nào được giao</h3><p>Hãy kiểm tra lại sau hoặc liên hệ giáo viên.</p></div></div>
        ) : (
          <div className="student-assignment-grid">
            {rows.map(({ target, assignment }) => assignment && (
              <div className="card student-assignment-card" key={target.id}>
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span>{assignment.title}</span>
                  <span className="badge" style={{ background: 'rgba(255,255,255,.25)', color: '#fff' }}>{assignment.mode === 'exam' ? 'Kiểm tra' : 'Bài tập'}</span>
                </div>
                <div className="card-body">
                  <p style={{ color: 'var(--text-muted)', minHeight: 34 }}>{assignment.description || 'Không có dặn dò.'}</p>
                  <div className="student-assignment-meta">
                    <div><span>Lớp</span><strong>{assignment.className}</strong></div>
                    <div><span>Trạng thái</span><StatusBadge status={target.status} /></div>
                    <div><span>Hạn nộp</span><strong>{assignment.closesAt ? assignment.closesAt.toLocaleString('vi-VN') : 'Không hạn'}</strong></div>
                    <div><span>Điểm</span><strong>{target.finalScore !== undefined ? `${target.finalScore}/${target.maxScore}` : target.autoScore !== undefined ? `${target.autoScore}/${target.maxScore || ''}` : '—'}</strong></div>
                  </div>
                  <button className="btn btn-primary" style={{ width: '100%', marginTop: 14 }} onClick={() => nav(`/student/assignment/${assignment.id}`)}>
                    {target.status === 'graded' ? 'Xem lại bài' : target.status === 'submitted' ? 'Xem bài đã nộp' : 'Vào làm bài'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    assigned: { cls: 'badge-warning', label: 'Chưa làm' },
    in_progress: { cls: 'badge-info', label: 'Đang làm' },
    submitted: { cls: 'badge-warning', label: 'Đã nộp' },
    graded: { cls: 'badge-success', label: 'Đã chấm' },
  };
  const m = map[status] || { cls: 'badge-info', label: status };
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}
