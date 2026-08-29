import { useEffect, useState } from 'react';
import { ClipboardList, Eye, Plus, RefreshCcw, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Assignment, Role } from '../types';
import { getAssignments, updateAssignmentStatus } from '../services/assignmentService';
import { fmtDate } from '../services/dataService';

export default function Assignments() {
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [items, setItems] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  async function load() {
    if (!user) return;
    setLoading(true);
    try { setItems(await getAssignments(user)); }
    catch (e) { toast(e instanceof Error ? e.message : 'Lỗi tải bài giao', 'error'); }
    finally { setLoading(false); }
  }

  async function closeAssignment(a: Assignment) {
    if (!window.confirm(`Đóng bài "${a.title}"? Học sinh sẽ không nộp thêm được.`)) return;
    try { await updateAssignmentStatus(a.id, 'closed'); toast('Đã đóng bài'); load(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Lỗi cập nhật', 'error'); }
  }

  const filtered = items.filter((a) =>
    a.title.toLowerCase().includes(q.toLowerCase()) ||
    a.className.toLowerCase().includes(q.toLowerCase()) ||
    a.mode.includes(q.toLowerCase())
  );

  if (loading) return <div className="loading-state"><div className="spinner" /><span>Đang tải...</span></div>;

  return (
    <div className="fade-up assignment-page">
      <div className="page-header">
        <div>
          <h1 className="page-title"><ClipboardList size={26} /> <span>Bài tập & Kiểm tra</span></h1>
          <p className="page-sub">Giao bài, theo dõi tiến độ và chấm bài online</p>
        </div>
        {(user?.role === Role.ADMIN || user?.role === Role.TEACHER) && (
          <button className="btn btn-primary" onClick={() => nav('/assignments/create')}><Plus size={16} /> Tạo bài mới</button>
        )}
      </div>

      <div className="filter-bar">
        <input className="search-box" placeholder="Tìm tên bài, lớp..." value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-ghost" onClick={load}><RefreshCcw size={16} /> Tải lại</button>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state"><h3>Chưa có bài nào</h3><p>Nhấn “Tạo bài mới” để upload đề Word và giao cho lớp.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Bài giao</th><th>Lớp</th><th>Chế độ</th><th>Thời gian</th><th>Trạng thái</th><th>Người giao</th><th>Thao tác</th></tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.title}</strong><div className="student-subline">{a.description || '—'}</div></td>
                    <td>{a.className}</td>
                    <td><span className={`badge ${a.mode === 'exam' ? 'badge-warning' : 'badge-info'}`}>{a.mode === 'exam' ? 'Kiểm tra' : 'Bài tập'}</span></td>
                    <td>
                      <div>{a.opensAt ? fmtDate(a.opensAt.toISOString().slice(0, 10)) : 'Mở ngay'}</div>
                      <div className="student-subline">{a.closesAt ? `Hạn: ${a.closesAt.toLocaleString('vi-VN')}` : 'Không hạn'}</div>
                    </td>
                    <td><span className={`badge ${a.status === 'published' ? 'badge-success' : a.status === 'closed' ? 'badge-danger' : 'badge-warning'}`}>{a.status === 'published' ? 'Đang mở' : a.status === 'closed' ? 'Đã đóng' : 'Nháp'}</span></td>
                    <td>{a.assignedByName || '—'}</td>
                    <td className="actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => nav(`/assignments/${a.id}/monitor`)}><Eye size={14} /> Theo dõi</button>
                      <button className="btn btn-primary btn-sm" style={{ marginLeft: 4 }} onClick={() => nav(`/assignments/${a.id}/grading`)}>Chấm bài</button>
                      {a.status !== 'closed' && <button className="btn btn-ghost btn-sm" style={{ marginLeft: 4, color: 'var(--danger)' }} onClick={() => closeAssignment(a)}><XCircle size={14} /> Đóng</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
