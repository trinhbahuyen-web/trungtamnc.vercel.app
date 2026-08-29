import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { Users, Copy, Pencil, Trash2, Wallet, Upload, FileDown, MessageSquare } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  getClasses,
  getStudents,
  getClassRoster,
  addStudent,
  updateStudent,
  deleteStudent,
  deleteStudents,
  importStudents,
} from '../services/dataService';
import { ClassItem, Student, Status, Role } from '../types';
import Modal from '../components/Modal';

interface FormState {
  fullName: string;
  studentClass: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  note: string;
  status: Status;
}

const EMPTY: FormState = {
  fullName: '',
  studentClass: '',
  parentName: '',
  parentPhone: '',
  parentEmail: '',
  note: '',
  status: 'ACTIVE',
};

const TEMPLATE_HEADERS = [
  'Họ tên học sinh *',
  'Lớp hành chính *',
  'Tên phụ huynh',
  'SĐT phụ huynh * (Mất số 0 hệ thống tự bù)',
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

async function parseStudentExcel(file: File): Promise<FormState[]> {
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

export default function Students() {
  const { user } = useAuth();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isAdmin = user?.role === Role.ADMIN;

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [enrollmentMap, setEnrollmentMap] = useState<Record<string, string[]>>({});
  const [isMapLoading, setIsMapLoading] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filterType, setFilterType] = useState('ALL'); 
  
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importClassId, setImportClassId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestData, setRequestData] = useState({ studentId: '', message: '' });
  const [sendingRequest, setSendingRequest] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function loadData() {
    try {
      const stu = await getStudents();
      setStudents(stu);

      if (user) {
        const cls = await getClasses(user);
        setClasses(cls);

        if (isAdmin) {
          setIsMapLoading(true);
          setEnrollmentMap({});
          const map: Record<string, string[]> = {};
          
          const fetchMap = async () => {
            for (let i = 0; i < cls.length; i += 5) {
              const chunk = cls.slice(i, i + 5);
              await Promise.all(
                chunk.map(async (c) => {
                  try {
                    const roster = await getClassRoster(c.id);
                    roster.forEach((s) => {
                      if (!map[s.id]) map[s.id] = [];
                      map[s.id].push(c.className);
                    });
                  } catch (err) {
                    console.error(`Lỗi tải danh sách lớp ${c.className}`, err);
                  }
                })
              );
            }
            setEnrollmentMap({ ...map });
            setIsMapLoading(false);
          };
          fetchMap();
        }
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi tải dữ liệu', 'error');
    } finally {
      setLoading(false);
    }
  }

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY);
    setShowModal(true);
  };

  const openEdit = (s: Student) => {
    setEditing(s);
    setForm({
      fullName: s.fullName,
      studentClass: s.studentClass,
      parentName: s.parentName,
      parentPhone: s.parentPhone,
      parentEmail: s.parentEmail,
      note: s.note,
      status: s.status,
    });
    setShowModal(true);
  };

  const handleDelete = async (s: Student) => {
    if (!window.confirm(`Xóa học sinh "${s.fullName}"? Toàn bộ dữ liệu liên quan sẽ bị xóa.`)) return;
    try {
      await deleteStudent(s.id);
      toast('Đã xóa học sinh', 'success');
      setStudents((prev) => prev.filter((x) => x.id !== s.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(s.id);
        return next;
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi xóa', 'error');
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) {
      toast('Chưa chọn học sinh nào', 'warning');
      return;
    }

    if (!window.confirm(`Xóa ${ids.length} học sinh đã chọn? Toàn bộ dữ liệu sẽ bị xóa.`)) return;

    try {
      await deleteStudents(ids);
      toast(`Đã xóa ${ids.length} học sinh`, 'success');
      setStudents((prev) => prev.filter((s) => !selectedIds.has(s.id)));
      setSelectedIds(new Set());
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi xóa nhiều học sinh', 'error');
    }
  };

  const save = async () => {
    if (!form.fullName.trim() || !form.parentPhone.trim() || !form.studentClass.trim()) {
      toast('Vui lòng nhập đầy đủ Họ tên, Lớp và SĐT phụ huynh (Các mục có dấu *)', 'warning');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateStudent(editing.id, form);
        toast('Đã cập nhật học sinh');
        setStudents((prev) =>
          prev.map((s) => (s.id === editing.id ? { ...s, ...form } : s))
        );
      } else {
        const ref = await addStudent(form);
        toast('Đã thêm học sinh mới');
        setStudents((prev) =>
          [...prev, { id: ref.id, ...form }].sort((a, b) =>
            a.fullName.localeCompare(b.fullName)
          )
        );
      }
      setShowModal(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi lưu', 'error');
    } finally {
      setSaving(false);
    }
  };

  const submitRequest = async () => {
    if (!requestData.studentId || !requestData.message.trim()) {
      toast('Vui lòng chọn học sinh và nhập nội dung cần sửa', 'warning');
      return;
    }
    setSendingRequest(true);
    try {
      const stu = students.find(s => s.id === requestData.studentId);
      if (!stu || !user) return;

      await addDoc(collection(db, 'editRequests'), {
        studentId: stu.id,
        studentName: stu.fullName,
        teacherId: user.id,
        teacherName: user.name,
        message: requestData.message,
        status: 'PENDING',
        createdAt: new Date().toISOString()
      });
      toast('Đã gửi yêu cầu cho Quản lý thành công!', 'success');
      setShowRequestModal(false);
      setRequestData({ studentId: '', message: '' });
    } catch(e) {
      toast('Lỗi khi gửi yêu cầu', 'error');
    } finally {
      setSendingRequest(false);
    }
  };

  const handleImportExcel = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImporting(true);
    try {
      const allRows = await parseStudentExcel(file);
      
      if (allRows.length === 0) {
        toast('File Excel không có dữ liệu học sinh', 'warning');
        setImporting(false);
        return;
      }

      const invalidRows = allRows.filter(r => {
        const hasName = r.fullName.trim().length > 0;
        const hasClass = r.studentClass.trim().length > 0;
        const isValidPhone = r.parentPhone.length === 10;
        
        return !hasName || !hasClass || !isValidPhone;
      });
      
      if (invalidRows.length > 0) {
        toast(`LỖI: Phát hiện ${invalidRows.length} học sinh bị thiếu thông tin hoặc SĐT không đúng 10 số. Vui lòng sửa file Excel!`, 'error');
        setImporting(false);
        return; 
      }

      const result = await importStudents(allRows, importClassId || undefined);
      const latest = await getStudents();
      setStudents(latest);

      const targetClass = classes.find((c) => c.id === importClassId);
      const classText = targetClass ? `, đã đưa vào lớp ${targetClass.className}` : '';

      toast(
        `Import thành công: tạo mới ${result.created}, đã có sẵn ${result.existed}, bỏ qua ${result.skipped}${classText}`,
        result.errors.length ? 'warning' : 'success'
      );
      
      loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Lỗi import Excel', 'error');
    } finally {
      setImporting(false);
    }
  };

  let filtered = students.filter((s) => {
    if (!q.trim()) return true;

    const exactSearchString = removeAccents(q).replace(/\s+/g, '');
    const searchTerms = removeAccents(q).split(/\s+/).filter(Boolean);

    const targetNameNoSpace = removeAccents(s.fullName || '').replace(/\s+/g, '');
    const targetClassNoSpace = removeAccents(s.studentClass || '').replace(/\s+/g, '');
    const targetPhone = s.parentPhone || '';
    const targetId = (s.id || '').toLowerCase();

    if (
      targetNameNoSpace.includes(exactSearchString) ||
      targetClassNoSpace.includes(exactSearchString) ||
      targetPhone.includes(exactSearchString) ||
      targetId.includes(exactSearchString)
    ) {
      return true;
    }

    const matchAllWords = searchTerms.every(word => targetNameNoSpace.includes(word));
    if (matchAllWords) return true;

    return false;
  });

  if (filterType === 'NO_CLASS' && isAdmin) {
    filtered = filtered.filter(s => !enrollmentMap[s.id] || enrollmentMap[s.id].length === 0);
  } else if (filterType === 'DUPLICATES') {
    const dupKeys = new Set<string>();
    const seen = new Set<string>();
    students.forEach(s => {
      const key = `${s.fullName.trim().toLowerCase()}-${(s.parentPhone || '').trim()}`;
      if (seen.has(key)) dupKeys.add(key);
      seen.add(key);
    });
    filtered = filtered.filter(s => {
      const key = `${s.fullName.trim().toLowerCase()}-${(s.parentPhone || '').trim()}`;
      return dupKeys.has(key);
    });
  } else if (filterType === 'MISSING_CLASS') {
    filtered = filtered.filter(s => !s.studentClass || s.studentClass.trim() === '');
  } else if (filterType === 'MISSING_PHONE') {
    filtered = filtered.filter(s => !s.parentPhone || s.parentPhone.trim() === '');
  }

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((s) => selectedIds.has(s.id));

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((s) => next.delete(s.id));
      else filtered.forEach((s) => next.add(s.id));
      return next;
    });
  };

  const parentLink = (sid: string) => `${window.location.origin}/parent/${sid}`;
  const payLink = (sid: string) => `${window.location.origin}/pay/${sid}`;

  const copyLink = (sid: string) => {
    navigator.clipboard?.writeText(parentLink(sid));
    toast('Đã sao chép link phụ huynh');
  };

  const copyPayLink = (sid: string) => {
    navigator.clipboard?.writeText(payLink(sid));
    toast('Đã sao chép link thanh toán học phí');
  };

  if (loading) return <div className="loading-state"><div className="spinner" /><span>Đang tải...</span></div>;

  return (
    <div className="fade-up">
      <div className="page-header">
        <div>
          <h1 className="page-title"><Users size={26} /> <span>Học sinh</span></h1>
          <p className="page-sub">{students.length} học sinh đã đăng ký</p>
        </div>
      </div>

      <div className="filter-bar" style={{ flexWrap: 'wrap' }}>
        <input
          className="search-box"
          placeholder="Tìm theo tên, lớp, SĐT, mã..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        
        <select
          className="form-select"
          style={{ maxWidth: 220 }}
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="ALL">Lọc: Tất cả học sinh</option>
          {isAdmin && <option value="NO_CLASS">Lọc: Chưa xếp lớp học thêm</option>}
          <option value="MISSING_CLASS">Lọc: Thiếu lớp hành chính</option>
          <option value="MISSING_PHONE">Lọc: Thiếu SĐT phụ huynh</option>
          <option value="DUPLICATES">Lọc: Trùng lặp (Tên+SĐT)</option>
        </select>

        {isAdmin && (
          <>
            <select
              className="form-select"
              style={{ maxWidth: 260 }}
              value={importClassId}
              onChange={(e) => setImportClassId(e.target.value)}
              title="Chọn lớp nếu muốn import và xếp lớp luôn"
            >
              <option value="">Import: chỉ thêm học sinh</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  Import vào lớp {c.className}
                </option>
              ))}
            </select>
            <button className="btn btn-secondary" onClick={downloadStudentTemplate}><FileDown size={16} /> Tải file mẫu</button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={handleImportExcel} />
            <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={importing}>
              <Upload size={16} /> {importing ? 'Đang import...' : 'Import Excel'}
            </button>
          </>
        )}

        {/* NÚT THÊM HỌC SINH MỚI: MỞ CHO CẢ ADMIN VÀ GIÁO VIÊN */}
        <button className="btn btn-primary" onClick={openAdd}>+ Thêm học sinh</button>

        {!isAdmin && (
          <button 
            className="btn btn-primary" 
            style={{ background: '#f59e0b', borderColor: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }} 
            onClick={() => setShowRequestModal(true)}
          >
            <MessageSquare size={16} /> Gửi yêu cầu sửa HS
          </button>
        )}
      </div>

      {isAdmin && selectedIds.size > 0 && (
        <div className="card" style={{ marginBottom: 12, borderColor: 'rgba(239,68,68,0.25)' }}>
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <strong>Đã chọn {selectedIds.size} học sinh</strong>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set())}>Bỏ chọn</button>
              <button className="btn btn-danger btn-sm" onClick={handleBulkDelete}><Trash2 size={14} /> Xóa học sinh đã chọn</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        {filtered.length === 0 ? (
          <div className="card-body">
            <div className="empty-state">
              <div className="empty-icon"><Users size={40} /></div>
              <h3>{q || filterType !== 'ALL' ? 'Không tìm thấy học sinh phù hợp bộ lọc' : 'Chưa có học sinh'}</h3>
              <p>{(!q && filterType === 'ALL') && 'Nhấn "+ Thêm học sinh" để bắt đầu'}</p>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {isAdmin && (
                    <th style={{ width: 42 }}>
                      <input type="checkbox" checked={allFilteredSelected} onChange={toggleAllFiltered} title="Chọn tất cả học sinh đang lọc" />
                    </th>
                  )}
                  <th>Mã</th>
                  <th>Họ tên</th>
                  <th>Lớp HC</th>
                  {isAdmin && <th>Các lớp đang học</th>}
                  <th>Phụ huynh</th>
                  <th>SĐT</th>
                  <th>Trạng thái</th>
                  <th>Link chia sẻ</th>
                  {isAdmin && <th>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    {isAdmin && (
                      <td>
                        <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleOne(s.id)} />
                      </td>
                    )}
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{s.id.slice(0, 8)}</span>
                    </td>
                    <td>
                      <strong>{s.fullName}</strong>
                      {s.note && <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{s.note}</div>}
                    </td>
                    <td>
                      <span className="badge" style={{ background: 'var(--bg-light)', color: 'var(--text)' }}>{s.studentClass || '—'}</span>
                    </td>
                    {isAdmin && (
                      <td>
                        {isMapLoading ? (
                          <span style={{ fontSize: '0.8rem', color: '#6b7280', fontStyle: 'italic' }}>Đang quét...</span>
                        ) : enrollmentMap[s.id] && enrollmentMap[s.id].length > 0 ? (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {enrollmentMap[s.id].map(cName => (
                              <span key={cName} className="badge badge-info" style={{ fontSize: '0.75rem' }}>{cName}</span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: '#ef4444', fontStyle: 'italic' }}>Chưa xếp lớp</span>
                        )}
                      </td>
                    )}
                    <td>{s.parentName || '—'}</td>
                    <td>{s.parentPhone || '—'}</td>
                    <td>
                      <span className={`badge ${s.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}`}>
                        {s.status === 'ACTIVE' ? 'Đang học' : 'Nghỉ'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => copyLink(s.id)} title="Link báo cáo cho phụ huynh"><Copy size={14} /> Báo cáo</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--primary)' }} onClick={() => copyPayLink(s.id)} title="Link thanh toán học phí"><Wallet size={14} /> Học phí</button>
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(s)}><Pencil size={14} /> Sửa</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', marginLeft: 4 }} onClick={() => handleDelete(s)}><Trash2 size={14} /> Xóa</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL THÊM HỌC SINH MỚI: MỞ CHO CẢ ADMIN VÀ GIÁO VIÊN */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Sửa thông tin học sinh' : 'Thêm học sinh mới'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Hủy</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
          </>
        }
      >
        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}>
            <label className="form-label">Họ tên học sinh <span style={{ color: '#ef4444' }}>*</span></label>
            <input className="form-control" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} placeholder="Nguyễn Văn A" autoFocus />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Lớp hành chính <span style={{ color: '#ef4444' }}>*</span></label>
            <input className="form-control" value={form.studentClass} onChange={(e) => setForm((f) => ({ ...f, studentClass: e.target.value }))} placeholder="12A1" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Tên phụ huynh</label>
            <input className="form-control" value={form.parentName} onChange={(e) => setForm((f) => ({ ...f, parentName: e.target.value }))} placeholder="Nguyễn Văn B" />
          </div>
          <div className="form-group">
            <label className="form-label">SĐT phụ huynh <span style={{ color: '#ef4444' }}>*</span></label>
            <input className="form-control" type="tel" value={form.parentPhone} onChange={(e) => setForm((f) => ({ ...f, parentPhone: e.target.value }))} placeholder="0901..." />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Email phụ huynh</label>
            <input className="form-control" type="email" value={form.parentEmail} onChange={(e) => setForm((f) => ({ ...f, parentEmail: e.target.value }))} placeholder="email@gmail.com" />
          </div>
          {editing && isAdmin && (
            <div className="form-group">
              <label className="form-label">Trạng thái</label>
              <select className="form-select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Status }))}>
                <option value="ACTIVE">Đang học</option>
                <option value="INACTIVE">Nghỉ học</option>
              </select>
            </div>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">Ghi chú</label>
          <input className="form-control" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Ghi chú thêm..." />
        </div>
      </Modal>

      <Modal
        open={showRequestModal}
        onClose={() => setShowRequestModal(false)}
        title="Gửi yêu cầu cập nhật thông tin"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowRequestModal(false)}>Hủy</button>
            <button className="btn btn-primary" onClick={submitRequest} disabled={sendingRequest}>
              {sendingRequest ? 'Đang gửi...' : 'Gửi cho Quản lý'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">1. Chọn học sinh cần sửa <span style={{color: '#ef4444'}}>*</span></label>
          <select 
            className="form-select" 
            value={requestData.studentId} 
            onChange={(e) => setRequestData({...requestData, studentId: e.target.value})}
          >
            <option value="">-- Bấm để chọn học sinh --</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>
                {s.fullName} {s.studentClass ? `(${s.studentClass})` : ''} - SĐT: {s.parentPhone || 'Chưa có'}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">2. Nội dung yêu cầu thay đổi <span style={{color: '#ef4444'}}>*</span></label>
          <textarea 
            className="form-control" 
            rows={3} 
            placeholder="Ví dụ: Thầy/Cô đổi lại giúp em số điện thoại phụ huynh bé thành 0987.xxx.xxx nhé." 
            value={requestData.message} 
            onChange={(e) => setRequestData({...requestData, message: e.target.value})}
          ></textarea>
        </div>
      </Modal>

    </div>
  );
}
