import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { GraduationCap, ChevronDown, ChevronUp, X, Wallet } from 'lucide-react';
import { getStudentReport, fmtCurrency, fmtDate } from '../services/dataService';
import { ParentReport } from '../types';

export default function ParentView() {
  const { studentId } = useParams<{ studentId: string }>();
  const [data, setData] = useState<ParentReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [openClass, setOpenClass] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) return;
    getStudentReport(studentId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Lỗi'))
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading)
    return (
      <div className="center-screen">
        <div style={{ textAlign: 'center', color: 'var(--primary)' }}>
          <GraduationCap size={40} />
          <div style={{ marginTop: 12, fontWeight: 600 }}>Đang tải thông tin...</div>
        </div>
      </div>
    );

  if (error)
    return (
      <div className="center-screen">
        <div className="info-card">
          <div className="info-icon" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>
            <X size={30} />
          </div>
          <h2 style={{ color: 'var(--danger)', margin: '0.5rem 0' }}>Không tìm thấy</h2>
          <p style={{ color: 'var(--text-muted)' }}>{error}</p>
        </div>
      </div>
    );

  const student = data?.student;
  const classes = data?.classes || [];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-gradient)', padding: '1.5rem' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div
          style={{
            background: 'var(--teal-gradient)',
            borderRadius: 20,
            padding: '2rem',
            color: '#fff',
            marginBottom: '1.5rem',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div style={{ fontSize: '0.85rem', opacity: 0.85, marginBottom: '0.5rem', display: 'flex', gap: 6, alignItems: 'center' }}>
            <GraduationCap size={16} /> Trung tâm Giáo dục
          </div>
          <h1 style={{ margin: 0, fontSize: '1.7rem', fontWeight: 800 }}>{student?.fullName}</h1>
          <div style={{ marginTop: '0.75rem', opacity: 0.92, fontSize: '0.92rem' }}>
            {student?.parentName && <span style={{ marginRight: '1.5rem' }}>👨‍👩‍👧 {student.parentName}</span>}
            {student?.parentPhone && <span>📞 {student.parentPhone}</span>}
          </div>
          {student?.note && (
            <div style={{ marginTop: '0.75rem', opacity: 0.85, fontSize: '0.85rem' }}>📝 {student.note}</div>
          )}
        </div>

        {classes.length > 0 && (
          <Link
            to={`/pay/${studentId}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              background: '#fff',
              color: 'var(--primary)',
              border: '2px solid var(--primary)',
              borderRadius: 14,
              padding: '0.9rem',
              fontWeight: 700,
              textDecoration: 'none',
              marginBottom: '1.25rem',
              boxShadow: 'var(--shadow)',
            }}
          >
            <Wallet size={18} /> Xem phiếu &amp; đóng học phí
          </Link>
        )}

        {classes.length === 0 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Học sinh chưa được đăng ký lớp nào
          </div>
        )}

        {classes.map((cls) => {
          const isOpen = openClass === cls.classId;
          const attPct =
            cls.sessionsTotal > 0
              ? Math.round((cls.sessionsAttended / cls.sessionsTotal) * 100)
              : 0;

          return (
            <div
              key={cls.classId}
              style={{
                background: '#fff',
                borderRadius: 16,
                marginBottom: '1rem',
                boxShadow: '0 4px 20px rgba(13,148,136,0.1)',
                border: '1px solid var(--border)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '1.25rem 1.5rem',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
                onClick={() => setOpenClass(isOpen ? null : cls.classId)}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text)' }}>
                    {cls.className}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    {[cls.subject, cls.grade && `Khối ${cls.grade}`].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Học phí</div>
                    <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{fmtCurrency(cls.tuition)}</div>
                  </div>
                  <span style={{ color: 'var(--primary)', display: 'flex' }}>
                    {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))',
                  borderTop: '1px solid var(--border)',
                  borderBottom: isOpen ? '1px solid var(--border)' : 'none',
                }}
              >
                {[
                  ['📅', 'Đã học', `${cls.sessionsAttended}/${cls.sessionsTotal} buổi`],
                  ['✅', 'Chuyên cần', `${attPct}%`],
                  ['📝', 'TB điểm', cls.average10 !== undefined && cls.average10 !== null ? `${cls.average10}/10` : '—'],
                  ['💰', 'Học phí/buổi', fmtCurrency(cls.feePerSession)],
                ].map(([icon, label, val]) => (
                  <div key={label} style={{ padding: '0.75rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {icon} {label}
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.95rem' }}>
                      {val}
                    </div>
                  </div>
                ))}
              </div>

              {isOpen && (
                <div style={{ padding: '1.25rem 1.5rem' }}>
                  {cls.scores.length > 0 && (
                    <div style={{ marginBottom: '1.5rem' }}>
                      <h4 style={{ color: 'var(--primary)', marginBottom: '0.75rem' }}>📝 Điểm số</h4>
                      <div className="table-wrap">
                        <table style={{ fontSize: '0.9rem' }}>
                          <thead>
                            <tr>
                              {['Ngày', 'Bài kiểm tra', 'Điểm', 'Tối đa'].map((h) => (
                                <th key={h}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {cls.scores.map((s, i) => (
                              <tr key={i}>
                                <td>{fmtDate(s.date)}</td>
                                <td style={{ fontWeight: 600 }}>{s.examName}</td>
                                <td>
                                  <span
                                    style={{
                                      fontWeight: 700,
                                      color:
                                        s.maxScore > 0 && s.score / s.maxScore >= 0.5
                                          ? 'var(--success)'
                                          : 'var(--danger)',
                                    }}
                                  >
                                    {s.score}
                                  </span>
                                </td>
                                <td style={{ color: 'var(--text-muted)' }}>{s.maxScore}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {cls.attendance.length > 0 && (
                    <div>
                      <h4 style={{ color: 'var(--primary)', marginBottom: '0.75rem' }}>
                        📋 Điểm danh gần đây
                      </h4>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                          gap: '0.5rem',
                        }}
                      >
                        {cls.attendance.slice(0, 20).map((a, i) => (
                          <div
                            key={i}
                            style={{
                              background: a.present ? 'var(--success-light)' : 'var(--danger-light)',
                              color: a.present ? 'var(--success)' : 'var(--danger)',
                              borderRadius: 10,
                              padding: '6px 10px',
                              fontSize: '0.82rem',
                              fontWeight: 600,
                              textAlign: 'center',
                            }}
                          >
                            {a.present ? '✓' : '✗'} {fmtDate(a.date)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {cls.scores.length === 0 && cls.attendance.length === 0 && (
                    <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Chưa có dữ liệu</p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div style={{ textAlign: 'center', marginTop: '2rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          🔒 Trang dành riêng cho phụ huynh · Trung tâm Giáo dục
        </div>
      </div>
    </div>
  );
}
