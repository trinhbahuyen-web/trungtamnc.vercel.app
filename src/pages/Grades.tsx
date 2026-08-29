import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ChangeEvent, ClipboardEvent } from 'react';
import { FileText, Save, Plus, Trash2, Search, FileDown, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  addGradeColumn,
  calcGradeAverage10,
  deleteGradeColumnAndScores,
  getClassById,
  getClasses,
  getClassRoster,
  getGradeColumns,
  getGradeRows,
  getOrCreateClassGradebook,
  migrateLegacyScoresToGradebook,
  saveGradeRows,
  todayStr,
} from '../services/dataService';
import {
  ClassItem,
  GradeColumn,
  GradeColumnType,
  GradeRow,
  Student,
} from '../types';

type RowState = {
  studentId: string;
  fullName: string;
  studentClass: string;
  scores: Record<string, string>;
  average10: number | null;
};

const TYPE_SHORT: Record<GradeColumnType, string> = {
  REGULAR: 'TX',
  MIDTERM: 'GK',
  FINAL: 'CK',
  OTHER: 'Khác',
};

const TYPE_LABEL: Record<GradeColumnType, string> = {
  REGULAR: 'Thường xuyên',
  MIDTERM: 'Giữa kỳ',
  FINAL: 'Cuối kỳ',
  OTHER: 'Khác',
};

const DEFAULT_WEIGHT: Record<GradeColumnType, number> = {
  REGULAR: 1,
  MIDTERM: 2,
  FINAL: 3,
  OTHER: 1,
};

function parseScore(value: string) {
  if (value.trim() === '') return null;
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function toNumericScores(scores: Record<string, string>) {
  const out: Record<string, number> = {};
  Object.entries(scores).forEach(([columnId, raw]) => {
    const n = parseScore(raw);
    if (n !== null && Number.isFinite(n)) out[columnId] = n;
  });
  return out;
}

function scoreColor(score: number, max: number) {
  if (max <= 0) return 'var(--text-muted)';
  return score / max >= 0.5 ? 'var(--success)' : 'var(--danger)';
}

function nextColumnName(type: GradeColumnType, columns: GradeColumn[]) {
  if (type === 'MIDTERM') return columns.some((c) => c.name === 'GK') ? `GK ${columns.length + 1}` : 'GK';
  if (type === 'FINAL') return columns.some((c) => c.name === 'CK') ? `CK ${columns.length + 1}` : 'CK';

  const prefix = type === 'REGULAR' ? 'TX' : 'Cột';
  let i = 1;
  while (columns.some((c) => c.name.trim().toLowerCase() === `${prefix}${i}`.toLowerCase())) i += 1;
  return `${prefix}${i}`;
}

function getFirstName(fullName: string) {
  if (!fullName) return '';
  const parts = fullName.trim().split(' ');
  return parts[parts.length - 1];
}

function generateComment(avg: number | null) {
  if (avg === null) return 'Chưa đủ điểm.';
  if (avg === 10) return 'Xuất sắc. Em nắm vững kiến thức, trình bày logic và có kỹ năng tính toán chính xác tuyệt đối.';
  if (avg >= 9.0) return 'Tư duy Toán học tốt, phản xạ nhanh. Tiếp tục rèn luyện sự cẩn thận để duy trì phong độ.';
  if (avg >= 8.0) return 'Kết quả tốt. Em hiểu bài và vận dụng đúng công thức. Cần phát huy sự tự giác trong học tập.';
  if (avg >= 7.0) return 'Khá. Em nắm được kiến thức cơ bản. Cần rèn thêm kỹ năng tính toán để tránh sai sót không đáng có.';
  if (avg >= 5.0) return 'Cần tập trung hơn trong giờ học. Bài tập về nhà làm chưa đều, cần chủ động luyện tập lại các dạng toán cơ bản.';
  return 'Chưa đạt yêu cầu. Tư duy logic còn yếu, cần rèn lại các kiến thức nền tảng. Thay vì đối phó bằng cách chép bài, em cần tự mình giải quyết từng bài toán để hiểu bản chất.';
}

function buildRows(roster: Student[], storedRows: GradeRow[], columns: GradeColumn[]): RowState[] {
  const rowMap = new Map(storedRows.map((r) => [r.studentId, r]));
  return roster.map((student) => {
    const stored = rowMap.get(student.id);
    const scores: Record<string, string> = {};
    columns.forEach((column) => {
      const value = stored?.scores?.[column.id];
      if (value !== undefined && value !== null) scores[column.id] = String(value);
    });
    return {
      studentId: student.id,
      fullName: student.fullName,
      studentClass: student.studentClass || '',
      scores,
      average10: calcGradeAverage10(toNumericScores(scores), columns),
    };
  });
}

export default function Grades() {
  const { user } = useAuth();
  const toast = useToast();

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [gradebookId, setGradebookId] = useState('');
  const [roster, setRoster] = useState<Student[]>([]);
  const [columns, setColumns] = useState<GradeColumn[]>([]);
  const [rows, setRows] = useState<RowState[]>([]);
  const [dirtyIds, setDirtyIds] = useState<Record<string, true>>({});
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [columnSaving, setColumnSaving] = useState(false);

  const [classSearchTerm, setClassSearchTerm] = useState('');
  const [isClassDropdownOpen, setIsClassDropdownOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    getClasses(user).then(setClasses).catch((e) => toast(e.message, 'error'));
  }, []);

  const selectedCls = classes.find((c) => c.id === selectedClass);
  const dirtyCount = Object.keys(dirtyIds).length;

  const loadClass = useCallback(async (classId: string) => {
    if (!user || !classId) return;
    setLoading(true);
    setDirtyIds({});
    try {
      const classInfo = classes.find((c) => c.id === classId) || (await getClassById(classId));
      if (!classInfo) throw new Error('Không tìm thấy lớp học');
      const [gradebook, rosterData] = await Promise.all([getOrCreateClassGradebook(classInfo, user.id), getClassRoster(classId)]);
      let [cols, storedRows] = await Promise.all([getGradeColumns(gradebook.id), getGradeRows(gradebook.id)]);
      const migrated = await migrateLegacyScoresToGradebook(classId, gradebook.id, rosterData, user.id);
      if (migrated) { [cols, storedRows] = await Promise.all([getGradeColumns(gradebook.id), getGradeRows(gradebook.id)]); }
      setSelectedClass(classId);
      setGradebookId(gradebook.id);
      setRoster(rosterData);
      setColumns(cols);
      setRows(buildRows(rosterData, storedRows, cols));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi tải bảng điểm', 'error');
    } finally { setLoading(false); }
  }, [classes, toast, user]);

  function handleSelectClassItem(c: ClassItem) {
    if (dirtyCount > 0 && !window.confirm('Bạn có điểm chưa lưu. Chuyển lớp sẽ bỏ thay đổi này. Tiếp tục?')) return;
    setSelectedClass(c.id);
    setClassSearchTerm(c.className);
    setIsClassDropdownOpen(false);
    setQ('');
    loadClass(c.id);
  }

  async function addColumn(type: GradeColumnType) {
    if (!gradebookId || !selectedClass) { toast('Chọn lớp trước', 'warning'); return; }
    if (dirtyCount > 0) { toast('Lưu điểm trước khi thêm cột', 'warning'); return; }
    setColumnSaving(true);
    try {
      await addGradeColumn(gradebookId, {
        name: nextColumnName(type, columns),
        type, maxScore: 10, weight: DEFAULT_WEIGHT[type], examDate: todayStr(),
        order: columns.length ? Math.max(...columns.map((c) => c.order)) + 1 : 1,
      });
      await loadClass(selectedClass);
    } finally { setColumnSaving(false); }
  }

  async function deleteColumn(column: GradeColumn) {
    if (!gradebookId || !selectedClass) return;
    if (!window.confirm(`Xóa cột "${column.name}"? Toàn bộ điểm của học sinh trong cột này cũng sẽ bị xóa!`)) return;
    setColumnSaving(true);
    try { await deleteGradeColumnAndScores(gradebookId, column.id); await loadClass(selectedClass); } finally { setColumnSaving(false); }
  }

  function updateScore(studentId: string, columnId: string, raw: string) {
    setRows((prev) => prev.map((row) => {
        if (row.studentId !== studentId) return row;
        const nextScores = { ...row.scores, [columnId]: raw };
        return { ...row, scores: nextScores, average10: calcGradeAverage10(toNumericScores(nextScores), columns) };
    }));
    setDirtyIds((prev) => ({ ...prev, [studentId]: true }));
  }

  async function saveChanges() {
    if (!gradebookId || !user) return;
    const dirtyRows = rows.filter((row) => dirtyIds[row.studentId]);
    setSaving(true);
    try {
      await saveGradeRows(gradebookId, columns, dirtyRows.map(r => ({ ...r, scores: toNumericScores(r.scores) })), user.id);
      toast('Đã lưu thay đổi', 'success');
      setDirtyIds({});
    } finally { setSaving(false); }
  }

  const exportGradeSummaryWord = () => {
    const alphabetSortedRows = [...rows].sort((a, b) => getFirstName(a.fullName).localeCompare(getFirstName(b.fullName), 'vi', { sensitivity: 'base' }));
    const rankSortedRows = [...rows].sort((a, b) => (b.average10 ?? -1) - (a.average10 ?? -1));
    const rankMap = new Map<string, number>();
    rankSortedRows.forEach((r, idx, arr) => rankMap.set(r.studentId, idx > 0 && arr[idx-1].average10 === r.average10 ? rankMap.get(arr[idx-1].studentId)! : idx + 1));

    let tableRows = alphabetSortedRows.map((row, idx) => `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td><strong>${row.fullName}</strong></td>
        ${columns.map(col => `<td style="text-align: center;">${row.scores[col.id] || '—'}</td>`).join('')}
        <td style="text-align: center; font-weight: bold; color: #047857;">${row.average10 !== null ? row.average10.toFixed(1) : '—'}</td>
        <td style="text-align: center; font-weight: bold;">${rankMap.get(row.studentId)}</td>
        <td style="font-style: italic; font-size: 11pt;">${generateComment(row.average10)}</td>
      </tr>`).join('');

    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Báo cáo tổng hợp điểm</title>
      <style>
        @page WordSection1 {
          size: 841.9pt 595.3pt;
          mso-page-orientation: landscape;
          margin: 1.0in 1.0in 1.0in 1.0in;
        }
        div.WordSection1 { page: WordSection1; }
        body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.4; color: #000; }
        .header-center { text-align: center; font-weight: bold; text-transform: uppercase; font-size: 14pt; margin-bottom: 5px; }
        .sub-header { text-align: center; font-style: italic; font-size: 12pt; margin-bottom: 20px; }
        table.data-table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 20px; }
        table.data-table th, table.data-table td { border: 1px solid #000; padding: 6px 8px; font-size: 11pt; vertical-align: middle; }
        table.data-table th { background-color: #f2f2f2; text-align: center; font-weight: bold; }
        .signature-table { width: 100%; border: none; margin-top: 10px; text-align: center; }
        .signature-table td { border: none; vertical-align: top; }
      </style>
      </head>
      <body>
        <div class="WordSection1">
          <div class="header-center">TRUNG TÂM GIÁO DỤC CHẤT LƯỢNG CAO N&C</div>
          <div class="header-center">BÁO CÁO TỔNG HỢP ĐIỂM SỐ VÀ NHẬN XÉT HỌC TẬP - LỚP ${selectedCls?.className.toUpperCase()}</div>
          <div class="sub-header">Tổng số học sinh: ${rows.length} | Ngày xuất báo cáo: ${new Date().toLocaleDateString('vi-VN')}</div>

          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 40px;">STT</th>
                <th style="width: 150px;">Họ và tên</th>
                ${columns.map(col => `<th style="width: 70px; text-align: center;">${col.name}<br><span style="font-size: 10pt; font-weight: normal;">(/${col.maxScore})</span></th>`).join('')}
                <th style="width: 70px;">TB (/10)</th>
                <th style="width: 60px;">Thứ hạng</th>
                <th>Nhận xét & Định hướng phương pháp học tập</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>

          <div style="text-align: right; margin-top: 10px; font-style: italic; margin-right: 50px;">
            Yên Thành, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}
          </div>
          <table class="signature-table">
            <tr>
              <td style="width: 50%;"></td>
              <td style="width: 50%;">
                <strong>Giáo viên bộ môn</strong><br><br><br><br><br>
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
    const a = document.createElement('a'); a.href = url; a.download = `Bao_Cao_Tong_Hop_Diem_${selectedCls?.className}.doc`; a.click();
    toast('Đã xuất báo cáo!', 'success');
  };

  const visibleRows = useMemo(() => rows.filter(r => r.fullName.toLowerCase().includes(q.toLowerCase())), [q, rows]);

  const normalizedSearch = classSearchTerm.replace(/\s+/g, '').toLowerCase();
  const filteredClasses = classes.filter(c => 
    c.className.replace(/\s+/g, '').toLowerCase().includes(normalizedSearch)
  );

  return (
    <div className="fade-up">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title"><FileText size={26} /> <span>Nhập điểm</span></h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
            {selectedClass && <button className="btn btn-secondary" onClick={exportGradeSummaryWord} style={{ background: '#059669', color: '#fff', borderColor: '#059669' }}><FileDown size={16}/> Xuất báo cáo</button>}
            <button className="btn btn-primary" onClick={saveChanges} disabled={saving || dirtyCount === 0}><Save size={16} /> Lưu ({dirtyCount})</button>
        </div>
      </div>

      <div className="card" style={{ position: 'relative', zIndex: 50, overflow: 'visible', padding: '15px', marginBottom: '15px' }}>
        <div style={{ display: 'flex', gap: 15, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 250, position: 'relative' }}>
             <label className="form-label">Chọn lớp học</label>
             <input 
               className="form-control" 
               placeholder="Ví dụ: TO9..." 
               value={classSearchTerm} 
               onChange={(e) => {setClassSearchTerm(e.target.value); setIsClassDropdownOpen(true);}} 
               onFocus={() => setIsClassDropdownOpen(true)} 
               onBlur={() => setTimeout(() => setIsClassDropdownOpen(false), 200)} 
             />
             {isClassDropdownOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ccc', borderRadius: '0 0 6px 6px', maxHeight: 250, overflowY: 'auto', zIndex: 999 }}>
                    {filteredClasses.length > 0 ? (
                      filteredClasses.map(c => (
                          <div 
                            key={c.id} 
                            style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }} 
                            onMouseDown={(e) => { e.preventDefault(); handleSelectClassItem(c); }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                          >
                            {c.className}
                          </div>
                      ))
                    ) : (
                      <div style={{ padding: '10px 12px', color: '#6b7280', fontSize: '14px', textAlign: 'center' }}>Không tìm thấy lớp</div>
                    )}
                </div>
             )}
          </div>
        </div>
      </div>

      {loading && (
        <div className="loading-state">
          <div className="spinner" />
          <span>Đang tải bảng điểm...</span>
        </div>
      )}

      {!loading && selectedClass && (
        <>
          {/* THANH THÊM CỘT ĐIỂM SIÊU GỌN GÀNG */}
          <div className="card" style={{ marginBottom: 15 }}>
            <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, padding: '10px 15px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#374151' }}>
                <Settings size={16} /> Quản lý cột điểm
              </span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => addColumn('REGULAR')} disabled={columnSaving}>
                  <Plus size={14}/> Cột Thường xuyên
                </button>
                <button className="btn btn-warning btn-sm" onClick={() => addColumn('MIDTERM')} disabled={columnSaving}>
                  <Plus size={14}/> Cột Giữa kỳ
                </button>
                <button className="btn btn-primary btn-sm" style={{ background: '#dc2626', borderColor: '#dc2626' }} onClick={() => addColumn('FINAL')} disabled={columnSaving}>
                  <Plus size={14}/> Cột Cuối kỳ
                </button>
              </div>
            </div>
          </div>

          {/* BẢNG ĐIỂM - TÍCH HỢP NÚT XÓA NGAY TRÊN TIÊU ĐỀ */}
          <div className="table-wrap" style={{ background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <table className="gradebook-table">
              <thead>
                <tr>
                  <th className="col-stt" style={{ width: '50px', textAlign: 'center', verticalAlign: 'middle' }}>STT</th>
                  <th className="sticky-student" style={{ minWidth: '180px', verticalAlign: 'middle' }}>Học sinh</th>
                  {columns.map(c => (
                    <th key={c.id} style={{ textAlign: 'center', minWidth: '85px', verticalAlign: 'middle' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <span>{c.name}</span>
                        <button 
                          className="btn btn-ghost btn-sm" 
                          style={{ padding: 0, height: 'auto', color: '#ef4444', border: 'none', background: 'transparent' }} 
                          onClick={() => deleteColumn(c)} 
                          title="Xóa cột này"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <br/>
                      <span style={{ fontSize: '0.7rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>HS: {c.weight}</span>
                    </th>
                  ))}
                  <th style={{ width: '80px', textAlign: 'center', color: 'var(--primary)', verticalAlign: 'middle' }}>T.Bình</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 3} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>Không có học sinh nào.</td>
                  </tr>
                ) : (
                  visibleRows.map((r, i) => (
                    <tr key={r.studentId}>
                      <td className="col-stt" style={{ textAlign: 'center' }}>{i+1}</td>
                      <td><strong>{r.fullName}</strong></td>
                      {columns.map(col => (
                        <td key={col.id} style={{ textAlign: 'center' }}>
                          <input 
                            className="grade-score-input" 
                            style={{ width: '60px', textAlign: 'center', margin: '0 auto' }} 
                            value={r.scores[col.id] || ''} 
                            onChange={(e) => updateScore(r.studentId, col.id, e.target.value)} 
                          />
                        </td>
                      ))}
                      <td style={{ textAlign: 'center', fontWeight: 700, color: r.average10 !== null && r.average10 < 5 ? '#dc2626' : 'var(--primary)' }}>
                        {r.average10 !== null ? r.average10.toFixed(1) : ''}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
