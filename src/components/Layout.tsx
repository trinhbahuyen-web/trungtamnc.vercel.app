import { useState, useEffect, useRef, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  School,
  LayoutGrid,
  Users,
  CheckSquare,
  FileText,
  Wallet,
  UserCog,
  LogOut,
  Menu,
  GraduationCap,
  ClipboardList,
  KeyRound,
  Database,
  CalendarCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Role, ROLE_LABEL } from '../types';

interface NavLink {
  icon: ReactNode;
  label: string;
  path: string;
}

const iconProps = { size: 18 };

const NAV: Record<Role, NavLink[]> = {
  [Role.ADMIN]: [
    { icon: <LayoutDashboard {...iconProps} />, label: 'Dashboard', path: '/dashboard' },
    { icon: <School {...iconProps} />, label: 'Lớp học', path: '/classes' },
    { icon: <LayoutGrid {...iconProps} />, label: 'Thời khóa biểu', path: '/timetable' },
    { icon: <Users {...iconProps} />, label: 'Học sinh', path: '/students' },
    { icon: <CheckSquare {...iconProps} />, label: 'Điểm danh', path: '/attendance' },
    { icon: <FileText {...iconProps} />, label: 'Điểm số', path: '/grades' },
    { icon: <Wallet {...iconProps} />, label: 'Học phí', path: '/tuition' },
    { icon: <CalendarCheck {...iconProps} />, label: 'Chấm công GV', path: '/payroll' }, // Đã thêm nút này
    { icon: <ClipboardList {...iconProps} />, label: 'Bài tập & Kiểm tra', path: '/assignments' },
    { icon: <KeyRound {...iconProps} />, label: 'TK học sinh', path: '/student-accounts' },
    { icon: <UserCog {...iconProps} />, label: 'Người dùng', path: '/users' },
    { icon: <Database {...iconProps} />, label: 'Sao lưu dữ liệu', path: '/backup' },
  ],
  [Role.TEACHER]: [
    { icon: <School {...iconProps} />, label: 'Lớp của tôi', path: '/classes' },
    { icon: <LayoutGrid {...iconProps} />, label: 'Thời khóa biểu', path: '/timetable' },
    { icon: <Users {...iconProps} />, label: 'Học sinh', path: '/students' },
    { icon: <CheckSquare {...iconProps} />, label: 'Điểm danh', path: '/attendance' },
    { icon: <FileText {...iconProps} />, label: 'Điểm số', path: '/grades' },
    { icon: <Wallet {...iconProps} />, label: 'Học phí', path: '/tuition' },
    { icon: <ClipboardList {...iconProps} />, label: 'Bài tập & Kiểm tra', path: '/assignments' },
    { icon: <KeyRound {...iconProps} />, label: 'TK học sinh', path: '/student-accounts' },
  ],
  [Role.TA]: [
    { icon: <School {...iconProps} />, label: 'Lớp của tôi', path: '/classes' },
    { icon: <CheckSquare {...iconProps} />, label: 'Điểm danh', path: '/attendance' },
    { icon: <ClipboardList {...iconProps} />, label: 'Bài tập & Kiểm tra', path: '/assignments' },
  ],
  [Role.STUDENT]: [],
};

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const lastNotified = useRef('');

  // HỆ THỐNG ĐỒNG HỒ NHẮC NHỞ SAO LƯU ĐỊNH KỲ (Sáng - Chiều - Tối)
  useEffect(() => {
    if (user?.role !== Role.ADMIN) return;
    
    const checkTime = () => {
      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes();
      const timeKey = `${h}:${m}`;
      
      // Các mốc giờ cần nhắc nhở: 11:30, 17:30, 21:30
      if ((timeKey === '11:30' || timeKey === '17:30' || timeKey === '21:30') && lastNotified.current !== timeKey) {
        toast('⏰ Đã hết ca làm việc! Thầy hãy vào mục "Sao lưu dữ liệu" để tải bản lưu mới nhất về máy nhé!', 'warning');
        lastNotified.current = timeKey;
      }
    };

    const interval = setInterval(checkTime, 60000); // Quét kiểm tra mỗi phút
    return () => clearInterval(interval);
  }, [user, toast]);

  if (!user) return null;
  const items = NAV[user.role] || [];

  return (
    <div className="app-layout">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <h2>
            <GraduationCap size={22} /> Quản lý Trung tâm
          </h2>
          <p>Hệ thống quản lý học tập</p>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section">Menu chính</div>
          {items.map((item) => (
            <button
              key={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => {
                navigate(item.path);
                setOpen(false);
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">
              {user.avatar ? (
                <img src={user.avatar} alt="" />
              ) : (
                (user.name || 'U')[0].toUpperCase()
              )}
            </div>
            <div className="user-card-info">
              <div className="user-card-name">{user.name}</div>
              <div className="user-card-role">{ROLE_LABEL[user.role]}</div>
            </div>
          </div>
          <button className="btn-logout" onClick={logout}>
            <LogOut size={16} /> Đăng xuất
          </button>
        </div>
      </aside>

      <div
        className={`sidebar-overlay ${open ? 'open' : ''}`}
        onClick={() => setOpen(false)}
      />

      <main className="main-content">
        <div className="mobile-header">
          <button className="menu-btn" onClick={() => setOpen(true)}>
            <Menu size={22} />
          </button>
          <span className="mobile-title">
            <GraduationCap size={18} /> Trung tâm
          </span>
          <div style={{ width: 22 }} />
        </div>
        {children}
      </main>
    </div>
  );
}
