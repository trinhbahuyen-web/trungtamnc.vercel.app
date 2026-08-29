import { useState, useEffect } from 'react';
import { CheckSquare, ClipboardList, Save, Check, X, FileText, Search, FileSpreadsheet, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { db } from '../config/firebase';
import { collection, getDocs, query, where, writeBatch } from 'firebase/firestore'; 
import * as XLSX from 'xlsx';

import {
  getClasses,
  getClassRoster,
  getAttendance,
  markAttendance,
  fmtDate,
  todayStr,
} from '../services/dataService';
import { ClassItem, Student } from '../types';

interface RecordState {
  present: boolean;
  note: string;
}

function getFirstName(fullName: string) {
  if (!fullName) return '';
  const parts = fullName.trim().split(' ');
  return parts[parts.length - 1];
}

export default function Attendance() {
  const { user } = useAuth();
  const toast = useToast();

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [date, setDate] = useState(todayStr());
  const [roster, setRoster] = useState<Student[]>([]);
  const [records, setRecords] = useState<Record<string, RecordState>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rosterLoaded, setRosterLoaded] = useState(false);
  const [hasSavedData, setHasSavedData] = useState(false); // TRẠNG THÁI: Lớp này đã lưu điểm danh chưa?

  const [classSearchTerm, setClassSearchTerm] = useState('');
  const [isClassDropdownOpen, setIsClassDropdownOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    getClasses(user)
      .then((d) => setClasses(d))
      .catch((e) => toast(e instanceof Error ? e.message : 'Lỗi tải lớp', 'error'));
  }, [user, toast]);

  useEffect(() => {
    if (selectedClass && date) loadRosterAndAttendance();
  }, [selectedClass, date]);

  async function loadRosterAndAttendance() {
    setLoading(true);
    setRosterLoaded(false);
    try {
      const [studentList, att] = await Promise.all([
        getClassRoster(selectedClass),
        getAttendance(selectedClass, date),
      ]);
      
      const sortedStudentList = [...studentList].sort((a, b) => {
        const nameA = getFirstName(a.fullName);
        const nameB = getFirstName(b.fullName);
        const cmp = nameA.localeCompare(nameB, 'vi', { sensitivity: 'base' });
        if (cmp !== 0) return cmp;
        return a.fullName.localeCompare(b.fullName, 'vi', { sensitivity: 'base' });
      });

      setRoster(sortedStudentList);
      
      const map: Record<string, RecordState> = {};
      sortedStudentList.forEach((s) => {
        const existing = att.find((a) => a.studentId === s.id);
        map[s.id] = {
          present: existing ? existing.present : true,
          note: existing?.note || '',
        };
      });
      setRecords(map);
      setHasSavedData(att.length > 0); // Kiểm tra xem đã có dữ liệu lưu trong DB chưa
      setRosterLoaded(true);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi', 'error');
    } finally {
      setLoading(false);
    }
  }

  function toggleAll(val: boolean) {
    setRecords((prev) => {
      const next = { ...prev };
      roster.forEach((s) => {
        next[s.id] = { ...next[s.id], present: val };
      });
      return next;
    });
  }

  async function save() {
    if (!selectedClass) {
      toast('Chọn lớp trước', 'warning');
      return;
    }
    setSaving(true);
    try {
      const arr = roster.map((s) => ({
        studentId: s.id,
        present: records[s.id]?.present ?? true,
        note: records[s.id]?.note || '',
      }));
      await markAttendance(selectedClass, date, arr);
      toast(
        `Đã lưu điểm danh ${arr.filter((r) => r.present).length}/${roster.length} học sinh`, 'success'
      );
      setHasSavedData(true); // Cập nhật trạng thái hiển thị nút Xóa
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi', 'error');
    } finally {
      setSaving(false);
    }
  }

  // TÍNH NĂNG: XÓA TẬN GỐC DỮ LIỆU ĐIỂM DANH DO LỠ BẤM NHẦM
  async function clearAttendance() {
    if (!selectedClass) return;
    if (!window.confirm(`XÓA ĐIỂM DANH LỚP NÀY?\n\nHành động này sẽ XÓA SẠCH toàn bộ dữ liệu điểm danh của ngày ${fmtDate(date)}.\nKhôi phục lại lớp về trạng thái "Chưa từng điểm danh".`)) return;

    setSaving(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, 'attendance'),
          where('classId', '==', selectedClass),
          where('date', '==', date)
        )
      );

      if (snap.empty) {
        toast('Chưa có dữ liệu để xóa!', 'warning');
        setSaving(false);
        return;
      }

      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();

      toast('Đã xóa dữ liệu điểm danh thành công! Lớp đã được trả về trạng thái trống.', 'success');
      setHasSavedData(false);
      loadRosterAndAttendance(); // Tải lại giao diện về mặc định
    } catch (e) {
      toast('Lỗi khi xóa điểm danh', 'error');
    } finally {
      setSaving(false);
    }
  }

  const exportAttendanceWord = () => {
    if (!selectedClass || roster.length === 0) {
      toast('Vui lòng chọn lớp và đợi tải danh sách trước khi xuất báo cáo!', 'error');
      return;
    }

    const cls = classes.find((c) => c.id === selectedClass);
    const currentClassName = cls?.className || '';
    const formattedDate = fmtDate(date);
    
    const today = new Date();
    const d = today.getDate();
    const m = today.getMonth() + 1;
    const y = today.getFullYear();

    let tableRows = '';
    roster.forEach((s, idx) => {
      const isPresent = records[s.id]?.present ?? true;
      const note = records[s.id]?.note || '';

      tableRows += `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td>${s.fullName}</td>
          <td style="text-align: center; mso-number-format:'\@';">${s.parentPhone || ''}</td>
          <td style="text-align: center; font-weight: bold;">${isPresent ? 'X' : ''}</td>
          <td style="text-align: center; font-weight: bold; color: red;">${!isPresent ? 'V' : ''}</td>
          <td>${note}</td>
        </tr>
      `;
    });

    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Danh sách điểm danh</title>
      <style>
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
        <div class="header-center">TRUNG TÂM GIÁO DỤC CHẤT LƯỢNG CAO N&C</div>
        <div class="header-center">DANH SÁCH ĐIỂM DANH - LỚP ${currentClassName.toUpperCase()}</div>
        <div class="sub-header">Ngày điểm danh: ${formattedDate}</div>
        
        <p><strong>Sĩ số:</strong> ${roster.length} học sinh | <strong>Có mặt:</strong> ${presentCount} | <strong>Vắng:</strong> ${roster.length - presentCount}</p>

        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 50px;">STT</th>
              <th>Họ và tên học sinh</th>
              <th style="width: 130px;">Số điện thoại</th>
              <th style="width: 80px;">Có mặt</th>
              <th style="width: 80px;">Vắng</th>
              <th style="width: 180px;">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div style="text-align: right; margin-top: 10px; font-style: italic; margin-right: 50px;">
          Yên Thành, ngày ${String(d).padStart(2, '0')} tháng ${String(m).padStart(2, '0')} năm ${y}
        </div>
        <table class="signature-table">
          <tr>
            <td style="width: 50%;"></td>
            <td style="width: 50%;">
              <strong>Giáo viên điểm danh</strong><br><br><br><br><br>
              <strong>........................................................</strong>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Diem_Danh_Ngay_Lop_${currentClassName.replace(/\s+/g, '_')}_${date}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast('Đã xuất file Word thành công!', 'success');
  };

  const exportSummaryExcel = async () => {
    if (!selectedClass) {
      toast('Vui lòng chọn lớp để xuất tổng hợp!', 'warning');
      return;
    }
    setLoading(true);
    try {
      const cls = classes.find((c) => c.id === selectedClass);
      const className = cls?.className || 'Lop';
      
      let studentList = roster.length > 0 ? roster : await getClassRoster(selectedClass);
      if (studentList.length === 0) {
        toast('Lớp chưa có học sinh', 'warning');
        setLoading(false);
        return;
      }
      
      studentList = [...studentList].sort((a, b) => {
        const nameA = getFirstName(a.fullName);
        const nameB = getFirstName(b.fullName);
        const cmp = nameA.localeCompare(nameB, 'vi', { sensitivity: 'base' });
        if (cmp !== 0) return cmp;
        return a.fullName.localeCompare(b.fullName, 'vi', { sensitivity: 'base' });
      });

      const attSnap = await getDocs(
        query(collection(db, 'attendance'), where('classId', '==', selectedClass))
      );
      const allAtt = attSnap.docs.map(d => d.data());

      const datesSet = new Set<string>();
      allAtt.forEach(a => datesSet.add(a.date));
      const sortedDates = Array.from(datesSet).sort();

      const excelData: any[][] = [
        ['TRUNG TÂM GIÁO DỤC CHẤT LƯỢNG CAO N&C'],
        [`BẢNG TỔNG HỢP ĐIỂM DANH - LỚP ${className.toUpperCase()}`],
        [], 
        ['STT', 'Họ tên học sinh (A-Z)', 'SĐT phụ huynh', ...sortedDates.map(fmtDate), 'Tổng số buổi', 'Số buổi có mặt', 'Số buổi vắng']
      ];

      studentList.forEach((s, idx) => {
        const row: any[] = [idx + 1, s.fullName, s.parentPhone || ''];
        let presentCount = 0;
        let absentCount = 0;

        sortedDates.forEach(d => {
          const record = allAtt.find(a => a.studentId === s.id && a.date === d);
          if (!record) {
            row.push('');
          } else if (record.present) {
            row.push('x');
            presentCount++;
          } else {
            row.push('V');
            absentCount++;
          }
        });

        row.push(sortedDates.length);
        row.push(presentCount);
        row.push(absentCount);
        excelData.push(row);
      });

      const ws = XLSX.utils.aoa_to_sheet(excelData);
      ws['!cols'] = [
        { wch: 5 },
        { wch: 25 },
        { wch: 15 },
        ...sortedDates.map(() => ({ wch: 12 })),
        { wch: 15 },
        { wch: 15 },
        { wch: 15 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Tổng hợp điểm danh');
      XLSX.writeFile(wb, `Tong_Hop_Diem_Danh_Lop_${className.replace(/\s+/g, '_')}.xlsx`);
      
      toast('Đã xuất file Excel tổng hợp thành công!', 'success');
    } catch (error) {
      console.error(error);
      toast('Có lỗi xảy ra khi xuất Excel', 'error');
    } finally {
      setLoading(false);
    }
  };

  const presentCount = roster.filter((s) => records[s.id]?.present).length;
  const cls = classes.find((c) => c.id === selectedClass);

  const normalizedSearch = classSearchTerm.replace(/\s+/g, '').toLowerCase();
  const filteredClasses = classes.filter(c => 
    (c.className || '').replace(/\s+/g, '').toLowerCase().includes(normalizedSearch)
  );

  return (
    <div className="fade-up">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <CheckSquare size={26} /> <span>Điểm danh</span>
          </h1>
          <p className="page-sub">Gõ tìm lớp, điểm danh hàng ngày và xuất báo cáo Tổng hợp</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, position: 'relative', zIndex: 50, overflow: 'visible' }}>
        <div className="card-body" style={{ overflow: 'visible' }}>
          <div className="form-row">
            
            <div className="form-group" style={{ flex: 1.5, position: 'relative', marginBottom: 0 }}>
              <label className="form-label">Lớp học (Gõ để tìm nhanh)</label>
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
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSelectedClass(c.id);
                          setClassSearchTerm(c.className);
                          setIsClassDropdownOpen(false);
                        }}
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

            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">Ngày điểm danh</label>
              <input
                className="form-control"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="loading-state">
          <div className="spinner" />
          <span>Đang xử lý dữ liệu...</span>
        </div>
      )}

      {rosterLoaded && !loading && (
        <div className="card" style={{ position: 'relative', zIndex: 10 }}>
          <div
            className="card-header"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span>
              {cls?.className} — {fmtDate(date)}
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
              {presentCount}/{roster.length} có mặt
            </span>
          </div>
          <div className="card-body">
            {roster.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <ClipboardList size={40} />
                </div>
                <h3>Lớp này chưa có học sinh</h3>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => toggleAll(true)}>
                      <Check size={14} /> Tất cả có mặt
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => toggleAll(false)}>
                      <X size={14} /> Tất cả vắng
                    </button>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={exportAttendanceWord} style={{ border: '1px solid #d1d5db', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FileText size={14} /> Xuất Word
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={exportSummaryExcel} style={{ background: '#059669', borderColor: '#059669', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FileSpreadsheet size={14} /> Xuất Excel
                    </button>
                  </div>
                </div>
                
                <div className="att-list">
                  <div className="att-row header" style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 2fr) 130px 80px 3fr', gap: '10px', alignItems: 'center' }}>
                    <div>Học sinh</div>
                    <div style={{ textAlign: 'center' }}>Số điện thoại</div>
                    <div style={{ textAlign: 'center' }}>Có mặt</div>
                    <div>Ghi chú</div>
                  </div>
                  {roster.map((s) => (
                    <div
                      key={s.id}
                      className="att-row"
                      style={{
                        display: 'grid', 
                        gridTemplateColumns: 'minmax(150px, 2fr) 130px 80px 3fr', 
                        gap: '10px', 
                        alignItems: 'center',
                        background: records[s.id]?.present
                          ? 'rgba(22,163,74,0.05)'
                          : 'rgba(220,38,38,0.05)',
                        padding: '10px',
                        borderBottom: '1px solid #f3f4f6'
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '0.875rem' }}>{s.fullName}</strong>
                      </div>
                      
                      <div style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                        {s.parentPhone ? (
                          <a href={`tel:${s.parentPhone}`} style={{ color: '#0369a1', textDecoration: 'none', fontWeight: 500 }} title="Bấm để gọi điện">
                            {s.parentPhone}
                          </a>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>—</span>
                        )}
                      </div>

                      <div className="att-check" style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          style={{
                            width: 18,
                            height: 18,
                            accentColor: 'var(--primary)',
                            cursor: 'pointer',
                          }}
                          checked={records[s.id]?.present ?? true}
                          onChange={(e) =>
                            setRecords((prev) => ({
                              ...prev,
                              [s.id]: { ...prev[s.id], present: e.target.checked },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <input
                          className="form-control"
                          style={{ padding: '5px 8px', fontSize: '0.82rem' }}
                          placeholder="Ghi chú (Ví dụ: Ốm, phép...)"
                          value={records[s.id]?.note || ''}
                          onChange={(e) =>
                            setRecords((prev) => ({
                              ...prev,
                              [s.id]: { ...prev[s.id], note: e.target.value },
                            }))
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* KHU VỰC NÚT LƯU & XÓA ĐIỂM DANH */}
                <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
                  {hasSavedData ? (
                    <button 
                      className="btn" 
                      style={{ color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', display: 'flex', gap: 6, alignItems: 'center', padding: '8px 16px' }} 
                      onClick={clearAttendance} 
                      disabled={saving}
                    >
                      <Trash2 size={16} /> Xóa dữ liệu điểm danh ngày này
                    </button>
                  ) : (
                    <div /> /* Khoảng trống để đẩy nút Lưu sang bên phải */
                  )}
                  
                  <button 
                    className="btn btn-primary" 
                    style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '8px 24px' }} 
                    onClick={save} 
                    disabled={saving}
                  >
                    <Save size={16} /> {saving ? 'Đang xử lý...' : 'Lưu điểm danh'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {!selectedClass && (
        <div className="empty-state" style={{ paddingTop: 30 }}>
          <div className="empty-icon">
            <CheckSquare size={40} />
          </div>
          <h3>Gõ chọn lớp để bắt đầu điểm danh</h3>
        </div>
      )}
    </div>
  );
}
