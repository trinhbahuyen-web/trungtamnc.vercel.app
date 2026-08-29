import { useState, useEffect } from 'react';
import {
  Users,
  School,
  GraduationCap,
  HandHelping,
  CheckSquare,
  ClipboardList,
  BarChart3,
  AlertTriangle,
  PhoneCall,
  Clock4,
  AlertOctagon,
  MessageSquare,
  Check
} from 'lucide-react';
import { collection, getDocs, query, where, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getDashboard, getStudentById, getClassById, todayStr } from '../services/dataService';
import { DashboardStats } from '../types';

interface AbsentStudentInfo {
  id: string;
  studentName: string;
  className: string;
  parentPhone: string;
  note: string;
}

interface MissingAttendanceClass {
  classId: string;
  className: string;
  shift: number;
}

interface EditRequest {
  id: string;
  studentName: string;
  teacherName: string;
  message: string;
  status: string;
}

// Hàm hỗ trợ lấy tuần hiện tại để tra lịch học
function getCurrentWeek() {
  const now = new Date();
  const target = new Date(now.valueOf());
  const dayNr = (now.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return `${target.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [absentList, setAbsentList] = useState<AbsentStudentInfo[]>([]);
  const [missingAttList, setMissingAttList] = useState<MissingAttendanceClass[]>([]);
  const [conflictList, setConflictList] = useState<MissingAttendanceClass[]>([]);
  const [editRequests, setEditRequests] = useState<EditRequest[]>([]); // Danh sách yêu cầu sửa
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const dashboardStats = await getDashboard();
        setStats(dashboardStats);

        const today = todayStr();

        // 1. Lấy dữ liệu điểm danh HỌC SINH hôm nay
        const allAttSnap = await getDocs(
          query(collection(db, 'attendance'), where('date', '==', today))
        );
        const allAttData = allAttSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 2. Lấy dữ liệu chấm công GIÁO VIÊN hôm nay
        const teacherAttSnap = await getDocs(
          query(collection(db, 'teacherAttendance'), where('date', '==', today))
        );
        const teacherAttData = teacherAttSnap.docs.map(d => d.data());

        // 3. Xử lý danh sách Học sinh vắng mặt
        const absentRecords = allAttData.filter((a: any) => a.present === false);
        const absentDetails = await Promise.all(
          absentRecords.map(async (data: any) => {
            const student = await getStudentById(data.studentId);
            const cls = await getClassById(data.classId);
            return {
              id: data.id,
              studentName: student?.fullName || 'Không rõ',
              className: cls?.className || 'Không rõ',
              parentPhone: student?.parentPhone || '',
              note: data.note || ''
            };
          })
        );
        absentDetails.sort((a, b) => a.className.localeCompare(b.className));
        setAbsentList(absentDetails);

        // 4. LẤY CÁC YÊU CẦU CẬP NHẬT TỪ GIÁO VIÊN (Dành cho Quản trị)
        if (user?.role === 'ADMIN') {
          const reqSnap = await getDocs(query(collection(db, 'editRequests'), where('status', '==', 'PENDING')));
          const reqs = reqSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
          setEditRequests(reqs);
        }

        // 5. KIỂM TRA CHÉO LOGIC: Lịch học vs Điểm danh HS vs Chấm công GV
        const currentWeek = getCurrentWeek();
        const scheduleSnap = await getDoc(doc(db, 'timetables', currentWeek));
        const schedule = scheduleSnap.exists() ? scheduleSnap.data().data : {};

        const todayObj = new Date();
        const currentDayKey = todayObj.getDay() === 0 ? 8 : todayObj.getDay() + 1;

        const scheduledToday: MissingAttendanceClass[] = [];
        for (let shift = 1; shift <= 5; shift++) {
          const items = schedule[`${currentDayKey}-${shift}`] || [];
          items.forEach((item: any) => {
            scheduledToday.push({
              classId: item.classId,
              className: item.className,
              shift: shift
            });
          });
        }

        const missing: MissingAttendanceClass[] = [];
        const conflicts: MissingAttendanceClass[] = [];

        const payrollStatusSnap = await getDoc(doc(db, 'payrollStatus', today));
        const isPayrollProcessed = payrollStatusSnap.exists() ? payrollStatusSnap.data().processed : false;

        scheduledToday.forEach(cls => {
          const hasStudentAttendance = allAttData.some((a: any) => a.classId === cls.classId);
          
          const dbClassId = `${cls.classId}_SHIFT${cls.shift}`;
          const teacherRecordsForThisClass = teacherAttData.filter((ta: any) => 
            ta.classId === dbClassId || ta.classId === cls.classId
          );

          const isTeacherMarkedAbsent = isPayrollProcessed && 
            (teacherRecordsForThisClass.length === 0 || teacherRecordsForThisClass.every((ta: any) => ta.present === false));

          if (hasStudentAttendance) {
            if (isTeacherMarkedAbsent) {
              conflicts.push(cls);
            }
          } else {
            if (!isTeacherMarkedAbsent) {
              missing.push(cls);
            }
          }
        });

        setMissingAttList(missing);
        setConflictList(conflicts);

      } catch (error) {
        console.error('Lỗi tải Dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [user?.role]);

  // HÀM XỬ LÝ YÊU CẦU TỪ GIÁO VIÊN
  const handleResolveRequest = async (reqId: string) => {
    try {
      await updateDoc(doc(db, 'editRequests', reqId), { status: 'RESOLVED' });
      setEditRequests(prev => prev.filter(r => r.id !== reqId));
      toast('Đã đánh dấu xử lý yêu cầu thành công!', 'success');
    } catch(e) {
      toast('Lỗi khi đánh dấu xử lý', 'error');
    }
  };

  if (loading)
    return (
      <div className="loading-state">
        <div className="spinner" />
        <span>Đang quét dữ liệu hệ thống...</span>
      </div>
    );

  const cards = [
    { icon: <Users size={26} />, label: 'Học sinh', value: stats?.totalStudents ?? 0 },
    { icon: <School size={26} />, label: 'Lớp học', value: stats?.totalClasses ?? 0 },
    { icon: <GraduationCap size={26} />, label: 'Giáo viên', value: stats?.totalTeachers ?? 0 },
    { icon: <HandHelping size={26} />, label: 'Trợ giảng', value: stats?.totalTAs ?? 0 },
    { icon: <CheckSquare size={26} />, label: 'Có mặt hôm nay', value: stats?.presentToday ?? 0 },
    { icon: <ClipboardList size={26} />, label: 'Buổi hôm nay', value: stats?.totalAttToday ?? 0 },
  ];

  const absentCount = (stats?.totalAttToday ?? 0) - (stats?.presentToday ?? 0);
  const pct = stats?.totalAttToday
    ? Math.round((stats.presentToday / stats.totalAttToday) * 100)
    : 0;

  return (
    <div className="fade-up">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <BarChart3 size={26} /> <span>Dashboard</span>
          </h1>
          <p className="page-sub">
            Xin chào, <strong>{user?.name}</strong>! Đây là tổng quan hôm nay.
          </p>
        </div>
      </div>

      <div className="stats-grid">
        {cards.map((c) => (
          <div key={c.label} className="stat-card">
            <span className="stat-icon">{c.icon}</span>
            <div className="stat-value">{c.value}</div>
            <div className="stat-label">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">Thống kê điểm danh hôm nay</div>
        <div className="card-body">
          {stats?.totalAttToday === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <ClipboardList size={40} />
              </div>
              <h3>Chưa có dữ liệu điểm danh hôm nay</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 8 }}>Nếu hôm nay trung tâm nghỉ, bảng này sẽ trống.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <MiniStat value={stats?.presentToday ?? 0} label="Có mặt" color="var(--success)" />
              <MiniStat value={absentCount} label="Vắng mặt" color="var(--danger)" />
              <MiniStat value={`${pct}%`} label="Tỉ lệ có mặt" color="var(--primary)" />
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* BẢNG TIẾP NHẬN YÊU CẦU TỪ GIÁO VIÊN (DÀNH CHO QUẢN TRỊ) */}
        {user?.role === 'ADMIN' && editRequests.length > 0 && (
          <div className="card" style={{ border: '2px solid #3b82f6', boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.2)' }}>
            <div className="card-header" style={{ background: '#eff6ff', color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 8 }}>
              <MessageSquare size={22} />
              <strong>YÊU CẦU CẬP NHẬT TỪ GIÁO VIÊN ({editRequests.length})</strong>
            </div>
            <div className="table-wrap">
              <table className="gradebook-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: 150 }}>Giáo viên gửi</th>
                    <th style={{ width: 220 }}>Học sinh cần sửa</th>
                    <th>Nội dung yêu cầu</th>
                    <th style={{ width: 120, textAlign: 'center' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {editRequests.map(req => (
                    <tr key={req.id}>
                      <td><span className="badge badge-teacher">{req.teacherName}</span></td>
                      <td><strong>{req.studentName}</strong></td>
                      <td style={{ color: '#4b5563', fontStyle: 'italic' }}>"{req.message}"</td>
                      <td style={{ textAlign: 'center' }}>
                        <button 
                          className="btn btn-primary btn-sm" 
                          style={{ background: '#10b981', borderColor: '#10b981', display: 'inline-flex', alignItems: 'center', gap: 4 }} 
                          onClick={() => handleResolveRequest(req.id)}
                          title="Bấm vào đây sau khi thầy đã sửa xong thông tin cho học sinh này ở trang Học Sinh"
                        >
                          <Check size={14} /> Đã xử lý
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CẢNH BÁO XUNG ĐỘT DỮ LIỆU */}
        {conflictList.length > 0 && (
          <div className="card" style={{ border: '2px solid #ef4444', animation: 'pulse 2s infinite' }}>
            <div className="card-header" style={{ background: '#fef2f2', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertOctagon size={22} /> 
              <strong>XUNG ĐỘT DỮ LIỆU CẦN ĐỐI SOÁT GẤP ({conflictList.length} lớp)</strong>
            </div>
            <div className="card-body" style={{ background: '#fff' }}>
              <p style={{ color: '#dc2626', fontSize: '0.9rem', marginBottom: 12, fontWeight: 500 }}>
                Các lớp dưới đây đã bị Quản lý chốt là "Giáo viên vắng mặt", nhưng hệ thống lại phát hiện có bản ghi điểm danh học sinh. Vui lòng kiểm tra lại xem ai thao tác nhầm!
              </p>
              <div className="table-wrap">
                <table className="gradebook-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ width: 80, textAlign: 'center' }}>Ca học</th>
                      <th>Tên Lớp bị xung đột</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conflictList.sort((a,b) => a.shift - b.shift).map((cls, idx) => (
                      <tr key={`conflict_${cls.classId}_${idx}`}>
                        <td style={{ textAlign: 'center', fontWeight: 600, color: '#b91c1c' }}>Ca {cls.shift}</td>
                        <td><strong>{cls.className}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        
        {/* DANH SÁCH LỚP CHƯA ĐIỂM DANH */}
        {missingAttList.length > 0 && (
          <div className="card" style={{ border: '1px solid #fed7aa' }}>
            <div className="card-header" style={{ background: '#fff7ed', color: '#c2410c', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock4 size={20} /> 
              <strong>Giáo viên quên điểm danh ({missingAttList.length} lớp)</strong>
            </div>
            <div className="table-wrap">
              <table className="gradebook-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: 80, textAlign: 'center' }}>Ca học</th>
                    <th>Lớp học chưa điểm danh</th>
                  </tr>
                </thead>
                <tbody>
                  {missingAttList.sort((a,b) => a.shift - b.shift).map((cls, idx) => (
                    <tr key={`${cls.classId}_${idx}`}>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: '#c2410c' }}>Ca {cls.shift}</td>
                      <td><strong>{cls.className}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* DANH SÁCH HỌC SINH VẮNG MẶT */}
        {stats?.totalAttToday !== 0 && absentList.length > 0 && (
          <div className="card" style={{ border: '1px solid #fecaca' }}>
            <div className="card-header" style={{ background: '#fef2f2', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={20} /> 
              <strong>Học sinh vắng mặt ({absentList.length} em)</strong>
            </div>
            <div className="table-wrap">
              <table className="gradebook-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: 60, textAlign: 'center' }}>STT</th>
                    <th>Họ và tên</th>
                    <th style={{ width: 140, textAlign: 'center' }}>Lớp học</th>
                    <th style={{ width: 280 }}>Ghi chú của GV</th>
                    <th style={{ width: 160, textAlign: 'center' }}>Liên hệ Phụ huynh</th>
                  </tr>
                </thead>
                <tbody>
                  {absentList.map((s, idx) => (
                    <tr key={s.id}>
                      <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                      <td>
                        <strong>{s.studentName}</strong>
                      </td>
                      <td style={{ textAlign: 'center' }}><span className="badge badge-warning">{s.className}</span></td>
                      <td style={{ color: '#6b7280', fontSize: '0.9rem' }}>{s.note || <span style={{ fontStyle: 'italic' }}>Không có ghi chú</span>}</td>
                      <td style={{ textAlign: 'center' }}>
                        {s.parentPhone ? (
                          <a 
                            href={`tel:${s.parentPhone}`} 
                            className="btn btn-primary btn-sm" 
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', background: '#059669', borderColor: '#059669' }}
                          >
                            <PhoneCall size={14} /> Gọi điện
                          </a>
                        ) : (
                          <span style={{ color: '#ef4444', fontSize: '0.85rem', fontStyle: 'italic' }}>Thiếu SĐT</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {stats?.totalAttToday !== 0 && absentList.length === 0 && (
        <div className="card" style={{ border: '1px solid #a7f3d0', marginTop: 20 }}>
          <div className="card-body" style={{ background: '#ecfdf5', color: '#065f46', textAlign: 'center', padding: '1.5rem', borderRadius: 8 }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <CheckSquare size={24} /> Tuyệt vời! Hôm nay tất cả học sinh đều đi học đầy đủ.
            </h3>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({
  value,
  label,
  color,
}: {
  value: number | string;
  label: string;
  color: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 180,
        background: 'var(--bg-light)',
        borderRadius: 'var(--radius-sm)',
        padding: '1rem',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '2.1rem', fontWeight: 800, color }}>{value}</div>
      <div style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
    </div>
  );
}
