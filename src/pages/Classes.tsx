import { useState, useEffect, useRef, useMemo, type ChangeEvent, type MouseEvent } from 'react';
import * as XLSX from 'xlsx';
import {
  School,
  Users,
  GraduationCap,
  Pencil,
  Copy,
  Calendar,
  Wallet,
  Tag,
  BookOpen,
  Upload,
  FileDown,
  Trash2,
  Search,
  FileText,
  MessageSquare,
  UserPlus
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { doc, getDoc, collection, addDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  getClasses,
  getStudents,
  getClassRoster,
  getClassTeachers,
  addClass,
  updateClass,
  enrollStudent,
  removeEnrollment,
  removeEnrollments,
  importStudents,
  assignTeacher,
  removeTeacherFromClass,
  fmtCurrency,
  fmtDate,
  todayStr,
  addStudent
} from '../services/dataService';
import { getAllUsers } from '../services/authService';
import { AppUser, ClassItem, Role, Status, Student } from '../types';
import Modal from '../components/Modal';

interface ClassForm {
  className: string;
  subject: string;
  grade: string;
  feePerSession: string;
  startDate: string;
  status: Status;
}

const EMPTY_FORM: ClassForm = {
  className: '',
  subject: '',
  grade: '',
  feePerSession: '',
  startDate: '',
  status: 'ACTIVE',
};

interface StudentFormState {
  fullName: string;
  studentClass: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  note: string;
  status: Status;
}

const TEMPLATE_HEADERS = [
  'Họ tên học sinh *',
  'Lớp hành chính *',
  'Tên phụ huynh',
  'SĐT phụ huynh * (10 số)',
  'Email phụ huynh',
  'Ghi chú',
  'Trạng thái',
];

const removeAccents = (str: string) => {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
};

const normalizeHeader = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '');

const cellText = (v: unknown) => String(v ?? '').trim();

function getCell(row: Record<string, unknown>, aliases: string[]) {
  const map = new Map<string, unknown>();
  Object.entries(row).forEach(([key, value]) => map.set(normalizeHeader(key), value));

  for (const alias of aliases) {
    const value = map.get(normalizeHeader(alias));
    if (value !== undefined) return cellText(value);
  }

  return '';
}

function parseStatus(value: string): Status {
  const v = value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (v.includes('nghi') || v.includes('inactive') || v.includes('off')) return 'INACTIVE';
  return 'ACTIVE';
}

function getFirstName(fullName: string) {
  if (!fullName) return '';
  const parts = fullName.trim().split(' ');
  return parts[parts.length - 1];
}

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

async function parseStudentExcel(file: File) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('File Excel không có sheet dữ liệu');

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  return rawRows
    .filter((row) => Object.values(row).some((v) => cellText(v)))
    .map((row) => {
      let phone = getCell(row, ['SĐT phụ huynh * (Mất số 0 hệ thống tự bù)', 'SĐT phụ huynh * (10 số)', 'SĐT phụ huynh *', 'SĐT phụ huynh', 'Số điện thoại phụ huynh', 'Điện thoại', 'parentPhone']);
      
      let phoneDigits = phone.replace(/\D/g, ''); 
      if (phoneDigits.length === 9 && !phoneDigits.startsWith('0')) {
         phoneDigits = '0' + phoneDigits;
      } else if (phoneDigits.length === 11 && phoneDigits.startsWith('84')) {
         phoneDigits = '0' + phoneDigits.substring(2);
      }

      return {
        fullName: getCell(row, ['Họ tên học sinh *', 'Họ tên học sinh', 'fullName', 'Tên học sinh']),
        studentClass: getCell(row, ['Lớp hành chính *', 'Lớp hành chính', 'Lớp', 'studentClass']),
        parentName: getCell(row, ['Tên phụ huynh', 'Phụ huynh', 'parentName']),
        parentPhone: phoneDigits, 
        parentEmail: getCell(row, ['Email phụ huynh', 'Email', 'parentEmail']),
        note: getCell(row, ['Ghi chú', 'note']),
        status: parseStatus(getCell(row, ['Trạng thái', 'status'])),
      };
    });
}

function downloadStudentTemplate() {
  const rows = [
    TEMPLATE_HEADERS,
    ['Nguyễn Văn A', '8A', 'Nguyễn Văn B', '0901234567', 'phuhuynh1@gmail.com', 'Học thử', 'ACTIVE'],
    ['Trần Thị C', '8A', 'Trần Văn D', '0912345678', 'phuhuynh2@gmail.com', '', 'ACTIVE'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);

  for (let r = 1; r < 500; r++) {
    const cellRef = XLSX.utils.encode_cell({ r: r, c: 3 }); 
    if (!ws[cellRef]) {
      ws[cellRef] = { t: 's', v: '' };
    }
    ws[cellRef].z = '@'; 
  }

  ws['!cols'] = [
    { wch: 24 }, { wch: 16 }, { wch: 22 }, { wch: 32 }, { wch: 28 }, { wch: 24 }, { wch: 14 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'HocSinh');
  XLSX.writeFile(wb, 'mau_import_hoc_sinh.xlsx');
}

export default function Classes() {
  const { user } = useAuth();
  const toast = useToast();
  const rosterFileInputRef = useRef<HTMLInputElement | null>(null);
  const isAdmin = user?.role === Role.ADMIN;

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<AppUser[]>([]);
  
  const [classTeacherMap, setClassTeacherMap] = useState<Record<string, AppUser[]>>({});
  const [classStudentCountMap, setClassStudentCountMap] = useState<Record<string, number>>({});
  
  const [loading, setLoading] = useState(true);
  const [exportingTeachers, setExportingTeachers] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ClassItem | null>(null);
  const [form, setForm] = useState<ClassForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState<ClassItem | null>(null);
  const [detailTab, setDetailTab] = useState<'roster' | 'teachers'>('roster');
  const [roster, setRoster] = useState<Student[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [selectedRosterIds, setSelectedRosterIds] = useState<Set<string>>(new Set());
  const [importingRoster, setImportingRoster] = useState(false);
  const [assignedTeachers, setAssignedTeachers] = useState<AppUser[]>([]);

  const [enrollStudentId, setEnrollStudentId] = useState('');
  const [enrollSearchTerm, setEnrollSearchTerm] = useState('');
  const [isEnrollDropdownOpen, setIsEnrollDropdownOpen] = useState(false);
  
  const [enrolling, setEnrolling] = useState(false);
  const [assignTeacherId, setAssignTeacherId] = useState('');
  const [assigning, setAssigning] = useState(false);
  
  const [q, setQ] = useState('');
  const [sortBy, setSortBy] = useState('NAME_ASC');

  // STATE: Modal Yêu cầu sửa của GV
  const [requestModal, setRequestModal] = useState({ open: false, studentId: '', studentName: '', message: '' });
  const [sendingRequest, setSendingRequest] = useState(false);

  // STATE: Modal Tạo học sinh trực tiếp vào lớp
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [studentForm, setStudentForm] = useState<StudentFormState>({
    fullName: '',
    studentClass: '',
    parentName: '',
    parentPhone: '',
    parentEmail: '',
    note: '',
    status: 'ACTIVE',
  });
  const [savingStudent, setSavingStudent] = useState(false);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    if (!user) return;
    try {
      const [cls, stu, allUsers] = await Promise.all([
        getClasses(user),
        getStudents(),
        isAdmin ? getAllUsers() : Promise.resolve([]),
      ]);
      setClasses(cls);
      setStudents(stu);
      
      setTeachers(
        allUsers.filter((u) => (u.role === Role.TEACHER || u.role === Role.TA || u.role === Role.ADMIN) && u.isApproved)
      );

      const tMap: Record<string, AppUser[]> = {};
      const sMap: Record<string, number> = {};

      await Promise.all(
        cls.map(async (c) => {
          try {
            const [tList, rList] = await Promise.all([getClassTeachers(c.id), getClassRoster(c.id)]);
            tMap[c.id] = tList;
            sMap[c.id] = rList.length;
          } catch (err) {
            console.error(`Lỗi tải dữ liệu lớp ${c.className}`, err);
          }
        })
      );
      setClassTeacherMap(tMap);
      setClassStudentCountMap(sMap);

    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi tải', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function exportTeacherSchedule() {
    setExportingTeachers(true);
    try {
      const currentWeek = getCurrentWeek();
      const scheduleSnap = await getDoc(doc(db, 'timetables', currentWeek));
      const scheduleData = scheduleSnap.exists() ? scheduleSnap.data().data : {};

      const classScheduleMap: Record<string, string[]> = {};
      const dayNames: Record<string, string> = {
        '2': 'Thứ 2', '3': 'Thứ 3', '4': 'Thứ 4', '5': 'Thứ 5', '6': 'Thứ 6', '7': 'Thứ 7', '8': 'Chủ Nhật'
      };

      Object.keys(scheduleData).forEach(key => {
        const [day, shift] = key.split('-');
        const dayName = dayNames[day] || `Ngày ${day}`;
        const timeStr = `${dayName} (Ca ${shift})`;

        const classesInShift = scheduleData[key] || [];
        classesInShift.forEach((c: any) => {
          if (!classScheduleMap[c.classId]) classScheduleMap[c.classId] = [];
          classScheduleMap[c.classId].push(timeStr);
        });
      });

      const teacherClasses: Record<string, ClassItem[]> = {};
      teachers.forEach(t => teacherClasses[t.id] = []);

      classes.forEach(c => {
        const assigned = classTeacherMap[c.id] || [];
        assigned.forEach(t => {
          if (teacherClasses[t.id]) teacherClasses[t.id].push(c);
        });
      });

      const excelData: any[][] = [
        ['TRUNG TÂM GIÁO DỤC CHẤT LƯỢNG CAO N&C'],
        ['BẢNG TỔNG HỢP PHÂN CÔNG GIÁO VIÊN & LỊCH DẠY'],
        [`Dữ liệu kết xuất ngày: ${fmtDate(todayStr())}`],
        [],
        ['STT', 'Họ và tên GV/TG', 'Vai trò', 'Liên hệ', 'Tổng số lớp', 'Các lớp phụ trách', 'Khối / Môn', 'Thời điểm học (Lịch TKB)']
      ];

      let stt = 1;
      teachers.forEach(t => {
        const myClasses = teacherClasses[t.id] || [];
        const roleName = t.role === Role.TEACHER ? 'Giáo viên' : t.role === Role.TA ? 'Trợ giảng' : 'Quản trị';
        const contact = t.email || '—';

        if (myClasses.length === 0) {
          excelData.push([stt++, t.name, roleName, contact, 0, 'Chưa xếp lớp', '—', '—']);
        } else {
          myClasses.forEach((c, idx) => {
            const scheduleList = classScheduleMap[c.id] || [];
            const scheduleStr = scheduleList.length > 0 ? scheduleList.join(', ') : 'Chưa gắn lịch TKB';
            
            if (idx === 0) {
              excelData.push([stt++, t.name, roleName, contact, myClasses.length, c.className, `${c.grade ? 'K'+c.grade : ''} ${c.subject}`, scheduleStr]);
            } else {
              excelData.push(['', '', '', '', '', c.className, `${c.grade ? 'K'+c.grade : ''} ${c.subject}`, scheduleStr]);
            }
          });
        }
      });

      const ws = XLSX.utils.aoa_to_sheet(excelData);
      ws['!cols'] = [{ wch: 6 }, { wch: 26 }, { wch: 16 }, { wch: 30 }, { wch: 12 }, { wch: 22 }, { wch: 18 }, { wch: 45 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'TongHop_GV');
      XLSX.writeFile(wb, `Tong_Hop_Lich_Day_GV_${todayStr()}.xlsx`);
      toast('Đã xuất Thống kê Giáo viên thành công!', 'success');
    } catch (error) {
      toast('Có lỗi xảy ra khi xuất báo cáo', 'error');
    } finally {
      setExportingTeachers(false);
    }
  }

  async function openDetail(cls: ClassItem) {
    setDetail(cls);
    setDetailTab('roster');
    setSelectedRosterIds(new Set());
    setEnrollSearchTerm('');
    setEnrollStudentId('');
    setRosterLoading(true);
    try {
      const r = await getClassRoster(cls.id);
      const sortedRoster = [...r].sort((a, b) => {
        const nameA = getFirstName(a.fullName);
        const nameB = getFirstName(b.fullName);
        const cmp = nameA.localeCompare(nameB, 'vi', { sensitivity: 'base' });
        if (cmp !== 0) return cmp;
        return a.fullName.localeCompare(b.fullName, 'vi', { sensitivity: 'base' });
      });
      setRoster(sortedRoster);
      if (isAdmin) setAssignedTeachers(await getClassTeachers(cls.id));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi', 'error');
    } finally {
      setRosterLoading(false);
    }
  }

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(cls: ClassItem, e: MouseEvent) {
    e.stopPropagation();
    setEditing(cls);
    setForm({
      className: cls.className,
      subject: cls.subject,
      grade: cls.grade,
      feePerSession: String(cls.feePerSession),
      startDate: cls.startDate,
      status: cls.status,
    });
    setShowForm(true);
  }

  async function saveClass() {
    if (!form.className.trim()) return toast('Vui lòng nhập tên lớp', 'warning');
    setSaving(true);
    try {
      const payload = {
        className: form.className,
        subject: form.subject,
        grade: form.grade,
        feePerSession: Number(form.feePerSession) || 0,
        startDate: form.startDate,
        status: form.status,
      };
      if (editing) {
        await updateClass(editing.id, payload);
        toast('Đã cập nhật lớp học');
      } else {
        await addClass(payload);
        toast('Đã tạo lớp học mới');
      }
      setShowForm(false);
      loadAll();
    } catch (e) {
      toast('Lỗi lưu', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function doEnroll() {
    if (!enrollStudentId || !detail) return toast('Vui lòng tìm và chọn đúng học sinh cần thêm', 'warning');
    setEnrolling(true);
    try {
      await enrollStudent(enrollStudentId, detail.id);
      toast('Đã thêm học sinh vào lớp');
      setEnrollStudentId('');
      setEnrollSearchTerm('');
      
      const r = await getClassRoster(detail.id);
      setRoster(r.sort((a, b) => getFirstName(a.fullName).localeCompare(getFirstName(b.fullName), 'vi', { sensitivity: 'base' })));
      setClassStudentCountMap(prev => ({ ...prev, [detail.id]: r.length }));
    } catch (e) {
      toast('Lỗi', 'error');
    } finally {
      setEnrolling(false);
    }
  }

  // HÀM TẠO VÀ THÊM HỌC SINH MỚI
  const handleCreateAndEnrollStudent = async () => {
    if (!studentForm.fullName.trim() || !studentForm.parentPhone.trim() || !studentForm.studentClass.trim()) {
      return toast('Vui lòng nhập đầy đủ Họ tên, Lớp hành chính và SĐT phụ huynh (*)', 'warning');
    }
    if (!detail) return;
    
    setSavingStudent(true);
    try {
      // 1. Tạo học sinh mới
      const ref = await addStudent(studentForm);
      
      // 2. Thêm vào lớp hiện tại
      await enrollStudent(ref.id, detail.id);
      
      toast('Đã tạo hồ sơ và xếp học sinh vào lớp thành công!', 'success');
      
      // 3. Cập nhật lại danh sách
      const [newRoster, allStudents] = await Promise.all([
        getClassRoster(detail.id),
        getStudents(),
      ]);
      
      setRoster(newRoster.sort((a, b) => getFirstName(a.fullName).localeCompare(getFirstName(b.fullName), 'vi', { sensitivity: 'base' })));
      setClassStudentCountMap(prev => ({ ...prev, [detail.id]: newRoster.length }));
      setStudents(allStudents); // Cập nhật danh sách tổng để bộ tìm kiếm hoạt động
      
      // 4. Đóng form và reset
      setShowAddStudentModal(false);
      setStudentForm({
        fullName: '',
        studentClass: '',
        parentName: '',
        parentPhone: '',
        parentEmail: '',
        note: '',
        status: 'ACTIVE',
      });
    } catch (e) {
      toast('Lỗi tạo học sinh', 'error');
    } finally {
      setSavingStudent(false);
    }
  };

  async function doRemoveStudent(studentId: string) {
    if (!detail || !window.confirm('Xóa học sinh khỏi lớp? Học sinh vẫn còn trong danh sách chung.')) return;
    try {
      await removeEnrollment(studentId, detail.id);
      toast('Đã xóa học sinh khỏi lớp');
      setRoster((r) => {
        const nextRoster = r.filter((s) => s.id !== studentId);
        setClassStudentCountMap(prev => ({ ...prev, [detail.id]: nextRoster.length }));
        return nextRoster;
      });
      setSelectedRosterIds((prev) => {
        const next = new Set(prev);
        next.delete(studentId);
        return next;
      });
    } catch (e) {
      toast('Lỗi', 'error');
    }
  }

  async function doRemoveSelectedStudentsFromClass() {
    if (!detail) return;
    const ids = [...selectedRosterIds];
    if (ids.length === 0) return toast('Chưa chọn học sinh nào', 'warning');

    if (!window.confirm(`Xóa ${ids.length} học sinh đã chọn khỏi lớp "${detail.className}"?`)) return;

    try {
      await removeEnrollments(ids, detail.id);
      toast(`Đã xóa ${ids.length} học sinh khỏi lớp`);
      setRoster((r) => {
        const nextRoster = r.filter((s) => !selectedRosterIds.has(s.id));
        setClassStudentCountMap(prev => ({ ...prev, [detail.id]: nextRoster.length }));
        return nextRoster;
      });
      setSelectedRosterIds(new Set());
    } catch (e) {
      toast('Lỗi xóa nhiều học sinh', 'error');
    }
  }

  async function doImportStudentsToClass(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !detail) return;

    setImportingRoster(true);
    try {
      const allRows = await parseStudentExcel(file);
      if (allRows.length === 0) return toast('File Excel không có dữ liệu', 'warning');

      const invalidRows = allRows.filter(r => !r.fullName.trim() || !r.studentClass.trim() || r.parentPhone.length !== 10);
      if (invalidRows.length > 0) {
        toast(`LỖI: Phát hiện ${invalidRows.length} học sinh sai thông tin. Vui lòng sửa file Excel!`, 'error');
        return; 
      }

      const result = await importStudents(allRows, detail.id);
      const [newRoster, allStudents] = await Promise.all([getClassRoster(detail.id), getStudents()]);

      setRoster(newRoster.sort((a, b) => getFirstName(a.fullName).localeCompare(getFirstName(b.fullName), 'vi', { sensitivity: 'base' })));
      setClassStudentCountMap(prev => ({ ...prev, [detail.id]: newRoster.length }));
      setStudents(allStudents);

      toast(`Import xong: tạo ${result.created}, có sẵn ${result.existed}, xếp lớp ${result.enrolled}`, result.errors.length ? 'warning' : 'success');
    } catch (err) {
      toast('Lỗi import Excel', 'error');
    } finally {
      setImportingRoster(false);
    }
  }

  const exportRosterWord = () => {
    if (!detail || roster.length === 0) return toast('Lớp chưa có học sinh để xuất báo cáo!', 'warning');

    const currentClassName = detail.className;
    const today = new Date();
    const d = today.getDate(); const m = today.getMonth() + 1; const y = today.getFullYear();

    let tableRows = '';
    roster.forEach((s, idx) => {
      tableRows += `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td><strong>${s.fullName}</strong></td>
          <td style="text-align: center; mso-number-format:'\@';">${s.parentPhone || '—'}</td>
          <td>${s.note || ''}</td>
        </tr>
      `;
    });

    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Danh sách học sinh lớp</title>
      <style>
        @page WordSection1 { size: 595.3pt 841.9pt; margin: 1.0in 1.0in 1.0in 1.0in; }
        div.WordSection1 { page: WordSection1; }
        body { font-family: 'Times New Roman', Times, serif; font-size: 13pt; line-height: 1.5; color: #000; }
        .header-center { text-align: center; font-weight: bold; text-transform: uppercase; font-size: 14pt; margin-bottom: 5px; }
        .sub-header { text-align: center; font-style: italic; font-size: 12pt; margin-bottom: 20px; }
        table.data-table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 20px; }
        table.data-table th, table.data-table td { border: 1px solid #000; padding: 6px 8px; font-size: 12pt; vertical-align: middle; }
        table.data-table th { background-color: #f2f2f2; text-align: center; font-weight: bold; }
        .signature-table { width: 100%; border: none; margin-top: 10px; text-align: center; }
        .signature-table td { border: none; vertical-align: top; }
      </style>
      </head>
      <body>
        <div class="WordSection1">
          <div class="header-center">TRUNG TÂM GIÁO DỤC CHẤT LƯỢNG CAO N&C</div>
          <div class="header-center">DANH SÁCH HỌC SINH - LỚP ${currentClassName.toUpperCase()}</div>
          <div class="sub-header">Tổng số học sinh: ${roster.length}</div>
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 50px;">STT</th>
                <th>Họ và tên</th>
                <th style="width: 140px;">SĐT phụ huynh</th>
                <th style="width: 150px;">Ghi chú</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
          <div style="text-align: right; margin-top: 10px; font-style: italic; margin-right: 50px;">
            Yên Thành, ngày ${String(d).padStart(2, '0')} tháng ${String(m).padStart(2, '0')} năm ${y}
          </div>
          <table class="signature-table">
            <tr>
              <td style="width: 50%;"></td>
              <td style="width: 50%;">
                <strong>Giáo viên chủ nhiệm</strong><br><br><br><br><br>
                <strong>........................................................</strong>
              </td>
            </tr>
          </table>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Danh_Sach_Hoc_Sinh_Lop_${currentClassName.replace(/\s+/g, '_')}.doc`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    toast('Đã xuất file Word danh sách lớp thành công!', 'success');
  };

  async function doAssignTeacher() {
    if (!assignTeacherId || !detail) return toast('Chọn giáo viên/trợ giảng', 'warning');
    setAssigning(true);
    try {
      await assignTeacher(assignTeacherId, detail.id);
      toast('Đã phân công giáo viên');
      setAssignTeacherId('');
      const updatedT = await getClassTeachers(detail.id);
      setAssignedTeachers(updatedT);
      setClassTeacherMap(prev => ({ ...prev, [detail.id]: updatedT }));
    } catch (e) {
      toast('Lỗi', 'error');
    } finally {
      setAssigning(false);
    }
  }

  async function doRemoveTeacher(teacherId: string) {
    if (!detail || !window.confirm('Hủy phân công giáo viên?')) return;
    try {
      await removeTeacherFromClass(teacherId, detail.id);
      toast('Đã hủy phân công');
      const updatedT = assignedTeachers.filter((x) => x.id !== teacherId);
      setAssignedTeachers(updatedT);
      setClassTeacherMap(prev => ({ ...prev, [detail.id]: updatedT }));
    } catch (e) {
      toast('Lỗi', 'error');
    }
  }

  const submitEditRequest = async () => {
    if (!requestModal.message.trim()) return toast('Vui lòng nhập nội dung cần sửa', 'warning');
    setSendingRequest(true);
    try {
      if (!user) return;
      await addDoc(collection(db, 'editRequests'), {
        studentId: requestModal.studentId,
        studentName: requestModal.studentName,
        teacherId: user.id,
        teacherName: user.name,
        message: requestModal.message,
        status: 'PENDING',
        createdAt: new Date().toISOString()
      });
      toast('Đã gửi yêu cầu sửa cho Quản lý thành công!', 'success');
      setRequestModal({ open: false, studentId: '', studentName: '', message: '' });
    } catch(e) {
      toast('Lỗi khi gửi yêu cầu', 'error');
    } finally {
      setSendingRequest(false);
    }
  };

  const normalizedSearchClass = removeAccents(q).trim().replace(/\s+/g, '');
  
  let filtered = classes.filter((c) => {
    if (!normalizedSearchClass) return true;
    const cNameNoSpace = removeAccents(c.className || '').replace(/\s+/g, '');
    const cSubNoSpace = removeAccents(c.subject || '').replace(/\s+/g, '');
    return cNameNoSpace.includes(normalizedSearchClass) || cSubNoSpace.includes(normalizedSearchClass);
  });

  filtered.sort((a, b) => {
    if (normalizedSearchClass) {
      const aName = removeAccents(a.className || '').replace(/\s+/g, '');
      const bName = removeAccents(b.className || '').replace(/\s+/g, '');
      if (aName.startsWith(normalizedSearchClass) && !bName.startsWith(normalizedSearchClass)) return -1;
      if (!aName.startsWith(normalizedSearchClass) && bName.startsWith(normalizedSearchClass)) return 1;
    }

    if (sortBy === 'GRADE_ASC') {
      const gradeA = parseInt(a.grade) || 999;
      const gradeB = parseInt(b.grade) || 999;
      if (gradeA !== gradeB) return gradeA - gradeB;
    } else if (sortBy === 'SUBJECT_ASC') {
      const cmp = (a.subject || '').localeCompare(b.subject || '', 'vi', { sensitivity: 'base' });
      if (cmp !== 0) return cmp;
    } else if (sortBy === 'TEACHER_ASC') {
      const tA = classTeacherMap[a.id]?.[0]?.name || 'zzzz';
      const tB = classTeacherMap[b.id]?.[0]?.name || 'zzzz';
      const cmp = tA.localeCompare(tB, 'vi', { sensitivity: 'base' });
      if (cmp !== 0) return cmp;
    }

    return (a.className || '').localeCompare(b.className || '', 'vi', { sensitivity: 'base' });
  });

  const unenrolled = students.filter((s) => !roster.find((r) => r.id === s.id));
  
  const filteredUnenrolled = useMemo(() => {
    if (!enrollSearchTerm.trim()) return unenrolled;
    const searchTerms = removeAccents(enrollSearchTerm).split(/\s+/).filter(Boolean);
    const exactSearchString = removeAccents(enrollSearchTerm).replace(/\s+/g, '');

    return unenrolled.filter(s => {
      const targetNameNoSpace = removeAccents(s.fullName).replace(/\s+/g, '');
      if (targetNameNoSpace.includes(exactSearchString) || (s.parentPhone || '').includes(exactSearchString)) return true;
      return searchTerms.every(word => targetNameNoSpace.includes(word));
    });
  }, [unenrolled, enrollSearchTerm]);

  const unassigned = teachers.filter((t) => !assignedTeachers.find((a) => a.id === t.id));

  const allRosterSelected = roster.length > 0 && roster.every((s) => selectedRosterIds.has(s.id));

  const toggleRosterOne = (studentId: string) => {
    setSelectedRosterIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId); else next.add(studentId);
      return next;
    });
  };

  const toggleAllRoster = () => {
    setSelectedRosterIds((prev) => {
      const next = new Set(prev);
      if (allRosterSelected) roster.forEach((s) => next.delete(s.id)); else roster.forEach((s) => next.add(s.id));
      return next;
    });
  };

  if (loading)
    return <div className="loading-state"><div className="spinner" /><span>Đang tải...</span></div>;

  return (
    <div className="fade-up">
      <div className="page-header">
        <div>
          <h1 className="page-title"><School size={26} /> <span>Lớp học</span></h1>
          <p className="page-sub">{isAdmin ? `Quản lý ${classes.length} lớp học` : `${classes.length} lớp được phân công`}</p>
        </div>
      </div>

      <div className="filter-bar" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <input className="search-box" style={{ flex: 1, minWidth: '200px' }} placeholder="Tìm lớp học..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="form-select" style={{ width: 'auto', minWidth: '180px' }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="NAME_ASC">Sắp xếp: Tên lớp (A-Z)</option>
          <option value="GRADE_ASC">Sắp xếp: Theo khối lớp</option>
          <option value="SUBJECT_ASC">Sắp xếp: Theo môn học</option>
          <option value="TEACHER_ASC">Sắp xếp: Theo Giáo viên</option>
        </select>

        {isAdmin && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={exportTeacherSchedule} disabled={exportingTeachers} style={{ display: 'flex', gap: '6px', alignItems: 'center', background: '#e0f2fe', color: '#0369a1', borderColor: '#bae6fd' }}>
              <FileDown size={16} /> {exportingTeachers ? 'Đang xuất...' : 'Tổng hợp lịch GV'}
            </button>
            <button className="btn btn-primary" onClick={openAdd} style={{ whiteSpace: 'nowrap' }}>+ Tạo lớp mới</button>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <div className="empty-icon"><School size={40} /></div>
              <h3>Chưa có lớp học nào</h3>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {filtered.map((cls) => {
            const assignedT = classTeacherMap[cls.id] || [];
            const studentCount = classStudentCountMap[cls.id] || 0;
            
            return (
              <div key={cls.id} className="card" style={{ cursor: 'pointer' }} onClick={() => openDetail(cls)}>
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{cls.className}</span>
                  <span className="badge" style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.25)', color: '#fff' }}>
                    {cls.status === 'ACTIVE' ? 'Đang học' : 'Dừng'}
                  </span>
                </div>
                <div className="card-body" style={{ fontSize: '0.875rem' }}>
                  <div style={{ marginBottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {cls.subject && <span className="badge badge-info">{cls.subject}</span>}
                    {cls.grade && <span className="badge badge-warning">Khối {cls.grade}</span>}
                  </div>

                  <div style={{ color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <GraduationCap size={15} style={{ marginTop: 2, flexShrink: 0 }} /> 
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
                      {assignedT.length === 0 ? (
                        <span style={{ fontSize: '0.8rem', color: '#ef4444', fontStyle: 'italic', fontWeight: 500 }}>Chưa có GV</span>
                      ) : (
                        assignedT.map(t => (
                          <span key={t.id} className={`badge ${t.role === Role.TEACHER || t.role === Role.ADMIN ? 'badge-teacher' : 'badge-warning'}`} style={{ fontSize: '0.7rem', padding: '2px 6px', fontWeight: 500 }}>
                            {t.role === Role.TEACHER || t.role === Role.ADMIN ? 'GV:' : 'TG:'} {t.name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  <div style={{ color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Calendar size={14} /> {cls.startDate ? fmtDate(cls.startDate) : 'Chưa rõ ngày'}
                  </div>

                  <div style={{ color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Users size={14} /> 
                    {studentCount === 0 ? <span style={{ color: '#ef4444', fontStyle: 'italic', fontWeight: 500 }}>Chưa có HS</span> : <span>{studentCount} học sinh</span>}
                  </div>

                  <div style={{ color: 'var(--primary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Wallet size={14} /> {fmtCurrency(cls.feePerSession)}/buổi
                  </div>
                  {isAdmin && (
                    <div style={{ marginTop: 10 }}>
                      <button className="btn btn-secondary btn-sm" onClick={(e) => openEdit(cls, e)}><Pencil size={14} /> Sửa</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Sửa lớp học' : 'Tạo lớp mới'} footer={<><button className="btn btn-ghost" onClick={() => setShowForm(false)}>Hủy</button><button className="btn btn-primary" onClick={saveClass} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</button></>}>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Tên lớp *</label><input className="form-control" value={form.className} onChange={(e) => setForm((f) => ({ ...f, className: e.target.value }))} placeholder="VD: Toán 8A" /></div>
          <div className="form-group"><label className="form-label">Môn học</label><input className="form-control" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="VD: Toán, Văn, Anh..." /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Khối lớp</label><input className="form-control" value={form.grade} onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))} placeholder="VD: 8" /></div>
          <div className="form-group"><label className="form-label">Học phí / buổi (VND)</label><input className="form-control" type="number" value={form.feePerSession} onChange={(e) => setForm((f) => ({ ...f, feePerSession: e.target.value }))} placeholder="0" /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Ngày bắt đầu</label><input className="form-control" type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} /></div>
          {editing && (
            <div className="form-group"><label className="form-label">Trạng thái</label><select className="form-select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Status }))}><option value="ACTIVE">Đang học</option><option value="INACTIVE">Dừng</option></select></div>
          )}
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.className || ''} size="modal-lg">
        {detail && (
          <>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16, padding: '10px 14px', background: 'var(--bg-light)', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem' }}>
              {detail.subject && <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}><BookOpen size={14} /> {detail.subject}</span>}
              {detail.grade && <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}><Tag size={14} /> Khối {detail.grade}</span>}
              <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}><Wallet size={14} /> {fmtCurrency(detail.feePerSession)}/buổi</span>
              {detail.startDate && <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}><Calendar size={14} /> {fmtDate(detail.startDate)}</span>}
            </div>

            <div className="tabs">
              <button className={`tab ${detailTab === 'roster' ? 'active' : ''}`} onClick={() => setDetailTab('roster')}>Danh sách ({roster.length})</button>
              {isAdmin && <button className={`tab ${detailTab === 'teachers' ? 'active' : ''}`} onClick={() => setDetailTab('teachers')}>Giáo viên ({assignedTeachers.length})</button>}
            </div>

            {rosterLoading ? (
              <div className="loading-state"><div className="spinner" /><span>Đang tải...</span></div>
            ) : detailTab === 'roster' ? (
              <>
                {/* MỞ QUYỀN THÊM VÀ TẠO MỚI CHO CẢ ADMIN VÀ GIÁO VIÊN */}
                {(isAdmin || user?.role === Role.TEACHER) && (
                  <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
                        <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                        <input
                          className="form-control" style={{ paddingLeft: 32 }} placeholder="Tìm học sinh chung (không dấu) để thêm vào lớp..."
                          value={enrollSearchTerm} onChange={(e) => { setEnrollSearchTerm(e.target.value); setEnrollStudentId(''); setIsEnrollDropdownOpen(true); }}
                          onFocus={() => setIsEnrollDropdownOpen(true)} onBlur={() => setTimeout(() => setIsEnrollDropdownOpen(false), 200)}
                        />
                        {isEnrollDropdownOpen && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d1d5db', borderTop: 'none', borderRadius: '0 0 6px 6px', maxHeight: 200, overflowY: 'auto', zIndex: 9999, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                            {filteredUnenrolled.length > 0 ? (
                              filteredUnenrolled.map(s => (
                                <div key={s.id} onMouseDown={(e) => { e.preventDefault(); setEnrollStudentId(s.id); setEnrollSearchTerm(`${s.fullName} - ${s.parentPhone || ''}`); setIsEnrollDropdownOpen(false); }} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: '14px' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#fff'}>
                                  <strong>{s.fullName}</strong> {s.studentClass ? `(${s.studentClass})` : ''} <span style={{color: '#0369a1'}}>{s.parentPhone}</span>
                                </div>
                              ))
                            ) : (
                              <div style={{ padding: '8px 12px', color: '#6b7280', fontSize: '14px', textAlign: 'center' }}>Không tìm thấy học sinh hoặc đã có trong lớp</div>
                            )}
                          </div>
                        )}
                      </div>

                      <button className="btn btn-primary btn-sm" onClick={doEnroll} disabled={enrolling}>{enrolling ? '...' : '+ Thêm'}</button>
                      
                      {/* NÚT TẠO HỌC SINH MỚI TRỰC TIẾP */}
                      <button 
                        className="btn btn-primary btn-sm" 
                        style={{ background: '#0ea5e9', borderColor: '#0ea5e9', display: 'flex', alignItems: 'center', gap: 4 }} 
                        onClick={() => setShowAddStudentModal(true)}
                      >
                        <UserPlus size={14} /> Tạo HS mới
                      </button>

                      <button className="btn btn-secondary btn-sm" onClick={downloadStudentTemplate}><FileDown size={14} /> File mẫu</button>
                      <input ref={rosterFileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={doImportStudentsToClass} />
                      <button className="btn btn-primary btn-sm" onClick={() => rosterFileInputRef.current?.click()} disabled={importingRoster}><Upload size={14} /> {importingRoster ? 'Đang import...' : 'Import vào lớp'}</button>
                      
                      <button className="btn btn-secondary btn-sm" onClick={exportRosterWord} style={{ background: '#059669', color: '#fff', borderColor: '#059669', display: 'flex', alignItems: 'center', gap: 4 }}><FileText size={14} /> Xuất DS Word</button>
                    </div>

                    {selectedRosterIds.size > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, padding: '8px 10px', background: 'rgba(239,68,68,0.08)', borderRadius: 'var(--radius-sm)', flexWrap: 'wrap' }}>
                        <strong>Đã chọn {selectedRosterIds.size} học sinh trong lớp</strong>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setSelectedRosterIds(new Set())}>Bỏ chọn</button>
                          <button className="btn btn-danger btn-sm" onClick={doRemoveSelectedStudentsFromClass}><Trash2 size={14} /> Xóa khỏi lớp</button>
                        </div>
                      </div>
                    )}
                  </>
                )}
                
                {roster.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon"><Users size={40} /></div>
                    <h3>Chưa có học sinh</h3>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          {(isAdmin || user?.role === Role.TEACHER) && <th style={{ width: 42 }}><input type="checkbox" checked={allRosterSelected} onChange={toggleAllRoster} title="Chọn tất cả học sinh đang lọc" /></th>}
                          <th>Học sinh (A-Z)</th>
                          <th>SĐT phụ huynh</th>
                          <th>Link phụ huynh</th>
                          {(isAdmin || user?.role === Role.TEACHER) && <th>Thao tác</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {roster.map((s) => (
                          <tr key={s.id}>
                            {(isAdmin || user?.role === Role.TEACHER) && <td><input type="checkbox" checked={selectedRosterIds.has(s.id)} onChange={() => toggleRosterOne(s.id)} /></td>}
                            <td><strong>{s.fullName}</strong></td>
                            <td>{s.parentPhone || '—'}</td>
                            <td>
                              <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/parent/${s.id}`); toast('Đã sao chép link phụ huynh'); }}><Copy size={14} /> Copy link</button>
                            </td>
                            {(isAdmin || user?.role === Role.TEACHER) && (
                              <td>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  {/* NÚT YÊU CẦU SỬA HIỂN THỊ CHO GIÁO VIÊN */}
                                  {!isAdmin && (
                                    <button 
                                      className="btn btn-warning btn-sm" 
                                      onClick={() => setRequestModal({ open: true, studentId: s.id, studentName: s.fullName, message: '' })}
                                      style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#fffbeb', color: '#d97706', borderColor: '#fde68a' }}
                                    >
                                      <MessageSquare size={13} /> Yêu cầu sửa
                                    </button>
                                  )}
                                  {/* NÚT XÓA KHỎI LỚP HIỂN THỊ CHO CẢ ADMIN VÀ GIÁO VIÊN */}
                                  <button className="btn btn-danger btn-sm" onClick={() => doRemoveStudent(s.id)}>Xóa khỏi lớp</button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <select className="form-select" style={{ flex: 1 }} value={assignTeacherId} onChange={(e) => setAssignTeacherId(e.target.value)}>
                    <option value="">-- Chọn giáo viên / trợ giảng --</option>
                    {unassigned.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.role === Role.TEACHER ? 'GV' : t.role === Role.ADMIN ? 'QTV' : 'TG'}) - {t.email}</option>)}
                  </select>
                  <button className="btn btn-primary btn-sm" onClick={doAssignTeacher} disabled={assigning}>{assigning ? '...' : '+ Phân công'}</button>
                </div>
                {assignedTeachers.length === 0 ? (
                  <div className="empty-state"><div className="empty-icon"><GraduationCap size={40} /></div><h3>Chưa phân công giáo viên</h3></div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Giáo viên</th><th>Vai trò</th><th>Email</th><th></th></tr></thead>
                      <tbody>
                        {assignedTeachers.map((t) => (
                          <tr key={t.id}>
                            <td><strong>{t.name}</strong></td>
                            <td><span className={`badge ${t.role === Role.TEACHER || t.role === Role.ADMIN ? 'badge-teacher' : 'badge-warning'}`}>{t.role === Role.TEACHER ? 'Giáo viên' : t.role === Role.ADMIN ? 'Quản trị (GV)' : 'Trợ giảng'}</span></td>
                            <td style={{ fontSize: '0.83rem' }}>{t.email}</td>
                            <td><button className="btn btn-danger btn-sm" onClick={() => doRemoveTeacher(t.id)}>Hủy</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </Modal>

      {/* Modal Yêu cầu sửa của GV ngay trong Lớp học */}
      <Modal
        open={requestModal.open}
        onClose={() => setRequestModal({ ...requestModal, open: false })}
        title="Gửi yêu cầu cập nhật thông tin"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setRequestModal({ ...requestModal, open: false })}>Hủy</button>
            <button className="btn btn-primary" onClick={submitEditRequest} disabled={sendingRequest}>
              {sendingRequest ? 'Đang gửi...' : 'Gửi cho Quản lý'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Học sinh cần sửa</label>
          <input className="form-control" value={requestModal.studentName} disabled style={{ background: '#f3f4f6', fontWeight: 'bold' }} />
        </div>
        <div className="form-group">
          <label className="form-label">Nội dung yêu cầu thay đổi <span style={{color: '#ef4444'}}>*</span></label>
          <textarea 
            className="form-control" 
            rows={3} 
            placeholder="Ví dụ: Phụ huynh mới đổi số điện thoại thành 0987.xxx.xxx, thầy/cô cập nhật giúp em nhé." 
            value={requestModal.message} 
            onChange={(e) => setRequestModal({...requestModal, message: e.target.value})}
            autoFocus
          ></textarea>
        </div>
      </Modal>

      {/* Modal Tạo học sinh mới trực tiếp từ Lớp học */}
      <Modal
        open={showAddStudentModal}
        onClose={() => setShowAddStudentModal(false)}
        title="Tạo hồ sơ học sinh mới"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowAddStudentModal(false)}>Hủy</button>
            <button className="btn btn-primary" onClick={handleCreateAndEnrollStudent} disabled={savingStudent}>
              {savingStudent ? 'Đang lưu...' : 'Lưu & Thêm vào lớp'}
            </button>
          </>
        }
      >
        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}>
            <label className="form-label">Họ tên học sinh <span style={{ color: '#ef4444' }}>*</span></label>
            <input className="form-control" value={studentForm.fullName} onChange={(e) => setStudentForm((f) => ({ ...f, fullName: e.target.value }))} placeholder="Nguyễn Văn A" autoFocus />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Lớp hành chính <span style={{ color: '#ef4444' }}>*</span></label>
            <input className="form-control" value={studentForm.studentClass} onChange={(e) => setStudentForm((f) => ({ ...f, studentClass: e.target.value }))} placeholder="12A1" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Tên phụ huynh</label>
            <input className="form-control" value={studentForm.parentName} onChange={(e) => setStudentForm((f) => ({ ...f, parentName: e.target.value }))} placeholder="Nguyễn Văn B" />
          </div>
          <div className="form-group">
            <label className="form-label">SĐT phụ huynh <span style={{ color: '#ef4444' }}>*</span></label>
            <input className="form-control" type="tel" value={studentForm.parentPhone} onChange={(e) => setStudentForm((f) => ({ ...f, parentPhone: e.target.value }))} placeholder="0901..." />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Email phụ huynh</label>
            <input className="form-control" type="email" value={studentForm.parentEmail} onChange={(e) => setStudentForm((f) => ({ ...f, parentEmail: e.target.value }))} placeholder="email@gmail.com" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Ghi chú</label>
          <input className="form-control" value={studentForm.note} onChange={(e) => setStudentForm((f) => ({ ...f, note: e.target.value }))} placeholder="Ghi chú thêm..." />
        </div>
      </Modal>

    </div>
  );
}
