import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileUp, Send, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import ExamReviewModal from '../components/ExamReviewModal';
import Modal from '../components/Modal';
import PointsConfigEditor from '../components/PointsConfigEditor';
import { createAssignment, createAssignmentExam } from '../services/assignmentService';
import { getClasses, getClassRoster } from '../services/dataService';
import { parseWordToExam, validateExamData } from '../services/mathWordParserService';
import { createDefaultPointsConfig } from '../services/scoringService';
import { AssignmentMode, ClassItem, ExamData, ExamPointsConfig, Student } from '../types';

function dateTimeValue(d?: Date | null) {
  if (!d) return '';
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 16);
}

function fromInputDateTime(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function AssignmentCreate() {
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [roster, setRoster] = useState<Student[]>([]);
  const [classId, setClassId] = useState('');
  const [mode, setMode] = useState<AssignmentMode>('homework');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [timeLimit, setTimeLimit] = useState('45');
  const [allowResubmit, setAllowResubmit] = useState(true);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [antiCheat, setAntiCheat] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [examData, setExamData] = useState<ExamData | null>(null);
  const [pointsConfig, setPointsConfig] = useState<ExamPointsConfig | null>(null);
  const [pointsOpen, setPointsOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (user) getClasses(user).then(setClasses).catch((e) => toast(e.message, 'error')); }, [user, toast]);
  useEffect(() => {
    if (!classId) { setRoster([]); return; }
    getClassRoster(classId).then((r) => { setRoster(r); setSelectedStudents(r.map((s) => s.id)); }).catch((e) => toast(e.message, 'error'));
  }, [classId, toast]);

  const classInfo = useMemo(() => classes.find((c) => c.id === classId) || null, [classes, classId]);

  async function handleFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.docx')) {
      toast('Vui lòng chọn file Word .docx', 'warning');
      return;
    }
    setParsing(true);
    try {
      const parsed = await parseWordToExam(file);
      const checked = validateExamData(parsed);
      if (!checked.valid) toast(checked.errors.join('\n'), 'warning');
      setExamData(parsed);
      setPointsConfig(createDefaultPointsConfig(parsed.questions)); // 🆕 thang 10 mặc định
      setTitle((t) => t || parsed.title || file.name.replace(/\.docx$/i, ''));
      setReviewOpen(true);
      toast(`Đã đọc ${parsed.questions.length} câu hỏi từ Word`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi đọc file Word', 'error');
    } finally {
      setParsing(false);
    }
  }

  function toggleStudent(id: string) {
    setSelectedStudents((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function saveAssignment() {
    if (!user) return;
    if (!classInfo) { toast('Chọn lớp cần giao bài', 'warning'); return; }
    if (!examData || examData.questions.length === 0) { toast('Upload file Word và xác nhận đề trước', 'warning'); return; }
    if (!title.trim()) { toast('Nhập tên bài giao', 'warning'); return; }
    if (selectedStudents.length === 0) { toast('Chọn ít nhất 1 học sinh', 'warning'); return; }
    setSaving(true);
    try {
      const examId = await createAssignmentExam({
        title,
        subject: classInfo.subject,
        questions: examData.questions,
        sections: examData.sections,
        images: examData.images,
        sourceFileName: examData.title,
        createdBy: user,
        pointsConfig, // 🆕 cấu hình điểm tùy chỉnh
      });
      const assignmentId = await createAssignment({
        examId,
        title,
        description,
        classInfo,
        mode,
        opensAt: fromInputDateTime(opensAt),
        closesAt: fromInputDateTime(closesAt),
        timeLimit: mode === 'exam' ? Number(timeLimit) || 45 : Number(timeLimit) || 0,
        allowResubmit,
        shuffleQuestions,
        shuffleOptions,
        antiCheat: mode === 'exam' ? antiCheat : false,
        assignedBy: user,
        selectedStudentIds: selectedStudents,
      });
      toast('Đã giao bài thành công');
      nav(`/assignments/${assignmentId}/monitor`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi giao bài', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fade-up assignment-page">
      <div className="page-header">
        <div>
          <h1 className="page-title"><FileUp size={26} /> <span>Tạo bài từ Word</span></h1>
          <p className="page-sub">Import đề .docx, chỉnh câu hỏi, chọn lớp và giao bài</p>
        </div>
        <button className="btn btn-ghost" onClick={() => nav('/assignments')}>Quay lại</button>
      </div>

      <div className="assignment-create-grid">
        <div className="card">
          <div className="card-header"><FileUp size={16} /> 1. File đề / bài tập</div>
          <div className="card-body">
            <label className="upload-drop">
              <input type="file" accept=".docx" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
              <FileUp size={34} />
              <strong>{parsing ? 'Đang đọc file Word...' : 'Chọn file Word .docx'}</strong>
              <span>Hỗ trợ câu trắc nghiệm, đúng/sai, trả lời ngắn, tự luận, LaTeX/MathType và hình ảnh.</span>
            </label>
            {examData && (
              <>
                <div className="payment-config-preview">
                  <div><span>Đề đã đọc</span><br /><strong>{examData.title}</strong></div>
                  <div><span>Số câu</span><br /><strong>{examData.questions.length}</strong></div>
                  <div><span>Thang điểm</span><br /><strong>{pointsConfig?.maxScore ?? 10} điểm</strong></div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setReviewOpen(true)}>Xem / chỉnh đề</button>
                  <button className="btn btn-primary btn-sm" onClick={() => setPointsOpen(true)}>⚙️ Cấu hình điểm</button>
                </div>
                {pointsConfig && (
                  <div className="pce-summary">
                    {pointsConfig.sections.map((s) => (
                      <span key={s.sectionId} className="badge badge-info">
                        {s.sectionName.replace(/^PHẦN \d+\. /, '')}: {s.totalPoints.toFixed(2)}đ ({s.totalQuestions} câu)
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><Settings size={16} /> 2. Cấu hình giao bài</div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Tên bài *</label>
              <input className="form-control" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Bài tập phương trình bậc nhất" />
            </div>
            <div className="form-group">
              <label className="form-label">Mô tả / dặn dò</label>
              <textarea className="form-control" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Học sinh trình bày tự luận đầy đủ, có thể đính kèm ảnh..." />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Lớp *</label>
                <select className="form-select" value={classId} onChange={(e) => setClassId(e.target.value)}>
                  <option value="">-- Chọn lớp --</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.className}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Chế độ</label>
                <select className="form-select" value={mode} onChange={(e) => setMode(e.target.value as AssignmentMode)}>
                  <option value="homework">Bài tập</option>
                  <option value="exam">Kiểm tra</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Mở lúc</label>
                <input className="form-control" type="datetime-local" value={opensAt || dateTimeValue(null)} onChange={(e) => setOpensAt(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Hạn / đóng lúc</label>
                <input className="form-control" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Thời lượng phút</label>
                <input className="form-control" type="number" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} />
              </div>
            </div>
            <div className="assignment-options">
              <label><input type="checkbox" checked={allowResubmit} onChange={(e) => setAllowResubmit(e.target.checked)} /> Cho nộp lại</label>
              <label><input type="checkbox" checked={shuffleQuestions} onChange={(e) => setShuffleQuestions(e.target.checked)} /> Xáo câu</label>
              <label><input type="checkbox" checked={shuffleOptions} onChange={(e) => setShuffleOptions(e.target.checked)} /> Xáo đáp án</label>
              <label><input type="checkbox" disabled={mode !== 'exam'} checked={antiCheat} onChange={(e) => setAntiCheat(e.target.checked)} /> Chống chuyển tab</label>
            </div>
          </div>
        </div>
      </div>

      {classInfo && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">3. Chọn học sinh được giao</div>
          <div className="card-body">
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedStudents(roster.map((s) => s.id))}>Chọn tất cả</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedStudents([])}>Bỏ chọn</button>
              <span className="badge badge-info">{selectedStudents.length}/{roster.length} học sinh</span>
            </div>
            <div className="student-pick-grid">
              {roster.map((s) => (
                <label className="student-pick" key={s.id}>
                  <input type="checkbox" checked={selectedStudents.includes(s.id)} onChange={() => toggleStudent(s.id)} />
                  <span><strong>{s.fullName}</strong><small>{s.studentClass || classInfo.className}</small></span>
                </label>
              ))}
            </div>
            {roster.length === 0 && <div className="empty-state"><h3>Lớp chưa có học sinh</h3></div>}
          </div>
        </div>
      )}

      <div className="assignment-create-footer">
        <button className="btn btn-ghost" onClick={() => nav('/assignments')}>Hủy</button>
        <button className="btn btn-primary" onClick={saveAssignment} disabled={saving || parsing}><Send size={16} /> {saving ? 'Đang giao...' : 'Giao bài'}</button>
      </div>

      {examData && (
        <ExamReviewModal
          open={reviewOpen}
          examData={examData}
          onClose={() => setReviewOpen(false)}
          onConfirm={(data) => {
            setExamData(data);
            // 🆕 Cơ cấu câu hỏi có thể thay đổi sau khi chỉnh đề → tạo lại config
            // theo tỷ lệ mới nhưng GIỮ NGUYÊN thang điểm giáo viên đã chọn.
            setPointsConfig((prev) => createDefaultPointsConfig(data.questions, prev?.maxScore || 10));
            setReviewOpen(false);
            toast('Đã cập nhật đề');
          }}
        />
      )}

      {pointsConfig && (
        <Modal
          open={pointsOpen}
          onClose={() => setPointsOpen(false)}
          title="⚙️ Cấu hình điểm số"
          size="modal-lg"
        >
          <PointsConfigEditor
            config={pointsConfig}
            onChange={(cfg) => { setPointsConfig(cfg); toast('Đã lưu cấu hình điểm'); }}
            onClose={() => setPointsOpen(false)}
          />
        </Modal>
      )}
    </div>
  );
}
