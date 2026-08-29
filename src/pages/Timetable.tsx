import { useState, useEffect } from 'react';
import { Calendar, Save, FileDown, Plus, Trash2, LayoutGrid, Search, Copy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { db } from '../config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getClasses } from '../services/dataService';
import { ClassItem, Role } from '../types';
import Modal from '../components/Modal';

// Cấu trúc ma trận
const DAYS = [2, 3, 4, 5, 6, 7, 8];
const DAY_LABELS = ['2', '3', '4', '5', '6', '7', 'CN'];
const SHIFTS = [1, 2, 3, 4, 5];

// Danh sách 7 phòng học của trung tâm
const ROOMS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'];

interface ScheduleItem {
  id: string;
  classId: string;
  className: string;
  room?: string;
}

type ScheduleData = Record<string, ScheduleItem[]>;

const generateId = () => Math.random().toString(36).substring(2, 10);

const removeAccents = (str: string) => {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
};

// Hàm lấy Tuần hiện tại theo chuẩn ISO
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

// Hàm tính Tuần liền trước
function getPrevWeek(weekStr: string) {
  if (!weekStr) return '';
  const [yearStr, weekNumStr] = weekStr.split('-W');
  let year = parseInt(yearStr, 10);
  let week = parseInt(weekNumStr, 10);
  if (week === 1) {
    year -= 1;
    week = 52;
  } else {
    week -= 1;
  }
  return `${year}-W${week.toString().padStart(2, '0')}`;
}

export default function Timetable() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === Role.ADMIN;

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [schedule, setSchedule] = useState<ScheduleData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Giao diện quản lý theo Tuần
  const [selectedWeek, setSelectedWeek] = useState(getCurrentWeek());

  // Modal State
  const [activeSlot, setActiveSlot] = useState<{ day: number; shift: number } | null>(null);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('');
  
  // State tìm kiếm thông minh lớp học
  const [classSearchTerm, setClassSearchTerm] = useState('');
  const [isClassDropdownOpen, setIsClassDropdownOpen] = useState(false);

  useEffect(() => {
    if (user) {
      loadData(selectedWeek);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, selectedWeek]);

  async function loadData(week: string) {
    if (!user || !week) return;
    setLoading(true);

    try {
      const cls = await getClasses(user);
      setClasses(cls);
    } catch (e) {
      toast('Lỗi tải danh sách lớp', 'error');
    }

    try {
      // Tải dữ liệu lịch học của tuần được chọn
      const scheduleSnap = await getDoc(doc(db, 'timetables', week));
      if (scheduleSnap.exists()) {
        setSchedule(scheduleSnap.data().data || {});
      } else {
        setSchedule({}); // Nếu tuần này chưa có lịch thì để trống
      }
    } catch (e) {
      toast('Lỗi tải lịch học tuần này', 'error');
    } finally {
      setLoading(false);
    }
  }

  const saveToFirebase = async (newData: ScheduleData, week: string = selectedWeek) => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'timetables', week), { data: newData });
      toast(`Đã lưu thời khóa biểu tuần ${week.split('-W')[1]}`, 'success');
    } catch (e) {
      toast('Lỗi lưu thời khóa biểu', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyPrevWeek = async () => {
    if (!window.confirm('Chức năng này sẽ sao chép toàn bộ lịch của tuần trước sang tuần hiện tại. Bạn có chắc chắn?')) return;
    setSaving(true);
    const prevWeek = getPrevWeek(selectedWeek);
    try {
      const prevSnap = await getDoc(doc(db, 'timetables', prevWeek));
      if (prevSnap.exists() && Object.keys(prevSnap.data().data || {}).length > 0) {
        const prevData = prevSnap.data().data;
        setSchedule(prevData);
        await saveToFirebase(prevData, selectedWeek);
        toast('Đã sao chép lịch tuần trước thành công!', 'success');
      } else {
        // Hỗ trợ chuyển đổi từ hệ thống cũ (chưa có tuần) sang hệ thống tuần
        const legacySnap = await getDoc(doc(db, 'settings', 'timetable'));
        if (legacySnap.exists() && Object.keys(legacySnap.data().data || {}).length > 0) {
            const legacyData = legacySnap.data().data;
            setSchedule(legacyData);
            await saveToFirebase(legacyData, selectedWeek);
            toast('Đã khởi tạo lịch từ dữ liệu gốc thành công!', 'success');
        } else {
            toast('Tuần trước không có dữ liệu lịch học nào để sao chép!', 'warning');
        }
      }
    } catch (e) {
      toast('Lỗi khi sao chép lịch', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddSlot = () => {
    if (!activeSlot || !selectedClassId) {
      toast('Vui lòng gõ tên và chọn lớp học từ danh sách', 'warning');
      return;
    }

    const cls = classes.find((c) => c.id === selectedClassId);
    if (!cls) return;

    const key = `${activeSlot.day}-${activeSlot.shift}`;
    const existingItems = schedule[key] || [];

    if (existingItems.some((i) => i.classId === cls.id)) {
      toast(`Lớp ${cls.className} đã được xếp lịch trong ca này rồi!`, 'error');
      return;
    }

    if (selectedRoom) {
      const roomTakenBy = existingItems.find((i) => i.room === selectedRoom);
      if (roomTakenBy) {
        toast(`Phòng ${selectedRoom} đang bị trùng! Đã được xếp cho lớp "${roomTakenBy.className}".`, 'error');
        return;
      }
    }

    const extractTeacher = (name: string) => {
      const lowerName = name.toLowerCase();
      const indexCo = lowerName.indexOf('cô ');
      const indexThay = lowerName.indexOf('thầy ');
      const index = Math.max(indexCo, indexThay);
      if (index !== -1) {
        return lowerName.substring(index).trim();
      }
      return null;
    };

    const currentTeacher = extractTeacher(cls.className);
    if (currentTeacher) {
      const teacherTakenBy = existingItems.find((i) => extractTeacher(i.className) === currentTeacher);
      if (teacherTakenBy) {
        toast(`Trùng lịch Giáo viên! ${currentTeacher.toUpperCase()} đã được phân công dạy lớp "${teacherTakenBy.className}" trong ca này rồi.`, 'error');
        return;
      }
    }

    const newItem: ScheduleItem = {
      id: generateId(),
      classId: cls.id,
      className: cls.className,
      room: selectedRoom, 
    };

    const newSchedule = {
      ...schedule,
      [key]: [...existingItems, newItem],
    };

    setSchedule(newSchedule);
    saveToFirebase(newSchedule);
    setSelectedClassId('');
    setClassSearchTerm('');
    setSelectedRoom('');
  };

  const handleRemoveItem = (key: string, itemId: string) => {
    const newItems = (schedule[key] || []).filter((i) => i.id !== itemId);
    const newSchedule = { ...schedule, [key]: newItems };
    setSchedule(newSchedule);
    saveToFirebase(newSchedule);
  };

  const getCellItems = (day: number, shift: number) => schedule[`${day}-${shift}`] || [];

  const getColTotal = (day: number) => {
    return SHIFTS.reduce((sum, shift) => sum + getCellItems(day, shift).length, 0);
  };

  const getRowTotal = (shift: number) => {
    return DAYS.reduce((sum, day) => sum + getCellItems(day, shift).length, 0);
  };

  const getGrandTotal = () => {
    return SHIFTS.reduce((sum, shift) => sum + getRowTotal(shift), 0);
  };

  const exportWord = () => {
    const d = new Date();
    let tableRows = '';

    SHIFTS.forEach((shift) => {
      let rowHtml = `<tr><td style="font-weight: bold; text-align: center;">CA ${shift}</td>`;
      DAYS.forEach((day) => {
        const items = getCellItems(day, shift);
        const cellContent = items.map((i) => `• ${i.className}${i.room ? ` (Phòng: ${i.room})` : ''}`).join('<br/><br/>');
        rowHtml += `<td style="vertical-align: top;">${cellContent}</td>`;
      });
      rowHtml += `<td style="font-weight: bold; text-align: center; vertical-align: middle;">${getRowTotal(shift)}</td></tr>`;
      tableRows += rowHtml;
    });

    let totalRowHtml = `<tr><td style="font-weight: bold; text-align: center;">Tổng</td>`;
    DAYS.forEach((day) => {
      totalRowHtml += `<td style="font-weight: bold; text-align: center;">${getColTotal(day)}</td>`;
    });
    totalRowHtml += `<td style="font-weight: bold; text-align: center; color: red;">${getGrandTotal()}</td></tr>`;

    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Thời Khóa Biểu Tuần ${selectedWeek}</title>
      <style>
        @page WordSection1 { size: 841.9pt 595.3pt; mso-page-orientation: landscape; margin: 0.8in; }
        div.WordSection1 { page: WordSection1; }
        body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.3; color: #000; }
        .header { text-align: left; font-weight: bold; font-size: 13pt; text-transform: uppercase; margin-bottom: 20px; }
        .title { text-align: center; font-weight: bold; font-size: 16pt; margin-bottom: 20px; }
        table.data-table { width: 100%; border-collapse: collapse; }
        table.data-table th, table.data-table td { border: 1px solid #000; padding: 6px; font-size: 10pt; }
        table.data-table th { background-color: #f2f2f2; text-align: center; font-weight: bold; }
      </style>
      </head>
      <body>
        <div class="WordSection1">
          <div class="header">TRUNG TÂM GIÁO DỤC CHẤT LƯỢNG CAO N&C</div>
          <div class="title">THỜI KHÓA BIỂU DẠY HỌC - TUẦN ${selectedWeek.split('-W')[1]}</div>
          <p style="text-align: right; font-style: italic;">Năm: ${selectedWeek.split('-W')[0]} | Cập nhật ngày: ${d.toLocaleDateString('vi-VN')}</p>
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 80px;">CA \\ THỨ</th>
                ${DAY_LABELS.map((l) => `<th>${l}</th>`).join('')}
                <th style="width: 50px;">Tổng</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
              ${totalRowHtml}
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `Thoi_Khoa_Bieu_${selectedWeek}.doc`; a.click();
    toast('Đã xuất file Word Thời Khóa Biểu', 'success');
  };

  const activeClasses = classes.filter(c => c.status === 'ACTIVE');
  
  const filteredClasses = activeClasses.filter(c => {
    const keyword = removeAccents(classSearchTerm).replace(/\s+/g, '');
    if (!keyword) return true;
    const normalizedClassName = removeAccents(c.className).replace(/\s+/g, '');
    const normalizedSubject = c.subject ? removeAccents(c.subject).replace(/\s+/g, '') : '';
    return (
      normalizedClassName.includes(keyword) ||
      normalizedSubject.includes(keyword)
    );
  });

  return (
    <div className="fade-up">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title"><LayoutGrid size={26} /> <span>Thời khóa biểu</span></h1>
          <p className="page-sub">Lên lịch tự động và phân bổ tài nguyên theo từng tuần</p>
        </div>
        
        {/* THANH CÔNG CỤ QUẢN LÝ TUẦN */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', padding: '2px 8px' }}>
            <Calendar size={18} style={{ color: '#6b7280', marginRight: '6px' }} />
            <input 
              type="week" 
              className="form-control" 
              style={{ border: 'none', padding: '6px 0', minWidth: '160px', boxShadow: 'none' }}
              value={selectedWeek} 
              onChange={(e) => setSelectedWeek(e.target.value)}
              title="Chọn tuần làm việc"
            />
          </div>
          
          {isAdmin && (
            <button className="btn btn-primary" onClick={handleCopyPrevWeek} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Copy size={16} /> Sao chép từ tuần trước
            </button>
          )}
          
          <button className="btn btn-secondary" onClick={exportWord} style={{ background: '#059669', color: '#fff', borderColor: '#059669', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileDown size={16} /> Xuất Word
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-state"><div className="spinner" /><span>Đang tải lịch tuần này...</span></div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <div className="table-wrap">
            <table className="gradebook-table" style={{ minWidth: 900, tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'center', width: 60, background: '#f3f4f6' }}>CA \ THỨ</th>
                  {DAY_LABELS.map((d) => (
                    <th key={d} style={{ textAlign: 'center', background: '#f3f4f6', width: `${100 / 8}%` }}>{d}</th>
                  ))}
                  <th style={{ textAlign: 'center', width: 50, background: '#fef08a' }}>Tổng</th>
                </tr>
              </thead>
              <tbody>
                {SHIFTS.map((shift) => (
                  <tr key={shift}>
                    <td style={{ fontWeight: 'bold', textAlign: 'center', background: '#f9fafb' }}>CA {shift}</td>
                    {DAYS.map((day) => {
                      const items = getCellItems(day, shift);
                      return (
                        <td
                          key={day}
                          style={{ verticalAlign: 'top', cursor: 'pointer', padding: 8, border: '1px dashed #e5e7eb' }}
                          onClick={() => {
                            if (isAdmin) {
                              setActiveSlot({ day, shift });
                              setSelectedClassId('');
                              setClassSearchTerm('');
                              setSelectedRoom('');
                            }
                          }}
                          className={isAdmin ? 'hover-bg-light' : ''}
                        >
                          {items.length === 0 ? (
                            <div style={{ height: '100%', minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d1d5db' }}>
                              {isAdmin && <Plus size={16} />}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                              {items.map((item) => (
                                <div key={item.id} style={{ 
                                  fontSize: '0.7rem',
                                  background: '#e0f2fe', 
                                  padding: '4px 6px', 
                                  borderRadius: 4, 
                                  border: '1px solid #bae6fd', 
                                  width: '100%', 
                                  textAlign: 'center', 
                                  wordBreak: 'break-word', 
                                  lineHeight: 1.2 
                                }}>
                                  <div style={{ fontWeight: 'bold', color: '#0369a1' }}>{item.className}</div>
                                  {item.room && (
                                    <div style={{ fontWeight: 600, color: '#0284c7', marginTop: 2, background: '#fff', display: 'inline-block', padding: '1px 4px', borderRadius: 3 }}>
                                      Phòng: {item.room}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ fontWeight: 'bold', textAlign: 'center', background: '#fefce8', verticalAlign: 'middle' }}>{getRowTotal(shift)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ fontWeight: 'bold', textAlign: 'center', background: '#fef08a' }}>Tổng</td>
                  {DAYS.map((day) => (
                    <td key={day} style={{ fontWeight: 'bold', textAlign: 'center', background: '#fefce8' }}>{getColTotal(day)}</td>
                  ))}
                  <td style={{ fontWeight: 'bold', textAlign: 'center', background: '#fde047', color: '#b45309' }}>{getGrandTotal()}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal 
        open={!!activeSlot} 
        onClose={() => { setActiveSlot(null); setSelectedClassId(''); setClassSearchTerm(''); setSelectedRoom(''); }} 
        title={`Lên lịch: Ca ${activeSlot?.shift} - Thứ ${activeSlot?.day === 8 ? 'CN' : activeSlot?.day}`}
      >
        {isAdmin && (
          <div style={{ marginBottom: 20 }}>
            <div className="form-group" style={{ position: 'relative', zIndex: 10 }}>
              <label className="form-label">Chọn lớp học (Đã bao gồm tên GV)</label>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input
                  className="form-control"
                  style={{ paddingLeft: 34 }}
                  placeholder="Gõ tên lớp (ví dụ: TO 9, TO9...) để tìm nhanh..."
                  value={classSearchTerm}
                  onChange={(e) => {
                    setClassSearchTerm(e.target.value);
                    setSelectedClassId('');
                    setIsClassDropdownOpen(true);
                  }}
                  onFocus={() => setIsClassDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setIsClassDropdownOpen(false), 200)}
                />
              </div>
              {isClassDropdownOpen && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d1d5db',
                  borderTop: 'none', borderRadius: '0 0 6px 6px', maxHeight: '180px', overflowY: 'auto',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                }}>
                  {filteredClasses.length > 0 ? (
                    filteredClasses.map((c) => (
                      <div
                        key={c.id}
                        onMouseDown={(e) => {
                          e.preventDefault(); 
                          setSelectedClassId(c.id);
                          setClassSearchTerm(`${c.className} ${c.subject ? `(${c.subject})` : ''}`);
                          setIsClassDropdownOpen(false);
                        }}
                        style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: '14px', color: '#000' }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                      >
                        <strong>{c.className}</strong> {c.subject ? `(${c.subject})` : ''}
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '8px 12px', color: '#6b7280', fontSize: '14px', textAlign: 'center' }}>Không tìm thấy lớp phù hợp</div>
                  )}
                </div>
              )}
            </div>

            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="form-label">Phòng học (P1 - P7)</label>
              <select 
                className="form-select" 
                value={selectedRoom} 
                onChange={(e) => setSelectedRoom(e.target.value)}
              >
                <option value="">-- Chưa xếp phòng --</option>
                {ROOMS.map(r => (
                  <option key={r} value={r}>Phòng {r}</option>
                ))}
              </select>
            </div>

            <button className="btn btn-primary" onClick={handleAddSlot} disabled={saving} style={{ width: '100%', marginTop: 12 }}>
              {saving ? 'Đang lưu...' : '+ Thêm lịch học vào ô này'}
            </button>
          </div>
        )}

        <div>
          <h4 style={{ fontSize: '0.9rem', marginBottom: 10, fontWeight: 600 }}>Các lớp đã xếp trong ca này:</h4>
          {activeSlot && getCellItems(activeSlot.day, activeSlot.shift).length === 0 ? (
            <div style={{ color: '#6b7280', fontSize: '0.85rem', fontStyle: 'italic' }}>Chưa có lịch nào.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeSlot && getCellItems(activeSlot.day, activeSlot.shift).map((item) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f3f4f6', padding: '10px 12px', borderRadius: 6 }}>
                  <div>
                    <strong style={{ fontSize: '0.9rem', color: '#111827' }}>{item.className}</strong>
                    {item.room && <div style={{ fontSize: '0.8rem', color: '#0369a1', fontWeight: 500, marginTop: 2 }}>Phòng: {item.room}</div>}
                  </div>
                  {isAdmin && (
                    <button className="btn btn-ghost btn-sm" style={{ color: '#ef4444' }} onClick={() => handleRemoveItem(`${activeSlot.day}-${activeSlot.shift}`, item.id)}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
