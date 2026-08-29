import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { 
  CheckCircle2, 
  Copy, 
  QrCode, 
  RefreshCcw, 
  Settings, 
  Wallet, 
  XCircle, 
  FileText, 
  Search, 
  BookOpen, 
  Calculator, 
  Download,
  Users,
  Layers,
  Eye,
  Building2,
  DollarSign,
  Percent,
  UserCheck,
  FileSpreadsheet
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { db } from '../config/firebase';
import { collection, getDocs, query, where, updateDoc, doc } from 'firebase/firestore'; 
import {
  fmtCurrency,
  getClasses,
  getStudents,
  updateStudent,
  getClassPaymentConfig,
  getTuitionForMonth,
  getClassRoster,
  getClassTeachers,
  saveClassPaymentConfig,
  setTuitionPaymentStatus,
} from '../services/dataService';
import { ClassItem, ClassPaymentConfig, TuitionData, TuitionStudentRow, Role, Student, AppUser } from '../types';
import { getAllUsers } from '../services/authService';
import {
  buildTransferNote,
  buildVietQrUrl,
  getEffectivePaymentConfig,
  getGlobalPaymentConfig,
  isPaymentConfigReady,
} from '../utils/payment';

type PreviewState = {
  row: TuitionStudentRow;
  qrUrl: string;
  transferNote: string;
} | null;

interface PayrollRow {
  classId: string;
  className: string;
  teacherName: string;
  teachers: AppUser[];
  studentCount: number;
  totalSessions: number;
  totalRevenue: number;
  roomFee: number;
  taxAmount: number;
  otherDeductions: number;
  netSalary: number;
}

interface TeacherIncomeSummary {
  teacherId: string;
  teacherName: string;
  email?: string;
  role?: string;
  classList: {
    classId: string;
    className: string;
    studentCount: number;
    totalSessions: number;
    totalRevenue: number;
    roomFee: number;
    taxAmount: number;
    otherDeductions: number;
    netSalary: number;
  }[];
  totalClasses: number;
  totalSessions: number;
  totalStudents: number;
  totalRevenue: number;
  totalRoomFee: number;
  totalTaxAmount: number;
  totalOtherDeductions: number;
  totalNetIncome: number;
}

const EMPTY_CLASS_CONFIG: ClassPaymentConfig = {
  classId: '',
  mode: 'GLOBAL',
  bankId: '',
  bankAccount: '',
  bankAccountName: '',
  qrTemplate: 'compact2',
  notePattern: '{CLASS}_{STUDENT}_HP {MONTH}',
  isEnabled: true,
};

function getFirstName(fullName: string) {
  if (!fullName) return '';
  const parts = fullName.trim().split(' ');
  return parts[parts.length - 1];
}

function formatDate(dateString: string) {
  if (!dateString) return '';
  const [y, m, d] = dateString.split('-');
  return `${d}/${m}/${y}`;
}

function extractPhone(obj: any): string {
  if (!obj) return '';
  const possibleFields = ['parentPhone', 'phone', 'phoneNumber', 'soDienThoai', 'sdt', 'dienThoai'];
  for (const field of possibleFields) {
    if (obj[field]) return String(obj[field]);
  }
  return '';
}

export default function Tuition() {
  const { user } = useAuth();
  const toast = useToast();
  
  const isAdmin = user?.role === Role.ADMIN;

  const [tabMode, setTabMode] = useState<'REPORT' | 'TREASURER' | 'PAYROLL'>('REPORT');

  useEffect(() => {
    if (isAdmin) setTabMode('TREASURER');
    else setTabMode('REPORT');
  }, [isAdmin]);

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]); 
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [classTeacherMap, setClassTeacherMap] = useState<Record<string, string>>({});

  const [selectedClass, setSelectedClass] = useState('');
  
  const [batchName, setBatchName] = useState('Đợt 1');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(); return d.toISOString().slice(0, 10);
  });
  const [searchTerm, setSearchTerm] = useState('');

  const [classSearchTerm, setClassSearchTerm] = useState('');
  const [isClassDropdownOpen, setIsClassDropdownOpen] = useState(false);

  const [tuition, setTuition] = useState<TuitionData | null>(null);
  const [configDraft, setConfigDraft] = useState<ClassPaymentConfig>(EMPTY_CLASS_CONFIG);
  const [loading, setLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingStudent, setSavingStudent] = useState('');
  const [preview, setPreview] = useState<PreviewState>(null);

  const [payrollData, setPayrollData] = useState<PayrollRow[]>([]);
  const [payrollDetails, setPayrollDetails] = useState<Record<string, any[]>>({});
  const [calculatingPayroll, setCalculatingPayroll] = useState(false);
  const [payrollSubView, setPayrollSubView] = useState<'BY_TEACHER' | 'BY_CLASS'>('BY_TEACHER');
  const [selectedTeacherForModal, setSelectedTeacherForModal] = useState<TeacherIncomeSummary | null>(null);
  const [classTeachersListMap, setClassTeachersListMap] = useState<Record<string, AppUser[]>>({});

  useEffect(() => {
    if (!user) return;
    loadAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadAllData() {
    if (!user) return;
    try {
      const [cls, stu, users] = await Promise.all([
        getClasses(user), 
        getStudents(),
        isAdmin ? getAllUsers() : Promise.resolve([])
      ]);
      setClasses(cls);
      setAllStudents(stu);
      
      const validUsers = (users || []).filter(u => u !== null) as AppUser[];
      setAllUsers(validUsers);

      if (isAdmin) {
        const tMap: Record<string, string> = {};
        const tObjMap: Record<string, AppUser[]> = {};
        await Promise.all(cls.map(async (c) => {
          try {
            const tList = await getClassTeachers(c.id);
            tObjMap[c.id] = tList;
            if (tList.length > 0) tMap[c.id] = tList.map(t => t.name).join(', ');
            else tMap[c.id] = 'Chưa có GV';
          } catch (e) {
            tObjMap[c.id] = [];
            tMap[c.id] = 'Chưa có GV';
          }
        }));
        setClassTeacherMap(tMap);
        setClassTeachersListMap(tObjMap);
      }
    } catch (e) {
      toast('Lỗi tải dữ liệu cơ sở', 'error');
    }
  }

  useEffect(() => {
    if (tabMode === 'PAYROLL') return; 
    if (!selectedClass) {
      setTuition(null);
      return;
    }
    loadTuition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass, startDate, endDate, tabMode]); 

  async function loadTuition() {
    if (!selectedClass) return;
    if (tabMode === 'TREASURER' && !batchName.trim()) {
      toast('Vui lòng điền Tên đợt thu!', 'warning');
      return;
    }
    setLoading(true);
    try {
      let baseTuition: any = { classInfo: classes.find(c => c.id === selectedClass), students: [] };
      const studentMap = new Map();

      if (tabMode === 'TREASURER') {
        const tRes = await getTuitionForMonth(selectedClass, batchName);
        if (tRes) {
          baseTuition = { ...tRes };
          tRes.students.forEach(s => studentMap.set(s.studentId, { ...s }));
        } else {
          const roster = await getClassRoster(selectedClass);
          roster.forEach(s => studentMap.set(s.id, { studentId: s.id, fullName: s.fullName, tuition: 0, paymentStatus: 'UNPAID' }));
        }
      } 
      else {
        const roster = await getClassRoster(selectedClass);
        roster.forEach(s => studentMap.set(s.id, { studentId: s.id, fullName: s.fullName, tuition: 0, paymentStatus: 'UNPAID' }));
      }

      const attSnap = await getDocs(query(collection(db, 'attendance'), where('classId', '==', selectedClass)));
      const validDates = new Set<string>(); 
      const studentAttendedDates = new Map<string, Set<string>>(); 

      attSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.date >= startDate && data.date <= endDate && data.present === true) {
          validDates.add(data.date); 
          if (data.studentId) {
            if (!studentAttendedDates.has(data.studentId)) studentAttendedDates.set(data.studentId, new Set());
            studentAttendedDates.get(data.studentId)!.add(data.date);
          }
        }
      });

      const totalSessions = validDates.size; 
      const feePerSession = baseTuition.classInfo?.feePerSession || 0;

      baseTuition.students = Array.from(studentMap.values()).map(student => {
        const attendedSet = studentAttendedDates.get(student.studentId);
        const actualAttended = attendedSet ? attendedSet.size : 0; 
        
        const stuGlobal = allStudents.find(s => s.id === student.studentId);
        const discount = (stuGlobal as any)?.discount || 0;
        const note = stuGlobal?.note || '';

        const rawTuition = actualAttended * feePerSession;
        const finalTuition = rawTuition * (1 - discount / 100);

        return {
          ...student,
          sessionsAttended: actualAttended,
          sessionsTotal: totalSessions,
          tuition: finalTuition,
          discount,
          note
        };
      });

      setTuition(baseTuition);
      const cfg = await getClassPaymentConfig(selectedClass);
      setConfigDraft(cfg || { ...EMPTY_CLASS_CONFIG, classId: selectedClass });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi tải học phí', 'error');
    } finally {
      setLoading(false);
    }
  }

  const generatePayrollReport = async () => {
    setCalculatingPayroll(true);
    try {
      const attSnap = await getDocs(
        query(collection(db, 'attendance'), where('date', '>=', startDate), where('date', '<=', endDate))
      );
      
      const classValidDates = new Map<string, Set<string>>();
      const classStudentAttended = new Map<string, Map<string, number>>(); 

      attSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.present === true) {
          if (!classValidDates.has(data.classId)) classValidDates.set(data.classId, new Set());
          classValidDates.get(data.classId)!.add(data.date);

          if (!classStudentAttended.has(data.classId)) classStudentAttended.set(data.classId, new Map());
          const studentMap = classStudentAttended.get(data.classId)!;
          studentMap.set(data.studentId, (studentMap.get(data.studentId) || 0) + 1);
        }
      });

      const reportData: PayrollRow[] = [];
      const detailedData: Record<string, any[]> = {};

      classes.forEach(cls => {
        const validDates = classValidDates.get(cls.id);
        if (!validDates || validDates.size === 0) return; 

        const totalSessions = validDates.size;
        let totalRevenue = 0;
        
        const studentDetails: any[] = [];
        const studentMap = classStudentAttended.get(cls.id);
        const studentCount = studentMap ? studentMap.size : 0;
        
        if (studentMap) {
          studentMap.forEach((attendedCount, studentId) => {
             const stuGlobal = allStudents.find(s => s.id === studentId);
             const discount = (stuGlobal as any)?.discount || 0;
             const rawTuition = attendedCount * (cls.feePerSession || 0);
             const finalTuition = rawTuition * (1 - discount / 100);
             totalRevenue += finalTuition;

             studentDetails.push({
               name: stuGlobal?.fullName || 'Không rõ',
               attended: attendedCount,
               discount: discount,
               tuition: finalTuition,
               note: stuGlobal?.note || ''
             });
          });
        }

        studentDetails.sort((a,b) => getFirstName(a.name).localeCompare(getFirstName(b.name), 'vi'));
        detailedData[cls.id] = studentDetails;

        const roomFee = totalSessions * 200000; 
        const otherDeductions = 0;
        
        const remainingForTax = totalRevenue - roomFee - otherDeductions;
        const taxAmount = remainingForTax > 0 ? remainingForTax * 0.02 : 0; 
        
        const netSalary = remainingForTax - taxAmount;

        const assignedTeachers = classTeachersListMap[cls.id] || [];

        reportData.push({
          classId: cls.id,
          className: cls.className,
          teacherName: classTeacherMap[cls.id] || '—',
          teachers: assignedTeachers,
          studentCount,
          totalSessions,
          totalRevenue,
          roomFee,
          taxAmount,
          otherDeductions,
          netSalary
        });
      });

      reportData.sort((a,b) => a.className.localeCompare(b.className));
      setPayrollData(reportData);
      setPayrollDetails(detailedData); 
      toast('Đã tính toán xong bảng lương & thu nhập GV!', 'success');

    } catch (e) {
      toast('Lỗi khi tính toán bảng lương', 'error');
    } finally {
      setCalculatingPayroll(false);
    }
  };

  const teacherIncomeList = useMemo<TeacherIncomeSummary[]>(() => {
    if (payrollData.length === 0) return [];

    const map = new Map<string, TeacherIncomeSummary>();

    payrollData.forEach((pRow) => {
      const assignedTeachers = pRow.teachers && pRow.teachers.length > 0 
        ? pRow.teachers 
        : [];

      if (assignedTeachers.length === 0) {
        const key = '__UNASSIGNED__';
        if (!map.has(key)) {
          map.set(key, {
            teacherId: '__UNASSIGNED__',
            teacherName: 'Chưa phân công GV',
            email: '',
            role: '',
            classList: [],
            totalClasses: 0,
            totalSessions: 0,
            totalStudents: 0,
            totalRevenue: 0,
            totalRoomFee: 0,
            totalTaxAmount: 0,
            totalOtherDeductions: 0,
            totalNetIncome: 0,
          });
        }
        const item = map.get(key)!;
        item.classList.push({
          classId: pRow.classId,
          className: pRow.className,
          studentCount: pRow.studentCount,
          totalSessions: pRow.totalSessions,
          totalRevenue: pRow.totalRevenue,
          roomFee: pRow.roomFee,
          taxAmount: pRow.taxAmount,
          otherDeductions: pRow.otherDeductions,
          netSalary: pRow.netSalary,
        });
        item.totalClasses += 1;
        item.totalSessions += pRow.totalSessions;
        item.totalStudents += pRow.studentCount;
        item.totalRevenue += pRow.totalRevenue;
        item.totalRoomFee += pRow.roomFee;
        item.totalTaxAmount += pRow.taxAmount;
        item.totalOtherDeductions += pRow.otherDeductions;
        item.totalNetIncome += pRow.netSalary;
        return;
      }

      const teacherCount = assignedTeachers.length;
      const shareRatio = 1 / teacherCount;

      assignedTeachers.forEach((t) => {
        const key = t.id;
        if (!map.has(key)) {
          map.set(key, {
            teacherId: t.id,
            teacherName: t.name,
            email: t.email || '',
            role: t.role || '',
            classList: [],
            totalClasses: 0,
            totalSessions: 0,
            totalStudents: 0,
            totalRevenue: 0,
            totalRoomFee: 0,
            totalTaxAmount: 0,
            totalOtherDeductions: 0,
            totalNetIncome: 0,
          });
        }

        const item = map.get(key)!;
        const allocatedRev = pRow.totalRevenue * shareRatio;
        const allocatedRoom = pRow.roomFee * shareRatio;
        const allocatedTax = pRow.taxAmount * shareRatio;
        const allocatedOther = pRow.otherDeductions * shareRatio;
        const allocatedNet = pRow.netSalary * shareRatio;

        item.classList.push({
          classId: pRow.classId,
          className: pRow.className + (teacherCount > 1 ? ` (Đồng giảng ${teacherCount} GV)` : ''),
          studentCount: pRow.studentCount,
          totalSessions: pRow.totalSessions,
          totalRevenue: allocatedRev,
          roomFee: allocatedRoom,
          taxAmount: allocatedTax,
          otherDeductions: allocatedOther,
          netSalary: allocatedNet,
        });

        item.totalClasses += 1;
        item.totalSessions += pRow.totalSessions;
        item.totalStudents += pRow.studentCount;
        item.totalRevenue += allocatedRev;
        item.totalRoomFee += allocatedRoom;
        item.totalTaxAmount += allocatedTax;
        item.totalOtherDeductions += allocatedOther;
        item.totalNetIncome += allocatedNet;
      });
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.teacherId === '__UNASSIGNED__') return 1;
      if (b.teacherId === '__UNASSIGNED__') return -1;
      return b.totalNetIncome - a.totalNetIncome;
    });
  }, [payrollData]);

  const handlePayrollUpdate = (classId: string, field: keyof PayrollRow, value: number) => {
    setPayrollData(prev => prev.map(row => {
      if (row.classId === classId) {
        const updatedRow = { ...row, [field]: value };
        
        if (field === 'roomFee' || field === 'otherDeductions') {
           const remainingForTax = updatedRow.totalRevenue - updatedRow.roomFee - updatedRow.otherDeductions;
           updatedRow.taxAmount = remainingForTax > 0 ? remainingForTax * 0.02 : 0;
        }

        updatedRow.netSalary = updatedRow.totalRevenue - updatedRow.roomFee - updatedRow.taxAmount - updatedRow.otherDeductions;
        return updatedRow;
      }
      return row;
    }));
  };

  const exportTeacherIncomeExcel = () => {
    if (teacherIncomeList.length === 0) return toast('Không có dữ liệu để xuất', 'warning');

    const summaryData: any[][] = [
      ['TRUNG TÂM GIÁO DỤC CHẤT LƯỢNG CAO N&C'],
      ['BẢNG TỔNG HỢP THU NHẬP TỪNG GIÁO VIÊN'],
      [`Thời gian: Từ ngày ${formatDate(startDate)} đến ngày ${formatDate(endDate)}`],
      [],
      ['STT', 'Họ và tên Giáo viên', 'Email / Tài khoản', 'Số lớp dạy', 'Danh sách các lớp', 'Tổng số buổi', 'Tổng số HS', 'Tổng thu HS (VNĐ)', 'Trừ: Phí CSVC/Phòng', 'Trừ: Thuế TNCN (2%)', 'Trừ: Khác', 'TỔNG THU NHẬP THỰC NHẬN (VNĐ)']
    ];

    let sumClasses = 0, sumSessions = 0, sumStudents = 0, sumRev = 0, sumRoom = 0, sumTax = 0, sumOther = 0, sumNet = 0;

    teacherIncomeList.forEach((t, idx) => {
      const classNames = t.classList.map(c => c.className).join(', ');
      summaryData.push([
        idx + 1,
        t.teacherName,
        t.email || '—',
        t.totalClasses,
        classNames,
        t.totalSessions,
        t.totalStudents,
        t.totalRevenue,
        t.totalRoomFee,
        t.totalTaxAmount,
        t.totalOtherDeductions,
        t.totalNetIncome
      ]);
      sumClasses += t.totalClasses;
      sumSessions += t.totalSessions;
      sumStudents += t.totalStudents;
      sumRev += t.totalRevenue;
      sumRoom += t.totalRoomFee;
      sumTax += t.totalTaxAmount;
      sumOther += t.totalOtherDeductions;
      sumNet += t.totalNetIncome;
    });

    summaryData.push([
      '', 'TỔNG CỘNG HỆ THỐNG', '', sumClasses, '', sumSessions, sumStudents, sumRev, sumRoom, sumTax, sumOther, sumNet
    ]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(summaryData);
    ws['!cols'] = [{wch: 5}, {wch: 25}, {wch: 28}, {wch: 10}, {wch: 35}, {wch: 12}, {wch: 10}, {wch: 18}, {wch: 20}, {wch: 18}, {wch: 15}, {wch: 24}];
    XLSX.utils.book_append_sheet(wb, ws, 'TONG_HOP_GV');
    XLSX.writeFile(wb, `Bang_Tong_Hop_Thu_Nhap_GV_${formatDate(startDate).replace(/\//g,'')}_${formatDate(endDate).replace(/\//g,'')}.xlsx`);
    toast('Đã xuất Bảng tổng hợp thu nhập từng GV thành công!', 'success');
  };

  const exportSingleTeacherIncomeExcel = (t: TeacherIncomeSummary) => {
    const wb = XLSX.utils.book_new();

    const summaryData: any[][] = [
      ['TRUNG TÂM GIÁO DỤC CHẤT LƯỢNG CAO N&C'],
      [`BẢNG QUYẾT TOÁN THU NHẬP GIÁO VIÊN: ${t.teacherName.toUpperCase()}`],
      [`Email: ${t.email || '—'}   |   Từ ngày: ${formatDate(startDate)} đến ngày: ${formatDate(endDate)}`],
      [],
      ['I. TỔNG HỢP CÁC LỚP GIẢNG DẠY'],
      ['STT', 'Tên Lớp', 'Số HS', 'Số buổi dạy', 'Tổng thu HS (VNĐ)', 'Trừ: Phí CSVC/Tiền phòng', 'Trừ: Thuế TNCN (2%)', 'Trừ: Khác', 'THU NHẬP THỰC NHẬN (VNĐ)']
    ];

    t.classList.forEach((c, idx) => {
      summaryData.push([
        idx + 1, c.className, c.studentCount, c.totalSessions, c.totalRevenue, c.roomFee, c.taxAmount, c.otherDeductions, c.netSalary
      ]);
    });

    summaryData.push([
      '', 'TỔNG CỘNG', t.totalStudents, t.totalSessions, t.totalRevenue, t.totalRoomFee, t.totalTaxAmount, t.totalOtherDeductions, t.totalNetIncome
    ]);

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [{wch: 5}, {wch: 22}, {wch: 10}, {wch: 12}, {wch: 18}, {wch: 22}, {wch: 18}, {wch: 18}, {wch: 22}];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'TONG_HOP_GV');

    t.classList.forEach(c => {
      const details = payrollDetails[c.classId] || [];
      let sheetName = c.className.replace(/[\\/?*[\]:]/g, '_').substring(0, 26);
      let count = 1;
      while (wb.SheetNames.includes(sheetName)) {
        sheetName = sheetName.substring(0, 23) + `_${count}`;
        count++;
      }

      const classData: any[][] = [
        ['TRUNG TÂM GIÁO DỤC CHẤT LƯỢNG CAO N&C'],
        [`CHI TIẾT LỚP: ${c.className}`],
        [`Giáo viên: ${t.teacherName}`],
        [`Thời gian: Từ ${formatDate(startDate)} đến ${formatDate(endDate)}`],
        [],
        ['STT', 'Họ và tên HS', 'Số buổi học', 'Miễn giảm (%)', 'Thành tiền (VNĐ)', 'Ghi chú']
      ];

      details.forEach((s, idx) => {
        classData.push([idx + 1, s.name, s.attended, s.discount ? s.discount : '', s.tuition, s.note]);
      });

      classData.push(['', 'TỔNG DOANH THU LỚP', '', '', c.totalRevenue, '']);
      classData.push([]);
      classData.push(['QUYẾT TOÁN LỚP']);
      classData.push(['1', 'Tổng doanh thu HS', '', '', c.totalRevenue]);
      classData.push(['2', 'Trừ: Phí CSVC/Tiền phòng', '', '', c.roomFee]);
      classData.push(['3', 'Trừ: Khác', '', '', c.otherDeductions]);
      classData.push(['4', 'Trừ: Thuế TNCN (2%)', '', '', c.taxAmount]);
      classData.push(['', 'LƯƠNG THỰC NHẬN LỚP NÀY', '', '', c.netSalary]);

      const wsClass = XLSX.utils.aoa_to_sheet(classData);
      wsClass['!cols'] = [{wch: 6}, {wch: 25}, {wch: 12}, {wch: 15}, {wch: 18}, {wch: 20}];
      XLSX.utils.book_append_sheet(wb, wsClass, sheetName);
    });

    XLSX.writeFile(wb, `Thu_Nhap_${t.teacherName.replace(/\s+/g, '_')}_${formatDate(startDate).replace(/\//g,'')}.xlsx`);
    toast(`Đã xuất file Excel thu nhập cho ${t.teacherName}`, 'success');
  };

  const exportSingleTeacherIncomeWord = (t: TeacherIncomeSummary) => {
    let classesHtml = '';
    t.classList.forEach((c, idx) => {
      classesHtml += `
        <tr>
          <td style="text-align:center;">${idx + 1}</td>
          <td><b>${c.className}</b></td>
          <td style="text-align:center;">${c.studentCount}</td>
          <td style="text-align:center;">${c.totalSessions}</td>
          <td style="text-align:right;">${fmtCurrency(c.totalRevenue)}</td>
          <td style="text-align:right;">${fmtCurrency(c.roomFee)}</td>
          <td style="text-align:right;">${fmtCurrency(c.taxAmount)}</td>
          <td style="text-align:right;">${fmtCurrency(c.otherDeductions)}</td>
          <td style="text-align:right; font-weight:bold; color:#059669;">${fmtCurrency(c.netSalary)}</td>
        </tr>
      `;
    });

    let detailsHtml = '';
    t.classList.forEach(c => {
      const details = payrollDetails[c.classId] || [];
      detailsHtml += `
        <h4 style="margin-top:20px; color:#0369a1;">• Lớp: ${c.className} (Số HS: ${c.studentCount}, Số buổi: ${c.totalSessions})</h4>
        <table border="1" cellspacing="0" cellpadding="6" style="width:100%; border-collapse:collapse; font-size:13px;">
          <tr style="background:#f1f5f9;">
            <th style="width:40px; text-align:center;">STT</th>
            <th>Họ và tên học sinh</th>
            <th style="text-align:center; width:90px;">Số buổi học</th>
            <th style="text-align:center; width:90px;">Miễn giảm (%)</th>
            <th style="text-align:right; width:130px;">Học phí (VNĐ)</th>
            <th>Ghi chú</th>
          </tr>
      `;
      if (details.length === 0) {
        detailsHtml += `<tr><td colspan="6" style="text-align:center; font-style:italic;">Không có học sinh điểm danh</td></tr>`;
      } else {
        details.forEach((s: any, sIdx: number) => {
          detailsHtml += `
            <tr>
              <td style="text-align:center;">${sIdx + 1}</td>
              <td><b>${s.name}</b></td>
              <td style="text-align:center;">${s.attended}</td>
              <td style="text-align:center;">${s.discount ? s.discount + '%' : '-'}</td>
              <td style="text-align:right;">${fmtCurrency(s.tuition)}</td>
              <td>${s.note || ''}</td>
            </tr>
          `;
        });
      }
      detailsHtml += `</table>`;
    });

    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Phiếu Quyết Toán Thu Nhập - ${t.teacherName}</title>
      <style>
        body { font-family: 'Times New Roman', serif; font-size: 14px; line-height: 1.5; color: #111; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 15px; }
        th, td { border: 1px solid #333; padding: 6px 8px; }
        th { background-color: #f3f4f6; }
      </style>
      </head>
      <body>
        <div style="text-align: center; margin-bottom: 20px;">
          <h3 style="margin: 0; text-transform: uppercase;">TRUNG TÂM GIÁO DỤC CHẤT LƯỢNG CAO N&C</h3>
          <p style="margin: 3px 0 0 0; font-size: 13px;">Dạy Thật - Học Thật - Giá Trị Thật</p>
          <hr style="width: 200px; margin: 10px auto;" />
          <h2 style="margin: 15px 0 5px 0; text-transform: uppercase; color: #047857;">PHIẾU QUYẾT TOÁN THU NHẬP GIÁO VIÊN</h2>
          <p style="margin: 0; font-style: italic;">Thời gian: Từ ngày ${formatDate(startDate)} đến ngày ${formatDate(endDate)}</p>
        </div>

        <div style="margin-bottom: 15px; background-color: #f8fafc; padding: 10px; border: 1px solid #cbd5e1; border-radius: 4px;">
          <p style="margin: 4px 0;"><b>Họ và tên giáo viên:</b> ${t.teacherName}</p>
          <p style="margin: 4px 0;"><b>Email / Tài khoản:</b> ${t.email || '—'}</p>
          <p style="margin: 4px 0;"><b>Số lớp phụ trách:</b> ${t.totalClasses} lớp</p>
          <p style="margin: 4px 0;"><b>Tổng số buổi dạy:</b> ${t.totalSessions} buổi</p>
          <p style="margin: 4px 0; font-size: 16px;"><b>TỔNG THU NHẬP THỰC NHẬN:</b> <span style="color:#059669; font-weight:bold; font-size:18px;">${fmtCurrency(t.totalNetIncome)}</span></p>
        </div>

        <h3 style="color: #0f172a; margin-top: 20px;">I. BẢNG TỔNG HỢP CÁC LỚP & THU NHẬP</h3>
        <table border="1" cellspacing="0" cellpadding="6">
          <tr style="background:#e2e8f0;">
            <th style="width:40px; text-align:center;">STT</th>
            <th>Tên Lớp</th>
            <th style="text-align:center;">Số HS</th>
            <th style="text-align:center;">Số buổi</th>
            <th style="text-align:right;">Tổng thu HS</th>
            <th style="text-align:right;">Phí CSVC</th>
            <th style="text-align:right;">Thuế (2%)</th>
            <th style="text-align:right;">Trừ khác</th>
            <th style="text-align:right;">Lương thực nhận</th>
          </tr>
          ${classesHtml}
          <tr style="font-weight:bold; background:#f8fafc;">
            <td colspan="2" style="text-align:center;">TỔNG CỘNG</td>
            <td style="text-align:center;">${t.totalStudents}</td>
            <td style="text-align:center;">${t.totalSessions}</td>
            <td style="text-align:right;">${fmtCurrency(t.totalRevenue)}</td>
            <td style="text-align:right;">${fmtCurrency(t.totalRoomFee)}</td>
            <td style="text-align:right;">${fmtCurrency(t.totalTaxAmount)}</td>
            <td style="text-align:right;">${fmtCurrency(t.totalOtherDeductions)}</td>
            <td style="text-align:right; color:#059669; font-size:15px;">${fmtCurrency(t.totalNetIncome)}</td>
          </tr>
        </table>

        <h3 style="color: #0f172a; margin-top: 25px;">II. CHI TIẾT HỌC SINH TỪNG LỚP</h3>
        ${detailsHtml}

        <div style="margin-top: 40px; display: table; width: 100%;">
          <div style="display: table-row;">
            <div style="display: table-cell; width: 33%; text-align: center;">
              <b>Người lập bảng</b><br/><br/><br/><br/>
              <i>(Ký, ghi rõ họ tên)</i>
            </div>
            <div style="display: table-cell; width: 33%; text-align: center;">
              <b>Kế toán / Thủ quỹ</b><br/><br/><br/><br/>
              <i>(Ký, ghi rõ họ tên)</i>
            </div>
            <div style="display: table-cell; width: 34%; text-align: center;">
              <b>Giáo viên nhận tiền</b><br/><br/><br/><br/>
              <b>${t.teacherName}</b>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', htmlContent], {
      type: 'application/msword'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Phieu_Thu_Nhap_${t.teacherName.replace(/\s+/g, '_')}_${formatDate(startDate).replace(/\//g,'')}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast(`Đã tải xuống phiếu thu nhập Word cho ${t.teacherName}`, 'success');
  };

  const exportMegaPayrollExcel = () => {
    if (payrollData.length === 0) return toast('Không có dữ liệu để xuất', 'warning');
    
    const wb = XLSX.utils.book_new();

    // Sheet 1: TONG_HOP_GV
    const teacherSummaryData: any[][] = [
      ['TRUNG TÂM GIÁO DỤC CHẤT LƯỢNG CAO N&C'],
      ['BẢNG TỔNG HỢP THU NHẬP TỪNG GIÁO VIÊN'],
      [`Từ ngày: ${formatDate(startDate)}   Đến ngày: ${formatDate(endDate)}`],
      [],
      ['STT', 'Họ và tên Giáo viên', 'Email / Tài khoản', 'Số lớp dạy', 'Danh sách các lớp', 'Tổng số buổi', 'Tổng số HS', 'Tổng thu HS (VNĐ)', 'Trừ: Phí CSVC/Phòng', 'Trừ: Thuế TNCN (2%)', 'Trừ: Khác', 'TỔNG THU NHẬP THỰC NHẬN (VNĐ)']
    ];

    let tSumClasses = 0, tSumSessions = 0, tSumStudents = 0, tSumRev = 0, tSumRoom = 0, tSumTax = 0, tSumOther = 0, tSumNet = 0;

    teacherIncomeList.forEach((t, idx) => {
      const classNames = t.classList.map(c => c.className).join(', ');
      teacherSummaryData.push([
        idx + 1,
        t.teacherName,
        t.email || '—',
        t.totalClasses,
        classNames,
        t.totalSessions,
        t.totalStudents,
        t.totalRevenue,
        t.totalRoomFee,
        t.totalTaxAmount,
        t.totalOtherDeductions,
        t.totalNetIncome
      ]);
      tSumClasses += t.totalClasses;
      tSumSessions += t.totalSessions;
      tSumStudents += t.totalStudents;
      tSumRev += t.totalRevenue;
      tSumRoom += t.totalRoomFee;
      tSumTax += t.totalTaxAmount;
      tSumOther += t.totalOtherDeductions;
      tSumNet += t.totalNetIncome;
    });

    teacherSummaryData.push([
      '', 'TỔNG CỘNG HỆ THỐNG', '', tSumClasses, '', tSumSessions, tSumStudents, tSumRev, tSumRoom, tSumTax, tSumOther, tSumNet
    ]);

    const wsTeacherSummary = XLSX.utils.aoa_to_sheet(teacherSummaryData);
    wsTeacherSummary['!cols'] = [{wch: 5}, {wch: 25}, {wch: 28}, {wch: 10}, {wch: 35}, {wch: 12}, {wch: 10}, {wch: 18}, {wch: 20}, {wch: 18}, {wch: 15}, {wch: 24}];
    XLSX.utils.book_append_sheet(wb, wsTeacherSummary, 'TONG_HOP_GV');

    // Sheet 2: TONG_HOP_LOP
    const summaryData: any[][] = [
      ['TRUNG TÂM GIÁO DỤC CHẤT LƯỢNG CAO N&C'],
      ['BẢNG TỔNG HỢP DOANH THU LỚP HỌC & LƯƠNG GIÁO VIÊN'],
      [`Từ ngày: ${formatDate(startDate)}   Đến ngày: ${formatDate(endDate)}`],
      [],
      ['STT', 'Tên Lớp', 'Giáo viên phụ trách', 'Số HS', 'Số buổi dạy', 'Tổng thu HS (VNĐ)', 'Trừ: Phí CSVC/Tiền phòng', 'Trừ: Thuế TNCN (2%)', 'Trừ: Khác (Quá sĩ số...)', 'LƯƠNG GV NHẬN (VNĐ)']
    ];

    let sumStudents = 0, sumSessions = 0, sumRev = 0, sumRoom = 0, sumTax = 0, sumOther = 0, sumNet = 0;

    payrollData.forEach((row, idx) => {
      summaryData.push([
        idx + 1, row.className, row.teacherName, row.studentCount, row.totalSessions,
        row.totalRevenue, row.roomFee, row.taxAmount, row.otherDeductions, row.netSalary
      ]);
      sumStudents += row.studentCount;
      sumSessions += row.totalSessions; sumRev += row.totalRevenue; sumRoom += row.roomFee;
      sumTax += row.taxAmount; sumOther += row.otherDeductions; sumNet += row.netSalary;
    });

    summaryData.push(['', 'TỔNG CỘNG', '', sumStudents, sumSessions, sumRev, sumRoom, sumTax, sumOther, sumNet]);

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [{wch: 5}, {wch: 20}, {wch: 25}, {wch: 10}, {wch: 12}, {wch: 18}, {wch: 22}, {wch: 18}, {wch: 20}, {wch: 22}];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'TONG_HOP_LOP');

    // Subsequent sheets: Class Details
    payrollData.forEach((row) => {
      const details = payrollDetails[row.classId] || [];
      let sheetName = row.className.replace(/[\\/?*[\]:]/g, '_').substring(0, 26);
      
      let count = 1;
      while (wb.SheetNames.includes(sheetName)) {
         sheetName = sheetName.substring(0, 23) + `_${count}`;
         count++;
      }

      const classData: any[][] = [
        ['TRUNG TÂM GIÁO DỤC CHẤT LƯỢNG CAO N&C'],
        [`PHIẾU THANH TOÁN LƯƠNG GIÁO VIÊN - LỚP ${row.className}`],
        [`Giáo viên: ${row.teacherName}`],
        [`Thời gian: Từ ${formatDate(startDate)} đến ${formatDate(endDate)}`],
        [],
        ['I. CHI TIẾT DOANH THU HỌC SINH'],
        ['STT', 'Họ và tên HS', 'Số buổi học', 'Miễn giảm (%)', 'Thành tiền (VNĐ)', 'Ghi chú']
      ];

      details.forEach((s, idx) => {
        classData.push([idx + 1, s.name, s.attended, s.discount ? s.discount : '', s.tuition, s.note]);
      });

      classData.push(['', 'TỔNG DOANH THU LỚP', '', '', row.totalRevenue, '']);
      classData.push([]);
      classData.push(['II. QUYẾT TOÁN LƯƠNG GIÁO VIÊN']);
      classData.push(['1', 'Tổng doanh thu', '', '', row.totalRevenue]);
      classData.push(['2', 'Trừ: Phí CSVC/Tiền phòng', '', '', row.roomFee]);
      classData.push(['3', 'Trừ: Khác (Quá sĩ số, vv...)', '', '', row.otherDeductions]);
      classData.push(['4', 'Trừ: Thuế TNCN (2% của phần còn lại)', '', '', row.taxAmount]);
      classData.push(['', 'THỰC NHẬN CỦA GIÁO VIÊN', '', '', row.netSalary]);

      const wsClass = XLSX.utils.aoa_to_sheet(classData);
      wsClass['!cols'] = [{wch: 6}, {wch: 25}, {wch: 12}, {wch: 15}, {wch: 18}, {wch: 20}];
      XLSX.utils.book_append_sheet(wb, wsClass, sheetName);
    });

    XLSX.writeFile(wb, `Quyet_Toan_Luong_va_Thu_Nhap_GV_${formatDate(startDate).replace(/\//g,'')}_${formatDate(endDate).replace(/\//g,'')}.xlsx`);
    toast('Đã xuất Báo cáo Đa trang (Tổng hợp GV & Lớp) thành công!', 'success');
  };

  const exportSingleClassExcel = (row: PayrollRow) => {
    const details = payrollDetails[row.classId] || [];
    const classData: any[][] = [
      ['TRUNG TÂM GIÁO DỤC CHẤT LƯỢNG CAO N&C'],
      [`PHIẾU THANH TOÁN LƯƠNG GIÁO VIÊN - LỚP ${row.className}`],
      [`Giáo viên: ${row.teacherName}`],
      [`Thời gian: Từ ${formatDate(startDate)} đến ${formatDate(endDate)}`],
      [],
      ['I. CHI TIẾT DOANH THU HỌC SINH'],
      ['STT', 'Họ và tên HS', 'Số buổi học', 'Miễn giảm (%)', 'Thành tiền (VNĐ)', 'Ghi chú']
    ];

    details.forEach((s, idx) => {
      classData.push([idx + 1, s.name, s.attended, s.discount ? s.discount : '', s.tuition, s.note]);
    });

    classData.push(['', 'TỔNG DOANH THU LỚP', '', '', row.totalRevenue, '']);
    classData.push([]);
    classData.push(['II. QUYẾT TOÁN LƯƠNG GIÁO VIÊN']);
    classData.push(['1', 'Tổng doanh thu', '', '', row.totalRevenue]);
    classData.push(['2', 'Trừ: Phí CSVC/Tiền phòng', '', '', row.roomFee]);
    classData.push(['3', 'Trừ: Khác (Quá sĩ số, vv...)', '', '', row.otherDeductions]);
    classData.push(['4', 'Trừ: Thuế TNCN (2% của phần còn lại)', '', '', row.taxAmount]);
    classData.push(['', 'THỰC NHẬN CỦA GIÁO VIÊN', '', '', row.netSalary]);

    const wsClass = XLSX.utils.aoa_to_sheet(classData);
    wsClass['!cols'] = [{wch: 6}, {wch: 25}, {wch: 12}, {wch: 15}, {wch: 18}, {wch: 20}];
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsClass, 'Phieu_Luong');
    XLSX.writeFile(wb, `Phieu_Luong_${row.className.replace(/\s+/g, '_')}_${formatDate(startDate).replace(/\//g,'')}.xlsx`);
    toast(`Đã xuất phiếu lương lớp ${row.className}`, 'success');
  };

  const handleUpdateStudentField = async (s: any, field: string, value: any) => {
    if (s[field] == value) return; 
    try {
      await updateStudent(s.studentId, { [field]: value });
      setAllStudents(prev => prev.map(student => student.id === s.studentId ? { ...student, [field]: value } : student));
      setTuition(prev => {
        if (!prev) return prev;
        const newStudents = prev.students.map(student => {
          if (student.studentId === s.studentId) {
            const updated = { ...student, [field]: value };
            if (field === 'discount') {
               const feePerSession = prev.classInfo?.feePerSession || 0;
               const raw = updated.sessionsAttended * feePerSession;
               updated.tuition = raw * (1 - (Number(value) || 0) / 100);
            }
            return updated;
          }
          return student;
        });
        return { ...prev, students: newStudents };
      });
      toast('Đã lưu thông tin tự động', 'success');
    } catch (e) {
      toast('Lỗi khi cập nhật thông tin', 'error');
    }
  };

  const handleClassSelect = (c: ClassItem) => {
    setSelectedClass(c.id);
    setClassSearchTerm(c.className);
    setIsClassDropdownOpen(false);
  };

  const selectedCls = classes.find((c) => c.id === selectedClass);
  const globalConfig = useMemo(() => getGlobalPaymentConfig(), []);
  const effectiveConfig = useMemo(() => getEffectivePaymentConfig(configDraft), [configDraft]);
  const configReady = isPaymentConfigReady(effectiveConfig);

  const processedStudents = useMemo(() => {
    if (!tuition?.students) return [];
    return [...tuition.students]
      .filter(s => s.fullName.toLowerCase().includes(searchTerm.trim().toLowerCase()))
      .sort((a, b) => {
        const nameA = getFirstName(a.fullName);
        const nameB = getFirstName(b.fullName);
        const cmp = nameA.localeCompare(nameB, 'vi', { sensitivity: 'base' });
        if (cmp !== 0) return cmp;
        return a.fullName.localeCompare(b.fullName, 'vi', { sensitivity: 'base' });
      });
  }, [tuition, searchTerm]);

  function makePaymentInfo(row: TuitionStudentRow) {
    const transferNote = buildTransferNote({
      pattern: effectiveConfig.notePattern,
      className: tuition?.classInfo.className || selectedCls?.className || '',
      studentName: row.fullName,
      monthKey: batchName, 
    });

    const qrUrl = buildVietQrUrl({
      bankId: effectiveConfig.bankId,
      bankAccount: effectiveConfig.bankAccount,
      bankAccountName: effectiveConfig.bankAccountName,
      amount: row.tuition,
      addInfo: transferNote,
      template: effectiveConfig.qrTemplate,
    });

    return { transferNote, qrUrl };
  }

  async function saveConfig() {
    if (!selectedClass || !user) return;
    if (configDraft.mode === 'CLASS') {
      if (!configDraft.bankId.trim() || !configDraft.bankAccount.trim() || !configDraft.bankAccountName.trim()) {
        toast('Vui lòng nhập đủ ngân hàng, số tài khoản và tên tài khoản của lớp', 'warning');
        return;
      }
    }
    setSavingConfig(true);
    try {
      await saveClassPaymentConfig(
        selectedClass,
        {
          ...configDraft,
          classId: selectedClass,
          qrTemplate: 'compact2',
          notePattern: '{CLASS}_{STUDENT}_HP {MONTH}',
        },
        user.id
      );
      toast('Đã lưu cấu hình QR học phí', 'success');
      await loadTuition();
    } catch (e) {
      toast('Lỗi lưu cấu hình', 'error');
    } finally {
      setSavingConfig(false);
    }
  }

  async function setPaid(row: TuitionStudentRow, paid: boolean) {
    if (!user || !selectedClass) return;
    const { transferNote } = makePaymentInfo(row);
    setSavingStudent(row.studentId);
    try {
      await setTuitionPaymentStatus({
        classId: selectedClass,
        studentId: row.studentId,
        monthKey: batchName, 
        amount: row.tuition,
        transferNote,
        status: paid ? 'PAID' : 'UNPAID',
        confirmedBy: user.id,
        confirmedByName: user.name,
      });
      toast(paid ? 'Đã lưu xác nhận hoàn thành học phí' : 'Đã hủy xác nhận đã thu', 'success');
      await loadTuition();
    } catch (e) {
      toast('Lỗi cập nhật trạng thái', 'error');
    } finally {
      setSavingStudent('');
    }
  }

  const handleSyncSepay = async () => {
    if (!user || !selectedClass || !tuition) {
      toast('Vui lòng chọn lớp và bấm Áp dụng trước khi đồng bộ!', 'warning');
      return;
    }

    try {
      toast('Đang quét Sổ phụ ngân hàng...', 'success');
      
      const q = query(collection(db, 'sepay_transactions'), where('status', '==', 'NEW'));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        toast('Không có giao dịch chuyển khoản nào mới!', 'warning');
        return;
      }

      let syncCount = 0;

      for (const docSnap of querySnapshot.docs) {
        const data = docSnap.data();
        const noidung = (data.content || '').toUpperCase();
        
        for (const student of processedStudents) {
           const expectedNote = makePaymentInfo(student).transferNote.toUpperCase();
           const studentName = student.fullName.toUpperCase();
           
           if (noidung.includes(expectedNote) || noidung.includes(studentName)) {
              
              await setTuitionPaymentStatus({
                classId: selectedClass,
                studentId: student.studentId,
                monthKey: batchName,
                amount: student.tuition,
                transferNote: data.content,
                status: 'PAID',
                confirmedBy: user.id,
                confirmedByName: 'Hệ thống tự động (SePay)',
              });

              await updateDoc(doc(db, 'sepay_transactions', docSnap.id), { 
                status: 'DONE',
                matchedStudent: student.fullName
              });

              syncCount++;
              break; 
           }
        }
      }

      if (syncCount > 0) {
        toast(`Ting ting! Đã tự động gạch nợ thành công ${syncCount} học phí!`, 'success');
        await loadTuition(); 
      } else {
        toast('Có tiền vào nhưng nội dung CK không khớp với tên học sinh nào trong lớp này.', 'warning');
      }
      
    } catch (error) {
      console.error("Lỗi đồng bộ:", error);
      toast("Có lỗi xảy ra khi đồng bộ ngân hàng!", 'error');
    }
  };

  const exportTuitionWord = async () => {
    if (!tuition || !selectedCls) {
      toast('Vui lòng chọn lớp và tải dữ liệu trước khi xuất báo cáo!', 'error');
      return;
    }

    let attendanceDatesStr = '';
    try {
      const attSnap = await getDocs(query(collection(db, 'attendance'), where('classId', '==', selectedCls.id)));
      const validDates = new Set<string>();
      attSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.date >= startDate && data.date <= endDate && data.present === true) validDates.add(data.date);
      });
      const sortedDates = Array.from(validDates).sort();
      attendanceDatesStr = sortedDates.map(d => {
        const [, m, day] = d.split('-'); return `${day}/${m}`;
      }).join(', ');
    } catch (e) { console.error("Lỗi lấy dữ liệu khi xuất Word:", e); }

    const currentClassName = selectedCls.className;
    const timeRangeText = `Từ ngày ${formatDate(startDate)} đến ngày ${formatDate(endDate)}`;
    const d = String(new Date().getDate()).padStart(2, '0');
    const m = String(new Date().getMonth() + 1).padStart(2, '0');
    const y = new Date().getFullYear();
    const bankInfo = '..................................................................................................................';
    const studyDatesHtml = attendanceDatesStr ? `<p style="font-size: 13pt;"><strong>Các ngày học:</strong> ${attendanceDatesStr}</p>` : '';

    let tableRows = '';
    processedStudents.forEach((st: any, idx) => {
      const stuGlobal = allStudents.find(d => d.id === st.studentId);
      const phoneStr = extractPhone(stuGlobal);
      const isPaid = st.paymentStatus === 'PAID';

      if (tabMode === 'TREASURER') {
        tableRows += `
          <tr>
            <td style="text-align: center;">${idx + 1}</td>
            <td>${st.fullName}</td>
            <td style="text-align: center; mso-number-format:'\@';">${phoneStr}</td>
            <td style="text-align: center;">${st.sessionsAttended}</td>
            <td style="text-align: center;">${st.discount ? st.discount + '%' : ''}</td>
            <td style="text-align: right; font-weight: bold;">${fmtCurrency(st.tuition)}</td>
            <td style="text-align: center; color: ${isPaid ? '#059669' : '#dc2626'}; font-weight: bold;">${isPaid ? 'Đã thu' : 'Chưa thu'}</td>
            <td>${st.note || ''}</td>
          </tr>
        `;
      } else {
        tableRows += `
          <tr>
            <td style="text-align: center;">${idx + 1}</td>
            <td>${st.fullName}</td>
            <td style="text-align: center; mso-number-format:'\@';">${phoneStr}</td>
            <td style="text-align: center;">${st.sessionsAttended}</td>
            <td style="text-align: center;">${st.discount ? st.discount + '%' : ''}</td>
            <td style="text-align: right; font-weight: bold;">${fmtCurrency(st.tuition)}</td>
            <td>${st.note || ''}</td>
          </tr>
        `;
      }
    });

    const headerText = tabMode === 'TREASURER' 
      ? `BÁO CÁO TỔNG HỢP HỌC PHÍ - LỚP ${currentClassName.toUpperCase()} - ${batchName.toUpperCase()}`
      : `BÁO CÁO TỔNG HỢP HỌC PHÍ - LỚP ${currentClassName.toUpperCase()}`;

    const tableHeaderHtml = tabMode === 'TREASURER' 
      ? `<tr><th style="width: 40px;">STT</th><th>Họ và tên</th><th style="width: 100px;">Số ĐT</th><th style="width: 70px;">Số buổi</th><th style="width: 70px;">Miễn (%)</th><th style="width: 100px;">Số tiền</th><th style="width: 90px;">Trạng thái</th><th style="width: 130px;">Ghi chú</th></tr>`
      : `<tr><th style="width: 40px;">STT</th><th>Họ và tên</th><th style="width: 120px;">Số ĐT</th><th style="width: 80px;">Số buổi</th><th style="width: 80px;">Miễn (%)</th><th style="width: 120px;">Số tiền</th><th style="width: 160px;">Ghi chú</th></tr>`;

    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Báo cáo học phí</title>
      <style>
        @page WordSection1 { size: 841.9pt 595.3pt; mso-page-orientation: landscape; margin: 1.0in 1.0in 1.0in 1.0in; }
        div.WordSection1 { page: WordSection1; }
        body { font-family: 'Times New Roman', Times, serif; font-size: 13pt; line-height: 1.5; color: #000; }
        .header-center { text-align: center; font-weight: bold; text-transform: uppercase; font-size: 14pt; margin-bottom: 5px; }
        .sub-header { text-align: center; font-style: italic; font-size: 13pt; margin-bottom: 20px; }
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
          <div class="header-center">${headerText}</div>
          <div class="sub-header">Thời gian tính học phí: ${timeRangeText}</div>
          <p style="font-size: 13pt; font-weight: bold;">Tài khoản chuyển tiền: ${bankInfo}</p>
          ${studyDatesHtml}
          <table class="data-table">
            <thead>${tableHeaderHtml}</thead>
            <tbody>${tableRows}</tbody>
          </table>
          <div style="text-align: right; margin-top: 5px; font-style: italic; margin-right: 50px;">Yên Thành, ngày ${d} tháng ${m} năm ${y}</div>
          <table class="signature-table">
            <tr><td style="width: 50%;"><strong>Giáo viên</strong></td><td style="width: 50%;"><strong>Người thu tiền</strong><br><br><br><br><br><strong>..................................................</strong></td></tr>
          </table>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bao_Cao_Hoc_Phi_Lop_${currentClassName.replace(/\s+/g, '_')}.doc`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    toast('Đã xuất file báo cáo học phí thành công!', 'success');
  };

  const total = tuition?.students.reduce((sum, s) => sum + s.tuition, 0) || 0;
  const paidTotal = tuition?.students.filter((s) => s.paymentStatus === 'PAID').reduce((sum, s) => sum + s.tuition, 0) || 0;
  const sumSessions = processedStudents.reduce((sum, s: any) => sum + (s.sessionsAttended || 0), 0);
  const sumTuition = processedStudents.reduce((sum, s: any) => sum + (s.tuition || 0), 0);

  const normalizedSearch = classSearchTerm.replace(/\s+/g, '').toLowerCase();
  const filteredClasses = classes.filter(c => (c.className || '').replace(/\s+/g, '').toLowerCase().includes(normalizedSearch));

  return (
    <div className="fade-up">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Wallet size={26} /> <span>Học phí & Doanh thu</span>
          </h1>
          <p className="page-sub">
            {tabMode === 'REPORT' ? 'Tính học phí theo khoảng thời gian và xuất báo cáo Word' : 
             tabMode === 'TREASURER' ? 'Quản lý thu học phí, kiểm soát công nợ học sinh' : 'Tính toán tổng doanh thu và quyết toán lương GV'}
          </p>
        </div>
      </div>

      {isAdmin && (
        <div className="tabs" style={{ marginBottom: 20 }}>
          <button 
            className={`tab ${tabMode === 'REPORT' ? 'active' : ''}`} 
            onClick={() => setTabMode('REPORT')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <BookOpen size={16} /> Báo cáo tổng hợp (GV)
          </button>
          <button 
            className={`tab ${tabMode === 'TREASURER' ? 'active' : ''}`} 
            onClick={() => setTabMode('TREASURER')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Wallet size={16} /> Sổ quỹ điện tử (Thu tiền)
          </button>
          <button 
            className={`tab ${tabMode === 'PAYROLL' ? 'active' : ''}`} 
            onClick={() => setTabMode('PAYROLL')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: tabMode === 'PAYROLL' ? '#10b981' : '', color: tabMode === 'PAYROLL' ? '#fff' : '' }}
          >
            <Calculator size={16} /> Quyết toán Lương GV
          </button>
        </div>
      )}

      {tabMode !== 'PAYROLL' && (
        <>
          <div className="card" style={{ position: 'relative', zIndex: 50, overflow: 'visible' }}>
            <div className="card-body" style={{ overflow: 'visible' }}>
              <div className="form-row">
                
                <div className="form-group" style={{ flex: 1.5, position: 'relative' }}>
                  <label className="form-label">Chọn lớp học (Gõ để tìm nhanh)</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="form-control"
                      type="text"
                      placeholder="Ví dụ: TO9 hoặc TO 9..."
                      value={classSearchTerm}
                      onChange={(e) => {
                        setClassSearchTerm(e.target.value);
                        setSelectedClass('');
                        setIsClassDropdownOpen(true);
                      }}
                      onFocus={() => setIsClassDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setIsClassDropdownOpen(false), 200)}
                    />
                  </div>
                  {isClassDropdownOpen && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d1d5db', 
                      borderTop: 'none', borderRadius: '0 0 6px 6px', maxHeight: '250px', overflowY: 'auto', zIndex: 9999,
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                    }}>
                      {filteredClasses.length > 0 ? (
                        filteredClasses.map(c => (
                          <div
                            key={c.id}
                            onMouseDown={(e) => { e.preventDefault(); handleClassSelect(c); }}
                            style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: '14px', color: '#000' }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                          >
                            {c.className}
                          </div>
                        ))
                      ) : (
                        <div style={{ padding: '10px 12px', color: '#6b7280', fontSize: '14px', textAlign: 'center' }}>Không tìm thấy lớp phù hợp</div>
                      )}
                    </div>
                  )}
                </div>
                
                {tabMode === 'TREASURER' && (
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Ghi sổ theo Đợt</label>
                    <input
                      className="form-control"
                      type="text"
                      placeholder="VD: Đợt 1, Khóa Hè..."
                      value={batchName}
                      onChange={(e) => setBatchName(e.target.value)}
                    />
                  </div>
                )}

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Tính từ ngày</label>
                  <input className="form-control" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Đến ngày</label>
                  <input className="form-control" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>

                {tabMode === 'TREASURER' && (
                  <div className="form-group" style={{ flex: 0.8, display: 'flex', alignItems: 'flex-end' }}>
                    <button className="btn btn-primary" style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: 8, height: '42px' }} onClick={loadTuition}>
                      <RefreshCcw size={16} /> Áp dụng
                    </button>
                  </div>
                )}

              </div>
            </div>
          </div>

          {tabMode === 'TREASURER' && selectedClass && (
            <div className="card" style={{ marginTop: '1rem', position: 'relative', zIndex: 10 }}>
              <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Settings size={18} /> Cấu hình QR Thanh toán — {selectedCls?.className}
              </div>
              <div className="card-body">
                <div className="payment-mode-row">
                  <label className="radio-card">
                    <input type="radio" checked={configDraft.mode !== 'CLASS'} onChange={() => setConfigDraft((p) => ({ ...p, mode: 'GLOBAL' }))} />
                    <span>
                      <strong>Dùng tài khoản chung của trung tâm</strong>
                      <small>{globalConfig.bankId || 'BANK'} · {globalConfig.bankAccount || 'Số tài khoản'} · {globalConfig.bankAccountName || 'Tên tài khoản'}</small>
                    </span>
                  </label>
                  <label className="radio-card">
                    <input type="radio" checked={configDraft.mode === 'CLASS'} onChange={() => setConfigDraft((p) => ({ ...p, mode: 'CLASS' }))} />
                    <span>
                      <strong>Dùng tài khoản riêng cho lớp này</strong>
                      <small>Phù hợp nếu mỗi giáo viên/lớp nhận tiền riêng</small>
                    </span>
                  </label>
                </div>

                {configDraft.mode === 'CLASS' && (
                  <div className="form-row" style={{ marginTop: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label">Mã ngân hàng VietQR</label>
                      <input className="form-control" value={configDraft.bankId} onChange={(e) => setConfigDraft((p) => ({ ...p, bankId: e.target.value.toUpperCase() }))} placeholder="VD: MB, VCB, ACB..." />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Số tài khoản</label>
                      <input className="form-control" value={configDraft.bankAccount} onChange={(e) => setConfigDraft((p) => ({ ...p, bankAccount: e.target.value }))} placeholder="Số tài khoản nhận tiền" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Tên tài khoản</label>
                      <input className="form-control" value={configDraft.bankAccountName} onChange={(e) => setConfigDraft((p) => ({ ...p, bankAccountName: e.target.value.toUpperCase() }))} placeholder="NGUYEN VAN A" />
                    </div>
                  </div>
                )}

                <div className="payment-config-preview">
                  <div>
                    <div className="form-label">Mẫu nội dung chuyển khoản</div>
                    <code>{'{CLASS}_{STUDENT}_HP {MONTH}'}</code>
                  </div>
                  <div>
                    <div className="form-label">Ví dụ thực tế</div>
                    <code>
                      {buildTransferNote({ pattern: effectiveConfig.notePattern, className: tuition?.classInfo.className || selectedCls?.className || '', studentName: 'Nguyễn Hữu Phúc', monthKey: batchName })}
                    </code>
                  </div>
                </div>

                <div style={{ marginTop: '1rem', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" onClick={saveConfig} disabled={savingConfig}>
                    {savingConfig ? 'Đang lưu...' : 'Lưu cấu hình QR'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {loading && (
            <div className="loading-state"><div className="spinner" /><span>Đang tính toán học phí...</span></div>
          )}

          {!loading && tuition && (
            <div className="card" style={{ marginTop: '1rem', position: 'relative', zIndex: 10 }}>
              <div
                className="card-header"
                style={{ 
                  display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
                  background: tabMode === 'TREASURER' ? '#e0f2fe' : '#f3f4f6', color: tabMode === 'TREASURER' ? '#0369a1' : '#374151' 
                }}
              >
                <span>{tabMode === 'TREASURER' ? `Bảng thu tiền ${batchName}` : 'Báo cáo tính tiền'} — Lớp {tuition.classInfo.className}</span>
                {tabMode === 'TREASURER' && (<span>Đã thu {fmtCurrency(paidTotal)} / {fmtCurrency(total)}</span>)}
              </div>

              {tabMode === 'TREASURER' && !configReady && (
                <div className="payment-warning">Chưa đủ cấu hình ngân hàng. Kiểm tra lại thông tin cài đặt ngân hàng chung hoặc nhập tài khoản riêng cho lớp.</div>
              )}

              <div className="card-body" style={{ paddingBottom: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', flex: 1, minWidth: '250px' }}>
                    <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                    <input type="text" className="form-control" style={{ paddingLeft: 34 }} placeholder="Tìm kiếm nhanh học sinh (A-Z)..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                  </div>
                  {tabMode === 'TREASURER' && (
                    <button className="btn btn-primary" onClick={handleSyncSepay} style={{ background: '#2563eb', borderColor: '#2563eb', display: 'flex', alignItems: 'center', gap: '8px' }} disabled={loading}>
                      <RefreshCcw size={16} /> Đồng bộ Ngân hàng
                    </button>
                  )}
                  <button className="btn btn-primary" onClick={exportTuitionWord} style={{ background: '#059669', borderColor: '#059669', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={16} /> Xuất Báo cáo Word
                  </button>
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 40, textAlign: 'center' }}>#</th>
                      <th>Học sinh (A-Z)</th>
                      <th style={{ textAlign: 'center' }}>Đã học</th>
                      <th style={{ textAlign: 'center', width: 90 }}>Miễn (%)</th>
                      <th style={{ textAlign: 'right' }}>Học phí</th>
                      <th>Ghi chú</th>
                      {tabMode === 'TREASURER' && (
                        <>
                          <th>Nội dung CK</th>
                          <th style={{ textAlign: 'center' }}>Trạng thái</th>
                          <th style={{ textAlign: 'center' }}>Xác nhận thu</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {processedStudents.map((s: any, index) => {
                      const info = makePaymentInfo(s);
                      const paid = s.paymentStatus === 'PAID';
                      return (
                        <tr key={s.studentId} className={paid && tabMode === 'TREASURER' ? 'row-paid' : undefined} style={{ background: (paid && tabMode === 'TREASURER') ? '#ecfdf5' : '#fff' }}>
                          <td style={{ textAlign: 'center' }}>{index + 1}</td>
                          <td><strong>{s.fullName}</strong></td>
                          <td style={{ textAlign: 'center' }}><span className="badge badge-info">{s.sessionsAttended} buổi</span></td>
                          
                          <td style={{ textAlign: 'center' }}>
                            {tabMode === 'TREASURER' ? (
                              <input 
                                type="number" className="form-control" style={{ padding: '4px', textAlign: 'center', height: '28px', fontSize: '0.9rem' }}
                                defaultValue={s.discount !== undefined ? String(s.discount) : ''} onBlur={(e) => handleUpdateStudentField(s, 'discount', Number(e.target.value) || 0)} placeholder="0"
                              />
                            ) : (
                              <span style={{ fontWeight: 600, color: s.discount ? '#ef4444' : '#9ca3af' }}>{s.discount ? `${s.discount}%` : ''}</span>
                            )}
                          </td>

                          <td style={{ textAlign: 'right', fontWeight: 700, color: tabMode === 'TREASURER' ? 'var(--primary)' : '#111827', fontSize: '1.05rem' }}>
                            {fmtCurrency(s.tuition)}
                          </td>
                          
                          <td>
                            {tabMode === 'TREASURER' ? (
                              <input 
                                type="text" className="form-control" style={{ padding: '4px 8px', height: '28px', fontSize: '0.9rem', minWidth: '120px' }}
                                defaultValue={s.note || ''} onBlur={(e) => handleUpdateStudentField(s, 'note', e.target.value)} placeholder="VD: Khó khăn..."
                              />
                            ) : (
                              <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>{s.note || ''}</span>
                            )}
                          </td>

                          {tabMode === 'TREASURER' && (
                            <>
                              <td><code className="transfer-note" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>{info.transferNote}</code></td>
                              <td style={{ textAlign: 'center' }}>
                                {paid ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                    <span className="badge badge-success">Đã hoàn thành</span>
                                    <span style={{ fontSize: '0.65rem', color: '#059669', fontWeight: 600, background: '#d1fae5', padding: '2px 6px', borderRadius: '4px' }}>
                                      bởi {s.confirmedByName || 'Quản trị'}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="badge badge-warning">Chưa thu</span>
                                )}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                                  {configReady && s.tuition > 0 && (<button className="btn btn-secondary btn-sm" onClick={() => setPreview({ row: s, qrUrl: info.qrUrl, transferNote: info.transferNote })}><QrCode size={14} /> Mã QR</button>)}
                                  {paid ? (
                                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} disabled={savingStudent === s.studentId} onClick={() => setPaid(s, false)}><XCircle size={14} /> Hủy thu</button>
                                  ) : (
                                    <button className="btn btn-primary btn-sm" disabled={savingStudent === s.studentId || s.tuition <= 0} onClick={() => setPaid(s, true)}><CheckCircle2 size={14} /> Đã thu</button>
                                  )}
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                    {processedStudents.length === 0 && (
                      <tr><td colSpan={tabMode === 'TREASURER' ? 9 : 6} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>Không có học sinh nào hoặc không khớp kết quả tìm kiếm.</td></tr>
                    )}
                  </tbody>
                  
                  {processedStudents.length > 0 && (
                    <tfoot>
                      <tr style={{ background: '#f8fafc' }}>
                        <td colSpan={2} style={{ textAlign: 'center', fontWeight: 800 }}>TỔNG CỘNG</td>
                        <td style={{ textAlign: 'center', fontWeight: 800, color: '#0369a1' }}>{sumSessions} buổi</td>
                        <td></td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--primary)', fontSize: '1.1rem' }}>{fmtCurrency(sumTuition)}</td>
                        <td></td>
                        {tabMode === 'TREASURER' && (
                          <>
                            <td></td>
                            <td style={{ textAlign: 'center', fontWeight: 800, color: '#059669' }}>Đã thu: <br/> {fmtCurrency(paidTotal)}</td>
                            <td></td>
                          </>
                        )}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {preview && (
            <div className="overlay" onClick={() => setPreview(null)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>QR học phí — {preview.row.fullName}</h3>
                  <button className="modal-close" onClick={() => setPreview(null)}>×</button>
                </div>
                <div className="modal-body">
                  <div className="qr-preview-card">
                    <img src={preview.qrUrl} alt="QR học phí" />
                    <div>
                      <div className="form-label">Số tiền</div>
                      <h2>{fmtCurrency(preview.row.tuition)}</h2>
                      <div className="form-label">Nội dung chuyển khoản</div>
                      <code>{preview.transferNote}</code>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tabMode === 'PAYROLL' && (
        <>
          <div className="card" style={{ marginBottom: '1rem', border: '2px solid #10b981' }}>
            <div className="card-header" style={{ background: '#ecfdf5', color: '#047857', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calculator size={20} />
              <strong>Tính toán Doanh thu & Tổng hợp Thu nhập từng Giáo viên</strong>
            </div>
            <div className="card-body">
              <div className="form-row" style={{ alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Từ ngày</label>
                  <input className="form-control" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Đến ngày</label>
                  <input className="form-control" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <button className="btn btn-primary" style={{ width: '100%', background: '#059669', borderColor: '#059669', height: '42px', display: 'flex', justifyContent: 'center', gap: 8 }} onClick={generatePayrollReport} disabled={calculatingPayroll}>
                    {calculatingPayroll ? <div className="spinner" style={{width: 16, height: 16}} /> : <Calculator size={16} />}
                    Tính Doanh thu & Lương GV
                  </button>
                </div>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: 8 }}>
                * Hệ thống tự động quét tất cả các lớp có phát sinh điểm danh trong khoảng thời gian trên và gom theo từng giáo viên.<br/>
                * <strong>Thu nhập GV = (Tổng thu - Phí phòng - Trừ khác) - Thuế TNCN (2%)</strong>.
              </p>
            </div>
          </div>

          {payrollData.length > 0 && (
            <>
              {/* Summary Stats Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '1rem' }}>
                <div className="card" style={{ padding: '14px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <DollarSign size={16} /> Tổng doanh thu học sinh
                  </div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#15803d', marginTop: 4 }}>
                    {fmtCurrency(payrollData.reduce((s, r) => s + r.totalRevenue, 0))}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#166534', marginTop: 2 }}>
                    {payrollData.reduce((s, r) => s + r.studentCount, 0)} lượt HS · {payrollData.reduce((s, r) => s + r.totalSessions, 0)} buổi học
                  </div>
                </div>

                <div className="card" style={{ padding: '14px', background: '#fef2f2', border: '1px solid #fecaca' }}>
                  <div style={{ fontSize: '0.8rem', color: '#991b1b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Building2 size={16} /> Tổng phí CSVC & Phòng
                  </div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#b91c1c', marginTop: 4 }}>
                    {fmtCurrency(payrollData.reduce((s, r) => s + r.roomFee, 0))}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#991b1b', marginTop: 2 }}>
                    200.000đ / buổi học
                  </div>
                </div>

                <div className="card" style={{ padding: '14px', background: '#fffbeb', border: '1px solid #fde68a' }}>
                  <div style={{ fontSize: '0.8rem', color: '#92400e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Percent size={16} /> Tổng thuế TNCN (2%)
                  </div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#b45309', marginTop: 4 }}>
                    {fmtCurrency(payrollData.reduce((s, r) => s + r.taxAmount, 0))}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#92400e', marginTop: 2 }}>
                    2% phần doanh thu sau trừ phòng
                  </div>
                </div>

                <div className="card" style={{ padding: '14px', background: '#ecfdf5', border: '2px solid #059669', boxShadow: '0 2px 6px rgba(5, 150, 105, 0.15)' }}>
                  <div style={{ fontSize: '0.8rem', color: '#065f46', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <UserCheck size={16} /> TỔNG THU NHẬP GV (THỰC CHI)
                  </div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#047857', marginTop: 4 }}>
                    {fmtCurrency(payrollData.reduce((s, r) => s + r.netSalary, 0))}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#065f46', marginTop: 2 }}>
                    Chi trả cho {teacherIncomeList.length} giáo viên
                  </div>
                </div>
              </div>

              {/* Navigation & Action Bar */}
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button 
                      className={`btn btn-sm ${payrollSubView === 'BY_TEACHER' ? 'btn-primary' : 'btn-secondary'}`}
                      style={payrollSubView === 'BY_TEACHER' ? { background: '#059669', borderColor: '#059669', display: 'flex', alignItems: 'center', gap: 6 } : { display: 'flex', alignItems: 'center', gap: 6 }}
                      onClick={() => setPayrollSubView('BY_TEACHER')}
                    >
                      <Users size={15} /> Tổng hợp theo Giáo viên ({teacherIncomeList.length})
                    </button>
                    <button 
                      className={`btn btn-sm ${payrollSubView === 'BY_CLASS' ? 'btn-primary' : 'btn-secondary'}`}
                      style={payrollSubView === 'BY_CLASS' ? { background: '#0284c7', borderColor: '#0284c7', display: 'flex', alignItems: 'center', gap: 6 } : { display: 'flex', alignItems: 'center', gap: 6 }}
                      onClick={() => setPayrollSubView('BY_CLASS')}
                    >
                      <Layers size={15} /> Chi tiết theo Lớp học ({payrollData.length})
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary btn-sm" onClick={exportTeacherIncomeExcel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FileSpreadsheet size={15} /> Xuất Excel Thu nhập GV
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={exportMegaPayrollExcel} style={{ background: '#0284c7', borderColor: '#0284c7', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Download size={15} /> Xuất Excel Đa trang (Tất cả Lớp & GV)
                    </button>
                  </div>
                </div>
              </div>

              {/* View 1: Grouped by Teacher */}
              {payrollSubView === 'BY_TEACHER' && (
                <div className="card">
                  <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <strong style={{ fontSize: '1rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Users size={18} color="#059669" /> Bảng Tổng Hợp Thu Nhập Từng Giáo Viên
                    </strong>
                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                      Tổng: {teacherIncomeList.length} giáo viên
                    </span>
                  </div>
                  <div className="table-wrap">
                    <table className="gradebook-table">
                      <thead>
                        <tr>
                          <th style={{ width: 40, textAlign: 'center' }}>#</th>
                          <th>Giáo viên</th>
                          <th>Các lớp phụ trách</th>
                          <th style={{ textAlign: 'center', width: 75 }}>Số buổi</th>
                          <th style={{ textAlign: 'center', width: 70 }}>Lượt HS</th>
                          <th style={{ textAlign: 'right' }}>Tổng thu HS</th>
                          <th style={{ textAlign: 'right' }}>Trừ: Phí CSVC</th>
                          <th style={{ textAlign: 'right' }}>Trừ: Thuế (2%)</th>
                          <th style={{ textAlign: 'right' }}>Trừ: Khác</th>
                          <th style={{ textAlign: 'right', color: '#059669', background: '#ecfdf5' }}>TỔNG THU NHẬP GV</th>
                          <th style={{ textAlign: 'center', width: 140 }}>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teacherIncomeList.map((t, idx) => (
                          <tr key={t.teacherId}>
                            <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{t.teacherName}</strong>
                                {t.email && <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{t.email}</span>}
                              </div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {t.classList.map((c) => (
                                  <span 
                                    key={c.classId} 
                                    className="badge badge-info" 
                                    style={{ fontSize: '0.75rem', padding: '3px 7px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}
                                  >
                                    {c.className} ({c.totalSessions}b)
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: 600 }}>{t.totalSessions}</td>
                            <td style={{ textAlign: 'center' }}><span className="badge badge-info">{t.totalStudents}</span></td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--primary)' }}>{fmtCurrency(t.totalRevenue)}</td>
                            <td style={{ textAlign: 'right', color: '#b91c1c' }}>{fmtCurrency(t.totalRoomFee)}</td>
                            <td style={{ textAlign: 'right', color: '#b45309' }}>{fmtCurrency(t.totalTaxAmount)}</td>
                            <td style={{ textAlign: 'right', color: '#6b7280' }}>{fmtCurrency(t.totalOtherDeductions)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 800, color: '#047857', fontSize: '1.1rem', background: '#ecfdf5' }}>
                              {fmtCurrency(t.totalNetIncome)}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                                <button 
                                  className="btn btn-ghost btn-sm" 
                                  style={{ color: '#0284c7', padding: '4px 6px' }}
                                  onClick={() => setSelectedTeacherForModal(t)}
                                  title="Xem chi tiết từng lớp của giáo viên này"
                                >
                                  <Eye size={15} />
                                </button>
                                <button 
                                  className="btn btn-ghost btn-sm" 
                                  style={{ color: '#059669', padding: '4px 6px' }}
                                  onClick={() => exportSingleTeacherIncomeWord(t)}
                                  title="Tải Phiếu Thu Nhập file Word"
                                >
                                  <FileText size={15} />
                                </button>
                                <button 
                                  className="btn btn-ghost btn-sm" 
                                  style={{ color: '#0d9488', padding: '4px 6px' }}
                                  onClick={() => exportSingleTeacherIncomeExcel(t)}
                                  title="Tải Bảng Thu Nhập file Excel"
                                >
                                  <Download size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: '#f8fafc' }}>
                          <td colSpan={3} style={{ textAlign: 'center', fontWeight: 800 }}>TỔNG CỘNG TẤT CẢ GIÁO VIÊN</td>
                          <td style={{ textAlign: 'center', fontWeight: 800, color: '#0369a1' }}>{teacherIncomeList.reduce((s, t) => s + t.totalSessions, 0)}</td>
                          <td style={{ textAlign: 'center', fontWeight: 800, color: '#0369a1' }}>{teacherIncomeList.reduce((s, t) => s + t.totalStudents, 0)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--primary)' }}>{fmtCurrency(teacherIncomeList.reduce((s, t) => s + t.totalRevenue, 0))}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: '#ef4444' }}>{fmtCurrency(teacherIncomeList.reduce((s, t) => s + t.totalRoomFee, 0))}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: '#ef4444' }}>{fmtCurrency(teacherIncomeList.reduce((s, t) => s + t.totalTaxAmount, 0))}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: '#ef4444' }}>{fmtCurrency(teacherIncomeList.reduce((s, t) => s + t.totalOtherDeductions, 0))}</td>
                          <td style={{ textAlign: 'right', fontWeight: 900, color: '#047857', fontSize: '1.2rem', background: '#d1fae5' }}>
                            {fmtCurrency(teacherIncomeList.reduce((s, t) => s + t.totalNetIncome, 0))}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* View 2: Grouped by Class */}
              {payrollSubView === 'BY_CLASS' && (
                <div className="card">
                  <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <strong style={{ fontSize: '1rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Layers size={18} color="#0284c7" /> Chi Tiết Từng Lớp Học (Có thể điều chỉnh chi phí)
                    </strong>
                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                      Tổng: {payrollData.length} lớp học
                    </span>
                  </div>
                  <div className="table-wrap">
                    <table className="gradebook-table">
                      <thead>
                        <tr>
                          <th style={{ width: 40, textAlign: 'center' }}>#</th>
                          <th>Lớp</th>
                          <th>Giáo viên</th>
                          <th style={{ textAlign: 'center', width: 70 }}>Số HS</th>
                          <th style={{ textAlign: 'center', width: 80 }}>Số buổi</th>
                          <th style={{ textAlign: 'right' }}>Tổng thu HS</th>
                          <th style={{ textAlign: 'center', width: 130 }}>Trừ: Phí CSVC</th>
                          <th style={{ textAlign: 'center', width: 130 }}>Trừ: Thuế (2%)</th>
                          <th style={{ textAlign: 'center', width: 130 }}>Trừ: Khác</th>
                          <th style={{ textAlign: 'right', color: '#059669' }}>Lương GV nhận</th>
                          <th style={{ textAlign: 'center', width: 100 }}>Chi tiết</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payrollData.map((row, idx) => (
                          <tr key={row.classId}>
                            <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                            <td><strong>{row.className}</strong></td>
                            <td><span className="badge badge-teacher">{row.teacherName}</span></td>
                            <td style={{ textAlign: 'center' }}><span className="badge badge-info">{row.studentCount}</span></td>
                            <td style={{ textAlign: 'center' }}>{row.totalSessions}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--primary)' }}>{fmtCurrency(row.totalRevenue)}</td>
                            
                            <td style={{ textAlign: 'center' }}>
                              <input 
                                type="number" className="form-control" style={{ textAlign: 'right', fontSize: '0.85rem', padding: '4px' }}
                                defaultValue={row.roomFee !== undefined ? String(row.roomFee) : ''} 
                                onBlur={(e) => handlePayrollUpdate(row.classId, 'roomFee', Number(e.target.value) || 0)}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input 
                                type="number" className="form-control" style={{ textAlign: 'right', fontSize: '0.85rem', padding: '4px' }}
                                value={row.taxAmount !== undefined ? String(row.taxAmount) : ''} 
                                onChange={(e) => handlePayrollUpdate(row.classId, 'taxAmount', Number(e.target.value) || 0)}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input 
                                type="number" className="form-control" style={{ textAlign: 'right', fontSize: '0.85rem', padding: '4px' }}
                                defaultValue={row.otherDeductions !== undefined ? String(row.otherDeductions) : ''} 
                                onBlur={(e) => handlePayrollUpdate(row.classId, 'otherDeductions', Number(e.target.value) || 0)}
                              />
                            </td>
                            
                            <td style={{ textAlign: 'right', fontWeight: 800, color: '#059669', fontSize: '1.05rem' }}>
                              {fmtCurrency(row.netSalary)}
                            </td>

                            <td style={{ textAlign: 'center' }}>
                              <button 
                                className="btn btn-ghost btn-sm" 
                                style={{ color: '#0369a1', padding: '4px 8px' }}
                                onClick={() => exportSingleClassExcel(row)}
                                title="Tải phiếu lương riêng cho lớp này"
                              >
                                <Download size={14} /> Tải Phiếu
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: '#f8fafc' }}>
                          <td colSpan={3} style={{ textAlign: 'center', fontWeight: 800 }}>TỔNG CỘNG HỆ THỐNG</td>
                          <td style={{ textAlign: 'center', fontWeight: 800, color: '#0369a1' }}>{payrollData.reduce((s, r) => s + r.studentCount, 0)}</td>
                          <td style={{ textAlign: 'center', fontWeight: 800, color: '#0369a1' }}>{payrollData.reduce((s, r) => s + r.totalSessions, 0)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--primary)' }}>{fmtCurrency(payrollData.reduce((s, r) => s + r.totalRevenue, 0))}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: '#ef4444' }}>{fmtCurrency(payrollData.reduce((s, r) => s + r.roomFee, 0))}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: '#ef4444' }}>{fmtCurrency(payrollData.reduce((s, r) => s + r.taxAmount, 0))}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: '#ef4444' }}>{fmtCurrency(payrollData.reduce((s, r) => s + r.otherDeductions, 0))}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: '#059669', fontSize: '1.15rem' }}>{fmtCurrency(payrollData.reduce((s, r) => s + r.netSalary, 0))}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Teacher Detail Breakdown Modal */}
          {selectedTeacherForModal && (
            <div className="overlay" onClick={() => setSelectedTeacherForModal(null)}>
              <div className="modal" style={{ maxWidth: '850px' }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header" style={{ background: '#ecfdf5', color: '#065f46' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Users size={20} />
                    <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Chi tiết Thu nhập — {selectedTeacherForModal.teacherName}</h3>
                  </div>
                  <button className="modal-close" onClick={() => setSelectedTeacherForModal(null)}>×</button>
                </div>
                <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
                  <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                      <div>
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Giáo viên:</span>
                        <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>{selectedTeacherForModal.teacherName}</div>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Thời gian tính:</span>
                        <div style={{ fontWeight: 600 }}>{formatDate(startDate)} → {formatDate(endDate)}</div>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Tổng số lớp phụ trách:</span>
                        <div style={{ fontWeight: 600 }}>{selectedTeacherForModal.totalClasses} lớp ({selectedTeacherForModal.totalSessions} buổi)</div>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.8rem', color: '#047857', fontWeight: 600 }}>TỔNG THU NHẬP THỰC NHẬN:</span>
                        <div style={{ fontWeight: 900, fontSize: '1.25rem', color: '#047857' }}>{fmtCurrency(selectedTeacherForModal.totalNetIncome)}</div>
                      </div>
                    </div>
                  </div>

                  <h4 style={{ marginBottom: 8, color: '#0f172a' }}>1. Tổng hợp theo từng lớp</h4>
                  <table className="gradebook-table" style={{ marginBottom: 20 }}>
                    <thead>
                      <tr>
                        <th>Tên Lớp</th>
                        <th style={{ textAlign: 'center' }}>Số HS</th>
                        <th style={{ textAlign: 'center' }}>Số buổi</th>
                        <th style={{ textAlign: 'right' }}>Doanh thu HS</th>
                        <th style={{ textAlign: 'right' }}>Phí CSVC</th>
                        <th style={{ textAlign: 'right' }}>Thuế (2%)</th>
                        <th style={{ textAlign: 'right' }}>Trừ khác</th>
                        <th style={{ textAlign: 'right', color: '#059669' }}>Lương thực nhận</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTeacherForModal.classList.map((c) => (
                        <tr key={c.classId}>
                          <td><strong>{c.className}</strong></td>
                          <td style={{ textAlign: 'center' }}>{c.studentCount}</td>
                          <td style={{ textAlign: 'center' }}>{c.totalSessions}</td>
                          <td style={{ textAlign: 'right' }}>{fmtCurrency(c.totalRevenue)}</td>
                          <td style={{ textAlign: 'right', color: '#b91c1c' }}>{fmtCurrency(c.roomFee)}</td>
                          <td style={{ textAlign: 'right', color: '#b45309' }}>{fmtCurrency(c.taxAmount)}</td>
                          <td style={{ textAlign: 'right', color: '#6b7280' }}>{fmtCurrency(c.otherDeductions)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: '#047857' }}>{fmtCurrency(c.netSalary)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                        <td>TỔNG CỘNG</td>
                        <td style={{ textAlign: 'center' }}>{selectedTeacherForModal.totalStudents}</td>
                        <td style={{ textAlign: 'center' }}>{selectedTeacherForModal.totalSessions}</td>
                        <td style={{ textAlign: 'right' }}>{fmtCurrency(selectedTeacherForModal.totalRevenue)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtCurrency(selectedTeacherForModal.totalRoomFee)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtCurrency(selectedTeacherForModal.totalTaxAmount)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtCurrency(selectedTeacherForModal.totalOtherDeductions)}</td>
                        <td style={{ textAlign: 'right', color: '#047857', fontSize: '1.1rem' }}>{fmtCurrency(selectedTeacherForModal.totalNetIncome)}</td>
                      </tr>
                    </tfoot>
                  </table>

                  <h4 style={{ marginBottom: 8, color: '#0f172a' }}>2. Chi tiết học sinh theo từng lớp</h4>
                  {selectedTeacherForModal.classList.map((c) => {
                    const sList = payrollDetails[c.classId] || [];
                    return (
                      <div key={c.classId} style={{ marginBottom: 16 }}>
                        <div style={{ fontWeight: 700, color: '#0369a1', marginBottom: 6, fontSize: '0.9rem' }}>
                          • Lớp: {c.className} ({sList.length} học sinh)
                        </div>
                        <table className="gradebook-table" style={{ fontSize: '0.85rem' }}>
                          <thead>
                            <tr>
                              <th style={{ width: 35, textAlign: 'center' }}>#</th>
                              <th>Họ và tên học sinh</th>
                              <th style={{ textAlign: 'center', width: 75 }}>Số buổi</th>
                              <th style={{ textAlign: 'center', width: 75 }}>Miễn giảm</th>
                              <th style={{ textAlign: 'right', width: 120 }}>Thành tiền</th>
                              <th>Ghi chú</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sList.length === 0 ? (
                              <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af' }}>Không có học sinh điểm danh</td></tr>
                            ) : (
                              sList.map((s: any, sIdx: number) => (
                                <tr key={sIdx}>
                                  <td style={{ textAlign: 'center' }}>{sIdx + 1}</td>
                                  <td><strong>{s.name}</strong></td>
                                  <td style={{ textAlign: 'center' }}>{s.attended}</td>
                                  <td style={{ textAlign: 'center' }}>{s.discount ? `${s.discount}%` : '—'}</td>
                                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(s.tuition)}</td>
                                  <td>{s.note || '—'}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
                <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#f8fafc' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" style={{ background: '#059669', borderColor: '#059669', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => exportSingleTeacherIncomeWord(selectedTeacherForModal)}>
                      <FileText size={15} /> Xuất Phiếu Thu Nhập Word
                    </button>
                    <button className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => exportSingleTeacherIncomeExcel(selectedTeacherForModal)}>
                      <Download size={15} /> Xuất Excel
                    </button>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => setSelectedTeacherForModal(null)}>Đóng</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
}
