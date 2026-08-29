import React, { useState } from 'react';
import { Question, Submission } from '../types';
import {
  EssayGradeResult,
  getGeminiApiKey,
  gradeEssayWithGemini,
  parseEssayAnswer,
  setGeminiApiKey,
} from '../services/essayGradingService';
import MathText from './MathText';

interface Props {
  submission: Submission;
  questions: Question[];
  onSuggested?: (questionNumber: number, result: EssayGradeResult) => void;
}

export default function EssayGraderPanel({ submission, questions, onSuggested }: Props) {
  const writing = questions.filter((q) => q.type === 'writing');
  const [apiKey, setApiKeyState] = useState(getGeminiApiKey());
  const [tempKey, setTempKey] = useState('');
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const [results, setResults] = useState<Record<number, EssayGradeResult>>({});

  if (writing.length === 0) {
    return <div className="empty-state"><h3>Không có câu tự luận</h3><p>Bài này không cần chấm bằng AI Gemini.</p></div>;
  }

  const saveKey = () => {
    const key = tempKey.trim();
    if (!key) return;
    setGeminiApiKey(key);
    setApiKeyState(key);
    setTempKey('');
  };

  const buildRubric = (q: Question) =>
    [
      q.correctAnswer ? `RUBRIC / BAREM ĐIỂM:
${q.correctAnswer}` : '',
      q.solution ? `LỜI GIẢI THAM KHẢO:
${q.solution}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

  const gradeOne = async (q: Question) => {
    const raw = submission.answers[String(q.number)] || '';
    if (!raw) return;
    setBusy((b) => ({ ...b, [q.number]: true }));
    try {
      const r = await gradeEssayWithGemini(
        q.text,
        raw,
        Number(q.points) || 1,
        buildRubric(q),
        apiKey
      );
      setResults((p) => ({ ...p, [q.number]: r }));
      if (!r.error && !r.pending) onSuggested?.(q.number, r);
    } finally {
      setBusy((b) => ({ ...b, [q.number]: false }));
    }
  };

  return (
    <div className="ai-grader-panel">
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header">AI Gemini gợi ý chấm tự luận</div>
        <div className="card-body">
          {!apiKey ? (
            <div className="form-row">
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label className="form-label">Gemini API key</label>
                <input className="form-control" value={tempKey} onChange={(e) => setTempKey(e.target.value)} placeholder="Nhập API key của giáo viên/trung tâm" />
              </div>
              <div style={{ display: 'flex', alignItems: 'end' }}>
                <button className="btn btn-primary" onClick={saveKey}>Lưu key</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="badge badge-info">Đã cấu hình Gemini key trên máy này</span>
              <button className="btn btn-ghost btn-sm" onClick={() => { setApiKeyState(''); setGeminiApiKey(''); }}>Đổi key</button>
            </div>
          )}
        </div>
      </div>

      {writing.map((q) => {
        const raw = submission.answers[String(q.number)] || '';
        const parsed = parseEssayAnswer(raw);
        const result = results[q.number];
        return (
          <div className="card" style={{ marginBottom: 12 }} key={q.number}>
            <div className="card-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start' }}>
                <div>
                  <strong>Câu {q.number}</strong>
                  <div style={{ color: 'var(--text-muted)', fontSize: '.82rem' }}>Tối đa {Number(q.points) || 1} điểm</div>
                </div>
                <button className="btn btn-primary btn-sm" disabled={!apiKey || busy[q.number] || !raw} onClick={() => gradeOne(q)}>
                  {busy[q.number] ? 'Đang chấm...' : 'Gemini chấm gợi ý'}
                </button>
              </div>
              <div className="question-preview" style={{ marginTop: 10 }}><MathText html={q.text} block /></div>
              {q.correctAnswer && (
                <details className="review-solution" open>
                  <summary>📌 Rubric / barem điểm AI sẽ dùng</summary>
                  <MathText html={q.correctAnswer} block />
                </details>
              )}
              {q.solution && (
                <details className="review-solution">
                  <summary>💡 Lời giải tham khảo AI sẽ dùng</summary>
                  <MathText html={q.solution} block />
                </details>
              )}
              <div className="student-answer-box">
                <strong>Bài làm:</strong>
                <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{parsed.text || '—'}</div>
                {parsed.images?.length > 0 && (
                  <div className="essay-images" style={{ marginTop: 8 }}>
                    {parsed.images.map((img, i) => <div className="essay-image" key={i}><img src={`data:${img.type};base64,${img.data}`} alt="Bài làm" /></div>)}
                  </div>
                )}
              </div>
              {result && (
                <div className="ai-result-box">
                  <div><strong>AI gợi ý:</strong> {result.score}/{result.maxScore} điểm</div>
                  {result.feedback && <p>{result.feedback}</p>}
                  {result.steps?.length > 0 && (
                    <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                      {result.steps.map((step, i) => (
                        <li key={i}>{step.ok ? '✓' : '•'} {step.text}</li>
                      ))}
                    </ul>
                  )}
                  {result.error && <p style={{ color: 'var(--danger)' }}>{result.error}</p>}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
