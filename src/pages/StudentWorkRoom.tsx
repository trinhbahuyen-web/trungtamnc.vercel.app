import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Save, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import MathText from '../components/MathText';
import EssayQuestionInput from '../components/EssayQuestionInput';
import {
  Assignment,
  AssignmentExam,
  Question,
  QuestionOption,
  QuestionResult,
  QuestionType,
  Role,
  Submission,
  SubmissionGrade,
} from '../types';
import {
  getAssignmentWithExam,
  getSubmission,
  getSubmissionGrades,
  saveSubmissionDraft,
  startOrGetSubmission,
  submissionIdOf,
  submitAssignment,
} from '../services/assignmentService';
import {
  formatScore,
  getGrade,
  parseTFAnswer,
  parseTFCorrectSet,
  scoreQuestion,
  serializeTFAnswer,
} from '../services/scoringService';

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  const rand = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeQuestionType(q: Question): Exclude<QuestionType, 'unknown'> {
  if (q.type === 'multiple_choice' || q.type === 'true_false' || q.type === 'short_answer' || q.type === 'writing') {
    return q.type;
  }
  if (q.tfStatements && Object.keys(q.tfStatements).length > 0) return 'true_false';
  if (q.options && q.options.length > 0) return 'multiple_choice';
  return 'short_answer';
}

const SECTION_ORDER: Exclude<QuestionType, 'unknown'>[] = [
  'multiple_choice',
  'true_false',
  'short_answer',
  'writing',
];

const SECTION_META: Record<Exclude<QuestionType, 'unknown'>, {
  part: number;
  icon: string;
  title: string;
  desc: string;
  cls: string;
}> = {
  multiple_choice: {
    part: 1,
    icon: '📝',
    title: 'PHẦN 1. TRẮC NGHIỆM NHIỀU LỰA CHỌN',
    desc: 'Chọn một phương án đúng A, B, C hoặc D',
    cls: 'section-mc',
  },
  true_false: {
    part: 2,
    icon: '✅',
    title: 'PHẦN 2. TRẮC NGHIỆM ĐÚNG / SAI',
    desc: 'Chọn Đúng hoặc Sai cho từng mệnh đề',
    cls: 'section-tf',
  },
  short_answer: {
    part: 3,
    icon: '✏️',
    title: 'PHẦN 3. TRẢ LỜI NGẮN',
    desc: 'Nhập đáp án ngắn hoặc công thức bằng MathLive',
    cls: 'section-sa',
  },
  writing: {
    part: 4,
    icon: '🖊️',
    title: 'PHẦN 4. TỰ LUẬN',
    desc: 'Trình bày lời giải, có thể chèn công thức và đính kèm ảnh bài làm',
    cls: 'section-writing',
  },
};

function formatTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = m < 10 ? `0${m}` : String(m);
  const ss = sec < 10 ? `0${sec}` : String(sec);
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function hasAnswer(q: Question, val?: string) {
  if (!val) return false;
  const type = normalizeQuestionType(q);
  if (type === 'true_false') {
    const opts = getTrueFalseOptions(q);
    const map = parseTFAnswer(val);
    return opts.length > 0 && opts.every((o) => map[o.letter.toLowerCase()] !== undefined);
  }
  if (type === 'writing') {
    try {
      const parsed = JSON.parse(val);
      return Boolean(parsed?.text?.trim?.() || parsed?.images?.length);
    } catch {
      return val.trim().length > 0;
    }
  }
  return val.trim().length > 0;
}

function mathify(v: string): string {
  const t = (v || '').trim();
  if (!t) return '';
  return t.includes('$') ? t : `$${t}$`;
}

function getTrueFalseOptions(question: Question): QuestionOption[] {
  if (question.options?.length) return question.options;
  return Object.entries(question.tfStatements || {}).map(([letter, text]) => ({ letter, text }));
}

interface QuestionSection {
  type: Exclude<QuestionType, 'unknown'>;
  meta: typeof SECTION_META[Exclude<QuestionType, 'unknown'>];
  questions: Array<{ q: Question; displayNum: number }>;
}

export default function StudentWorkRoom() {
  const { assignmentId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [exam, setExam] = useState<AssignmentExam | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showTabWarning, setShowTabWarning] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [grades, setGrades] = useState<SubmissionGrade[]>([]);

  const lastSaveRef = useRef<number>(0);
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, user?.studentId]);

  async function loadGrades(submissionId: string) {
    try {
      setGrades(await getSubmissionGrades(submissionId));
    } catch {
      setGrades([]);
    }
  }

  async function load() {
    if (!assignmentId || !user?.studentId || user.role !== Role.STUDENT) return;
    setLoading(true);
    try {
      const { assignment: a, exam: e } = await getAssignmentWithExam(assignmentId);
      const now = Date.now();

      // 🆕 Nếu đã nộp rồi → vào chế độ XEM KẾT QUẢ, không check giờ mở/đóng nữa
      // (học sinh xem lại được cả sau khi bài đóng).
      const existing = await getSubmission(submissionIdOf(a.id, user.studentId));
      if (existing && existing.status !== 'in_progress') {
        setAssignment(a);
        setExam(e);
        setSubmission(existing);
        setAnswers(existing.answers || {});
        setTimeLeft(null);
        await loadGrades(existing.id);
        return;
      }

      if (a.opensAt && now < a.opensAt.getTime()) {
        throw new Error(`Bài chưa mở. Mở lúc ${a.opensAt.toLocaleString('vi-VN')}`);
      }
      if (a.closesAt && now > a.closesAt.getTime()) {
        throw new Error('Bài đã hết hạn hoặc đã đóng.');
      }
      if (a.status !== 'published') {
        throw new Error('Bài chưa được mở cho học sinh.');
      }

      const sub = await startOrGetSubmission({
        assignment: a,
        exam: e,
        studentId: user.studentId,
        studentName: user.name,
      });

      setAssignment(a);
      setExam(e);
      setSubmission(sub);
      setAnswers(sub.answers || {});

      if (a.mode === 'exam' && a.timeLimit > 0 && sub.startedAt) {
        const end = sub.startedAt.getTime() + a.timeLimit * 60 * 1000;
        const byClose = a.closesAt ? Math.min(end, a.closesAt.getTime()) : end;
        setTimeLeft(Math.max(0, Math.floor((byClose - Date.now()) / 1000)));
      } else if (a.closesAt) {
        setTimeLeft(Math.max(0, Math.floor((a.closesAt.getTime() - Date.now()) / 1000)));
      } else {
        setTimeLeft(null);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi vào làm bài', 'error');
      nav('/student');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!assignment?.antiCheat || assignment.mode !== 'exam') return;

    const onHidden = () => {
      if (!document.hidden) return;
      setTabSwitchCount((c) => c + 1);
      setShowTabWarning(true);
      window.setTimeout(() => setShowTabWarning(false), 4200);
    };

    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, [assignment?.antiCheat, assignment?.mode]);

  useEffect(() => {
    if (timeLeft === null) return;
    if (timeLeft <= 0) {
      if (submission?.status === 'in_progress' && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        doSubmit(true);
      }
      return;
    }
    const timer = window.setTimeout(() => setTimeLeft((t) => (t === null ? null : Math.max(0, t - 1))), 1000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, submission?.status]);

  useEffect(() => {
    if (!submission || submission.status !== 'in_progress') return;
    const now = Date.now();
    if (now - lastSaveRef.current < 1200) return;
    lastSaveRef.current = now;
    const timer = window.setTimeout(() => saveSubmissionDraft(submission.id, answers).catch(() => undefined), 800);
    return () => window.clearTimeout(timer);
  }, [answers, submission]);

  const seedBase = `${assignment?.id || ''}_${user?.studentId || ''}`;

  const questionSections = useMemo<QuestionSection[]>(() => {
    if (!exam || !assignment) return [];
    const byType = new Map<Exclude<QuestionType, 'unknown'>, Question[]>();

    for (const q of exam.questions || []) {
      const type = normalizeQuestionType(q);
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type)!.push(q);
    }

    let running = 0;
    const sections: QuestionSection[] = [];

    for (const type of SECTION_ORDER) {
      let qs = byType.get(type) || [];
      if (qs.length === 0) continue;

      // Chỉ xáo trộn TRONG TỪNG PHẦN, không trộn chung 22 câu lộn xộn.
      if (assignment.shuffleQuestions) {
        qs = shuffle(qs, seedFrom(`${seedBase}_${type}`));
      }

      sections.push({
        type,
        meta: SECTION_META[type],
        questions: qs.map((q) => ({ q, displayNum: ++running })),
      });
    }

    return sections;
  }, [exam, assignment, seedBase]);

  const flatQuestions = useMemo(
    () => questionSections.flatMap((s) => s.questions.map((x) => x.q)),
    [questionSections]
  );

  const answeredCount = useMemo(
    () => flatQuestions.filter((q) => hasAnswer(q, answers[String(q.number)])).length,
    [flatQuestions, answers]
  );

  const totalQuestions = flatQuestions.length;
  const progress = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;
  const readonly = submission?.status !== 'in_progress';

  function setAns(q: Question, val: string) {
    if (readonly) return;
    setAnswers((p) => ({ ...p, [String(q.number)]: val }));
  }

  async function saveNow() {
    if (!submission || readonly) return;
    setSaving(true);
    try {
      await saveSubmissionDraft(submission.id, answers);
      toast('Đã lưu nháp');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi lưu nháp', 'error');
    } finally {
      setSaving(false);
    }
  }

  // 🆕 Kết quả từng câu để xem lại: ưu tiên bản đã lưu khi nộp,
  // submission cũ chưa có → tự tính lại từ đề (cùng logic scoringService).
  const questionResults = useMemo<Record<string, QuestionResult>>(() => {
    if (!readonly || !exam || !submission) return {};
    if (submission.questionResults && Object.keys(submission.questionResults).length > 0) {
      return submission.questionResults;
    }
    const computed: Record<string, QuestionResult> = {};
    for (const q of exam.questions) {
      computed[String(q.number)] = scoreQuestion(q, submission.answers[String(q.number)], exam.pointsConfig);
    }
    return computed;
  }, [readonly, exam, submission]);

  const gradeByQuestion = useMemo(() => {
    const map = new Map<number, SubmissionGrade>();
    grades.forEach((g) => {
      if (typeof g.questionNumber === 'number') map.set(g.questionNumber, g);
    });
    return map;
  }, [grades]);

  async function doSubmit(auto = false) {
    if (!submission || !exam || !assignment) return;
    setSubmitting(true);
    setShowConfirm(false);
    try {
      const result = await submitAssignment({
        submissionId: submission.id,
        questions: exam.questions,
        answers,
        tabSwitchCount,
        autoSubmitted: auto,
        pointsConfig: exam.pointsConfig, // 🆕 chấm theo cấu hình điểm
      });
      setSubmission(result);
      setTimeLeft(null);
      await loadGrades(result.id);
      toast(auto ? 'Đã tự động nộp bài khi hết giờ. Xem kết quả bên dưới!' : 'Đã nộp bài! Xem kết quả bên dưới 👇');
      // 🆕 Ở lại trang để học sinh xem kết quả ngay, cuộn lên đầu
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Lỗi nộp bài', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="work-loading-screen">
        <div className="work-loading-card">
          <div className="spinner" />
          <p>Đang tải đề thi...</p>
        </div>
      </div>
    );
  }

  if (!assignment || !exam || !submission) return null;

  return (
    <div className="student-work-page examroom-style-page">
      {assignment.antiCheat && assignment.mode === 'exam' && (
        <DynamicWatermark
          studentId={user?.studentId || ''}
          studentName={user?.name || ''}
          assignmentTitle={assignment.title}
        />
      )}

      <div className="examroom-topbar">
        <div className="examroom-topbar-inner">
          <div className="examroom-row-main">
            <button className="exam-back-btn" onClick={() => nav('/student')}>
              <ArrowLeft size={16} /> Quay lại
            </button>

            <div className="exam-student-box">
              <div className="exam-student-avatar">{(user?.name || 'H')[0].toUpperCase()}</div>
              <div>
                <strong>{user?.name}</strong>
                <span>{assignment.className} · {assignment.mode === 'exam' ? 'Kiểm tra' : 'Bài tập'}</span>
              </div>
            </div>

            <div className="exam-top-actions">
              {assignment.antiCheat && assignment.mode === 'exam' && (
                <span className="exam-violation-badge">
                  <AlertTriangle size={13} /> Chuyển tab: {tabSwitchCount}
                </span>
              )}
              {timeLeft !== null && (
                <span className={`exam-timer ${timeLeft < 60 ? 'danger' : ''}`}>
                  <Clock size={15} /> {formatTime(timeLeft)}
                </span>
              )}
              {!readonly && (
                <button className="exam-submit-top" onClick={() => setShowConfirm(true)} disabled={submitting}>
                  <Send size={15} /> Nộp bài
                </button>
              )}
            </div>
          </div>

          <div className="exam-progress-row">
            <div className="exam-progress-text">
              <span>✍️ {answeredCount}/{totalQuestions} câu</span>
              <strong>{progress}%{progress === 100 ? ' 🔥' : ''}</strong>
            </div>
            <div className="exam-progress-track">
              <div className="exam-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </div>

      {showTabWarning && (
        <div className="exam-tab-warning">
          ⚠️ Cảnh báo: phát hiện chuyển tab ({tabSwitchCount})
        </div>
      )}

      <main className="examroom-main">
        <section className="exam-title-card">
          <div>
            <h1>{exam.title}</h1>
            <p>{assignment.description || 'Không có dặn dò.'}</p>
          </div>
          <div className="exam-title-stats">
            <span>{totalQuestions}</span>
            <small>câu hỏi</small>
          </div>
        </section>

        {readonly && (
          <ResultSummary submission={submission} exam={exam} grades={grades} results={questionResults} />
        )}

        {questionSections.map((section) => (
          <section key={section.type} className="exam-question-section">
            <div className={`exam-section-header ${section.meta.cls}`}>
              <div className="exam-section-icon">{section.meta.icon}</div>
              <div>
                <h2>{section.meta.title}</h2>
                <p>{section.meta.desc}</p>
              </div>
              <span>{section.questions.length} câu</span>
            </div>

            <div className="exam-question-list">
              {section.questions.map(({ q, displayNum }) => (
                <QuestionBlock
                  key={q.number}
                  index={displayNum}
                  question={q}
                  value={answers[String(q.number)] || ''}
                  onChange={(val) => setAns(q, val)}
                  disabled={readonly}
                  shuffleOptions={assignment.shuffleOptions}
                  seed={seedFrom(`${seedBase}_${section.type}_${q.number}`)}
                  reviewMode={readonly}
                  result={questionResults[String(q.number)]}
                  grade={gradeByQuestion.get(q.number)}
                />
              ))}
            </div>
          </section>
        ))}

        {!readonly && (
          <div className="exam-bottom-submit">
            <button className="btn btn-ghost" onClick={saveNow} disabled={saving}>
              <Save size={16} /> {saving ? 'Đang lưu...' : 'Lưu nháp'}
            </button>
            <button className="btn btn-primary" onClick={() => setShowConfirm(true)} disabled={submitting}>
              <Send size={16} /> Nộp bài
            </button>
          </div>
        )}
      </main>

      {showConfirm && (
        <div className="exam-confirm-overlay" onClick={(e) => e.target === e.currentTarget && setShowConfirm(false)}>
          <div className="exam-confirm-modal">
            <div className="exam-confirm-icon">{answeredCount === totalQuestions ? '🎯' : '📝'}</div>
            <h3>Xác nhận nộp bài?</h3>
            <p>Đã trả lời <strong>{answeredCount}/{totalQuestions}</strong> câu.</p>
            {answeredCount < totalQuestions && (
              <div className="exam-unfinished-warning">
                Còn {totalQuestions - answeredCount} câu chưa hoàn thành.
              </div>
            )}
            <div className="exam-confirm-actions">
              <button className="btn btn-ghost" onClick={() => setShowConfirm(false)}>
                Tiếp tục làm
              </button>
              <button className="btn btn-primary" onClick={() => doSubmit(false)} disabled={submitting}>
                {submitting ? 'Đang nộp...' : 'Nộp bài'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🆕 BẢNG KẾT QUẢ — hiện ngay sau khi nộp bài
// ─────────────────────────────────────────────────────────────────────────────
function ResultSummary({ submission, exam, grades, results }: {
  submission: Submission;
  exam: AssignmentExam;
  grades: SubmissionGrade[];
  results: Record<string, QuestionResult>;
}) {
  const resultList = Object.values(results);
  const correctCount = resultList.filter((r) => r.status === 'correct').length;
  const partialCount = resultList.filter((r) => r.status === 'partial').length;
  const wrongCount = resultList.filter((r) => r.status === 'wrong' || r.status === 'unanswered').length;

  // Tự luận: chờ chấm vs đã chấm (GV/AI lưu vào submissionGrades)
  const pendingResults = resultList.filter((r) => r.status === 'pending');
  const essayGrades = grades.filter((g) => typeof g.questionNumber === 'number' && g.status === 'GRADED');
  const essayGradedNumbers = new Set(essayGrades.map((g) => g.questionNumber));
  const essayPoints = essayGrades.reduce((sum, g) => sum + (Number(g.score) || 0), 0);
  const essayPendingCount = exam.questions.filter(
    (q) => results[String(q.number)]?.status === 'pending' && !essayGradedNumbers.has(q.number)
  ).length;

  const finalGrade = grades.find((g) => g.questionNumber === 'FINAL');
  const isFinalized = submission.status === 'graded' || Boolean(finalGrade);

  // Điểm hiển thị chính:
  // - Đã chốt điểm cuối → finalScore
  // - Chưa chốt → điểm tự động + điểm tự luận đã chấm (nếu có)
  const displayScore = isFinalized
    ? (submission.finalScore ?? finalGrade?.score ?? submission.autoScore)
    : parseFloat((submission.autoScore + essayPoints).toFixed(2));
  const maxScore = submission.maxScore || exam.maxScore || 10;
  const percentage = maxScore > 0 ? Math.max(0, Math.min(100, Math.round((displayScore / maxScore) * 100))) : 0;
  const grade = getGrade(percentage);

  return (
    <section className="result-summary-card">
      <div className="result-summary-head">
        <CheckCircle2 size={20} />
        <h2>{isFinalized ? 'Kết quả (đã chốt điểm)' : 'Kết quả bài làm'}</h2>
        {submission.submittedAt && (
          <span className="result-submitted-at">Nộp lúc {submission.submittedAt.toLocaleString('vi-VN')}</span>
        )}
      </div>

      <div className="result-summary-body">
        <div className="result-score-circle" style={{ borderColor: grade.color }}>
          <strong style={{ color: grade.color }}>{formatScore(displayScore)}</strong>
          <span>/ {formatScore(maxScore)}</span>
        </div>

        <div className="result-grade-box">
          <span className="result-grade-emoji">{grade.emoji}</span>
          <strong style={{ color: grade.color }}>{grade.grade} · {grade.label}</strong>
          <small>{percentage}%</small>
        </div>

        <div className="result-stats">
          <div className="result-stat correct"><strong>{correctCount}</strong><span>Đúng</span></div>
          {partialCount > 0 && <div className="result-stat partial"><strong>{partialCount}</strong><span>Đúng một phần</span></div>}
          <div className="result-stat wrong"><strong>{wrongCount}</strong><span>Sai / bỏ trống</span></div>
          {pendingResults.length > 0 && (
            <div className="result-stat pending"><strong>{pendingResults.length}</strong><span>Câu tự luận</span></div>
          )}
        </div>
      </div>

      {/* Ghi chú tự luận */}
      {pendingResults.length > 0 && (
        <div className={`result-essay-note ${essayPendingCount === 0 ? 'done' : ''}`}>
          {essayPendingCount > 0 ? (
            <>⏳ Có <strong>{essayPendingCount}</strong> câu tự luận đang chờ giáo viên chấm — điểm trên chưa gồm phần này. Điểm sẽ tự cập nhật khi giáo viên chấm xong.</>
          ) : (
            <>🖊️ Phần tự luận đã được chấm: <strong>+{formatScore(essayPoints)}đ</strong> (đã cộng vào điểm trên).</>
          )}
        </div>
      )}

      {finalGrade?.feedback && (
        <div className="result-final-feedback">
          <strong>💬 Nhận xét của giáo viên:</strong> {finalGrade.feedback}
        </div>
      )}

      <p className="result-review-hint">👇 Kéo xuống để xem chi tiết từng câu: đáp án của bạn, đáp án đúng và lời giải (nếu có).</p>
    </section>
  );
}

function QuestionBlock({ question, value, onChange, disabled, index, shuffleOptions, seed, reviewMode, result, grade }: {
  key?: any;
  question: Question;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  index: number;
  shuffleOptions: boolean;
  seed: number;
  reviewMode?: boolean;
  result?: QuestionResult;
  grade?: SubmissionGrade;
}) {
  const type = normalizeQuestionType(question);
  const isAnswered = hasAnswer(question, value);

  const options = useMemo(() => {
    const opts = question.options || [];
    if (!shuffleOptions) return opts;
    if (type === 'multiple_choice') return shuffle(opts, seed);
    if (type === 'true_false') {
      const tfOpts = opts.length ? opts : getTrueFalseOptions(question);
      const dOpt = tfOpts.find((o) => o.letter.toLowerCase() === 'd');
      const movable = tfOpts.filter((o) => o.letter.toLowerCase() !== 'd');
      const mixed = shuffle(movable, seed);
      return dOpt ? [...mixed, dOpt] : mixed;
    }
    return opts;
  }, [question, type, shuffleOptions, seed]);

  const imageUrls = useMemo(() => {
    return (question.images || [])
      .map((img) => {
        if (!img.base64) return null;
        const contentType = img.contentType || 'image/png';
        return img.base64.startsWith('data:') ? img.base64 : `data:${contentType};base64,${img.base64}`;
      })
      .filter(Boolean) as string[];
  }, [question.images]);

  const meta = SECTION_META[type];

  // 🆕 Trạng thái review của câu (viền + badge)
  const essayGraded = type === 'writing' && grade && grade.status === 'GRADED';
  const reviewCls = !reviewMode || !result
    ? ''
    : result.status === 'correct' || (essayGraded && grade!.score >= result.maxPoints)
    ? 'review-correct'
    : result.status === 'partial' || essayGraded
    ? 'review-partial'
    : result.status === 'pending'
    ? 'review-pending'
    : 'review-wrong';

  return (
    <article className={`exam-question-card ${isAnswered ? 'answered' : ''} ${reviewCls}`}>
      <header className="exam-question-head">
        <div className={`exam-question-number ${isAnswered ? 'done' : ''}`}>{index}</div>
        <div className="exam-question-title">
          <span className={`exam-type-pill ${meta.cls}`}>{meta.icon} {typeLabel(type)}</span>
          {reviewMode && result && (
            <ResultBadge result={result} grade={grade} type={type} />
          )}
          <MathText html={question.text} block className="question-text exam-question-text" />
          {imageUrls.length > 0 && (
            <div className="exam-question-images">
              {imageUrls.map((url, i) => (
                <img key={i} src={url} alt={`Hình ${i + 1} - Câu ${index}`} />
              ))}
            </div>
          )}
        </div>
        <span className="exam-point-badge">
          {reviewMode && result
            ? `${formatScore(type === 'writing' && essayGraded ? grade!.score : result.points)}/${formatScore(result.maxPoints)}đ`
            : `${formatScore(Number(question.points) || 1)}đ`}
        </span>
      </header>

      <div className="exam-answer-area">
        {type === 'multiple_choice' && (
          <MultipleChoiceOptions
            options={options}
            value={value}
            disabled={disabled}
            onChange={onChange}
            reviewMode={reviewMode}
            correctAnswer={question.correctAnswer || ''}
          />
        )}

        {type === 'true_false' && (
          <TrueFalseGrid
            options={options.length ? options : getTrueFalseOptions(question)}
            value={value}
            disabled={disabled}
            onChange={onChange}
            reviewMode={reviewMode}
            correctAnswer={question.correctAnswer || ''}
          />
        )}

        {type === 'short_answer' && (
          <ShortMathInput
            value={value}
            disabled={disabled}
            onChange={onChange}
            reviewMode={reviewMode}
            result={result}
            correctAnswer={question.correctAnswer || ''}
          />
        )}

        {type === 'writing' && (
          <>
            <EssayQuestionInput value={value} disabled={disabled} onChange={onChange} />
            {reviewMode && <EssayGradeBox grade={grade} maxPoints={result?.maxPoints ?? (Number(question.points) || 1)} />}
          </>
        )}

        {/* 🆕 Lời giải (nếu đề có) — chỉ hiện khi xem lại */}
        {reviewMode && question.solution && (
          <details className="review-solution">
            <summary>💡 Xem lời giải</summary>
            <MathText html={question.solution} block />
          </details>
        )}
      </div>
    </article>
  );
}

function ResultBadge({ result, grade, type }: { result: QuestionResult; grade?: SubmissionGrade; type: Exclude<QuestionType, 'unknown'> }) {
  if (type === 'writing') {
    if (grade && grade.status === 'GRADED') {
      return <span className="review-badge partial">🖊️ Đã chấm: {formatScore(grade.score)}/{formatScore(result.maxPoints)}đ</span>;
    }
    return <span className="review-badge pending">⏳ Chờ giáo viên chấm</span>;
  }
  if (result.status === 'correct') return <span className="review-badge correct">✓ Chính xác</span>;
  if (result.status === 'partial') {
    return (
      <span className="review-badge partial">
        ◐ Đúng {result.tfCorrectCount}/{result.tfTotal} ý · {formatScore(result.points)}đ
      </span>
    );
  }
  if (result.status === 'unanswered') return <span className="review-badge wrong">— Chưa trả lời</span>;
  return <span className="review-badge wrong">✕ Chưa chính xác</span>;
}

function EssayGradeBox({ grade, maxPoints }: { grade?: SubmissionGrade; maxPoints: number }) {
  if (!grade || grade.status === 'NOT_GRADED') {
    return (
      <div className="review-essay-box pending">
        ⏳ <strong>Chờ chấm:</strong> câu tự luận sẽ được giáo viên (hoặc AI) chấm và cập nhật điểm sau.
      </div>
    );
  }
  return (
    <div className="review-essay-box graded">
      <div className="review-essay-score">
        🖊️ Điểm tự luận: <strong>{formatScore(grade.score)}/{formatScore(maxPoints)}đ</strong>
        {grade.gradedByName && <small> · Chấm bởi {grade.gradedByName}</small>}
      </div>
      {(grade.feedback || grade.aiFeedback) && (
        <div className="review-essay-feedback">
          <strong>Nhận xét:</strong>
          <MathText html={grade.feedback || grade.aiFeedback || ''} block />
        </div>
      )}
    </div>
  );
}

function typeLabel(type: Exclude<QuestionType, 'unknown'>) {
  if (type === 'multiple_choice') return 'Trắc nghiệm';
  if (type === 'true_false') return 'Đúng / Sai';
  if (type === 'short_answer') return 'Trả lời ngắn';
  return 'Tự luận';
}

function MultipleChoiceOptions({ options, value, disabled, onChange, reviewMode, correctAnswer }: {
  options: QuestionOption[];
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
  reviewMode?: boolean;
  correctAnswer?: string;
}) {
  const correct = (correctAnswer || '').trim().toUpperCase();
  return (
    <div className="exam-mc-list">
      {options.map((o, idx) => {
        const displayLetter = String.fromCharCode(65 + idx);
        const selected = value.toUpperCase() === o.letter.toUpperCase();
        const isCorrectOption = reviewMode && correct && o.letter.toUpperCase() === correct;
        const isWrongPick = reviewMode && selected && correct && !isCorrectOption;

        const cls = [
          'exam-mc-option',
          selected ? 'selected' : '',
          isCorrectOption ? 'review-right' : '',
          isWrongPick ? 'review-wrong-pick' : '',
        ].filter(Boolean).join(' ');

        return (
          <label key={`${o.letter}_${idx}`} className={cls}>
            <input
              type="radio"
              disabled={disabled}
              checked={selected}
              onChange={() => onChange(o.letter)}
            />
            <span className="exam-mc-letter">{displayLetter}</span>
            <MathText html={o.text} className="exam-option-text" />
            {reviewMode ? (
              <>
                {isCorrectOption && <em className="exam-mc-check right">✓ Đáp án đúng</em>}
                {isWrongPick && <em className="exam-mc-check wrongpick">✕ Bạn chọn</em>}
                {isCorrectOption && selected && <em className="exam-mc-check right">· Bạn chọn đúng</em>}
              </>
            ) : (
              selected && <em className="exam-mc-check">✓</em>
            )}
          </label>
        );
      })}
    </div>
  );
}

function TrueFalseGrid({ options, value, disabled, onChange, reviewMode, correctAnswer }: {
  options: QuestionOption[];
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
  reviewMode?: boolean;
  correctAnswer?: string;
}) {
  const map = parseTFAnswer(value);
  const correctSet = parseTFCorrectSet(correctAnswer); // các ý có đáp án ĐÚNG

  function set(letter: string, val: 'T' | 'F') {
    if (disabled) return;
    const key = letter.toLowerCase();
    const next = { ...map };
    if (next[key] === val) delete next[key];
    else next[key] = val;
    onChange(serializeTFAnswer(next));
  }

  const answered = options.filter((o) => map[o.letter.toLowerCase()] !== undefined).length;
  const allAnswered = answered === options.length && options.length > 0;

  return (
    <div className="exam-tf-wrap">
      {/* Progress mini */}
      <div className="exam-tf-progress">
        <span>Đã chọn {answered}/{options.length} mệnh đề</span>
        {allAnswered && (
          <strong className="exam-tf-done">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
              <path d="M10.28 2.28a1 1 0 0 0-1.41 0L4.5 6.66 3.13 5.28a1 1 0 0 0-1.41 1.42l2.09 2.09a1 1 0 0 0 1.41 0l5.06-5.1a1 1 0 0 0 0-1.41Z" />
            </svg>
            Hoàn thành
          </strong>
        )}
      </div>

      {/* Table */}
      <div className="exam-tf-table">
        {/* Header row */}
        <div className="exam-tf-header">
          <div className="exam-tf-head-statement">Mệnh đề</div>
          <div className="exam-tf-head-true">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 0 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0Z" clipRule="evenodd" />
            </svg>
            <span>Đúng</span>
          </div>
          <div className="exam-tf-head-false">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414Z" clipRule="evenodd" />
            </svg>
            <span>Sai</span>
          </div>
        </div>

        {/* Option rows */}
        {options.map((o, idx) => {
          const key = o.letter.toLowerCase();
          const choseT = map[key] === 'T';
          const choseF = map[key] === 'F';
          const displayLetter = String.fromCharCode(97 + idx);

          // 🆕 Review: đối chiếu với đáp án đúng
          const correctIsTrue = correctSet.has(key);
          const rowAnswered = choseT || choseF;
          const isRight = reviewMode && rowAnswered && ((choseT && correctIsTrue) || (choseF && !correctIsTrue));
          const isWrong = reviewMode && rowAnswered && !isRight;
          const rowCls = reviewMode
            ? isRight ? 'true' : isWrong ? 'false' : idx % 2 === 1 ? 'alt' : ''
            : choseT ? 'true' : choseF ? 'false' : idx % 2 === 1 ? 'alt' : '';

          return (
            <div
              key={`${o.letter}_${idx}`}
              className={`exam-tf-row ${rowCls}`}
            >
              {/* Statement */}
              <div className="exam-tf-statement">
                <span className={`exam-tf-letter ${
                  reviewMode
                    ? isRight ? 'true' : isWrong ? 'false' : ''
                    : choseT ? 'true' : choseF ? 'false' : ''
                }`}>{displayLetter}</span>
                <MathText html={o.text} className="exam-option-text exam-tf-text" />
                {reviewMode && (
                  <span className={`exam-tf-verdict ${isRight ? 'right' : isWrong ? 'wrong' : 'missed'}`}>
                    {isRight ? '✓' : isWrong ? '✕' : '—'}
                  </span>
                )}
              </div>

              {/* Đúng cell */}
              <button
                type="button"
                disabled={disabled}
                aria-label={`Mệnh đề ${displayLetter}: Đúng`}
                aria-pressed={choseT}
                className={`exam-tf-cell exam-tf-cell-true ${choseT ? 'active' : ''} ${reviewMode && correctIsTrue ? 'is-answer' : ''}`}
                onClick={() => set(o.letter, 'T')}
              >
                {choseT ? (
                  <span className="exam-tf-mark">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 0 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0Z" clipRule="evenodd" />
                    </svg>
                  </span>
                ) : (
                  <span className="exam-tf-circle" />
                )}
              </button>

              {/* Sai cell */}
              <button
                type="button"
                disabled={disabled}
                aria-label={`Mệnh đề ${displayLetter}: Sai`}
                aria-pressed={choseF}
                className={`exam-tf-cell exam-tf-cell-false ${choseF ? 'active' : ''} ${reviewMode && !correctIsTrue ? 'is-answer' : ''}`}
                onClick={() => set(o.letter, 'F')}
              >
                {choseF ? (
                  <span className="exam-tf-mark">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414Z" clipRule="evenodd" />
                    </svg>
                  </span>
                ) : (
                  <span className="exam-tf-circle" />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Hint */}
      {!reviewMode && answered > 0 && !allAnswered && (
        <p className="exam-tf-hint">⚠️ Còn {options.length - answered} mệnh đề chưa chọn Đúng/Sai</p>
      )}
      {reviewMode && (
        <p className="exam-tf-legend">Ô có <span className="exam-tf-legend-ring" /> viền là đáp án đúng của từng mệnh đề.</p>
      )}
    </div>
  );
}

function ShortMathInput({ value, disabled, onChange, reviewMode, result, correctAnswer }: {
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
  reviewMode?: boolean;
  result?: QuestionResult;
  correctAnswer?: string;
}) {
  const [mathReady, setMathReady] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // 1) Load MathLive từ CDN (giữ nguyên logic cũ)
  useEffect(() => {
    if (window.customElements?.get('math-field')) {
      setMathReady(true);
      return;
    }
    const id = 'mathlive-cdn-script';
    if (!document.getElementById(id)) {
      const s = document.createElement('script');
      s.id = id;
      s.src = 'https://unpkg.com/mathlive';
      s.defer = true;
      s.onload = () => setMathReady(true);
      document.body.appendChild(s);
    }
    const timer = window.setInterval(() => {
      if (window.customElements?.get('math-field')) {
        setMathReady(true);
        window.clearInterval(timer);
      }
    }, 300);
    return () => window.clearInterval(timer);
  }, []);

  // 2) Tạo <math-field> bằng DOM trực tiếp — tránh lỗi React ghi
  //    readOnly={false} thành attribute readonly="false" (bị hiểu là true
  //    → không gõ được) và tránh lỗi className không ăn style.
  useEffect(() => {
    if (!mathReady || !hostRef.current) return;

    const mf: any = document.createElement('math-field');
    mf.className = 'mathlive-field short-answer-math exam-short-math';

    // Gán qua PROPERTY, không phải attribute
    mf.value = value || '';
    mf.readOnly = disabled;
    try {
      mf.mathVirtualKeyboardPolicy = 'auto'; // bàn phím ảo tự bật trên mobile
    } catch { /* phiên bản cũ không có — bỏ qua */ }

    const handler = () => onChangeRef.current(mf.value || '');
    mf.addEventListener('input', handler);

    hostRef.current.appendChild(mf);
    fieldRef.current = mf;

    return () => {
      mf.removeEventListener('input', handler);
      mf.remove();
      fieldRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mathReady]);

  // 3) Đồng bộ value / disabled từ ngoài vào (VD: load lại nháp đã lưu)
  useEffect(() => {
    const mf = fieldRef.current;
    if (mf && mf.value !== value) mf.value = value || '';
  }, [value, mathReady]);

  useEffect(() => {
    const mf = fieldRef.current;
    if (mf) mf.readOnly = disabled;
  }, [disabled, mathReady]);

  // 🆕 Chế độ xem lại: hiện đáp án của HS + đáp án đúng, không cần MathLive
  if (reviewMode) {
    const isCorrect = result?.status === 'correct';
    const unanswered = !value || !value.trim();
    return (
      <div className={`exam-sa-box review ${isCorrect ? 'right' : 'wrong'}`}>
        <label className="exam-sa-label">Đáp án của bạn</label>
        <div className={`review-sa-answer ${isCorrect ? 'right' : 'wrong'}`}>
          {unanswered ? <em>— Chưa trả lời —</em> : <MathText html={mathify(value)} />}
          <span className="review-sa-mark">{isCorrect ? '✓' : '✕'}</span>
        </div>
        {!isCorrect && correctAnswer && (
          <div className="review-sa-correct">
            <span>Đáp án đúng:</span> <MathText html={mathify(correctAnswer)} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`exam-sa-box ${value ? 'has-answer' : ''}`}>
      <label className="exam-sa-label">Đáp án của bạn</label>
      {mathReady ? (
        <div ref={hostRef} className="exam-mathfield-host" />
      ) : (
        <input
          className="form-control short-answer-input exam-short-input"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Nhập đáp án số..."
        />
      )}
      <p className="exam-sa-hint">
        <span>💡</span>
        <span>Nhập đáp án số (VD: 42 hoặc -3.5) hoặc công thức toán</span>
      </p>
    </div>
  );
}

function DynamicWatermark({ studentId, studentName, assignmentTitle }: {
  studentId: string;
  studentName: string;
  assignmentTitle: string;
}) {
  const watermarkText = `${studentId} - ${studentName} - ${assignmentTitle}`;
  return (
    <div className="exam-watermark" aria-hidden="true">
      <div>{watermarkText}</div>
      <div>{watermarkText}</div>
      <div>{watermarkText}</div>
    </div>
  );
}
