// Chấm bài tự luận bằng Gemini API. AI chỉ gợi ý, giáo viên/trợ giảng vẫn xác nhận điểm cuối.
export interface EssayAnswerData {
  text: string;
  images: { data: string; type: string; name?: string }[];
}

export interface EssayStepResult {
  text: string;
  ok: boolean;
}

export interface EssayGradeResult {
  score: number;
  maxScore: number;
  steps: EssayStepResult[];
  comment: string;
  feedback: string;
  pending?: boolean;
  error?: string;
}

const GEMINI_KEY_STORAGE = 'gemini_essay_api_key';

export function getGeminiApiKey(): string {
  return localStorage.getItem(GEMINI_KEY_STORAGE) || (import.meta.env.VITE_GEMINI_API_KEY as string) || '';
}

export function setGeminiApiKey(key: string): void {
  localStorage.setItem(GEMINI_KEY_STORAGE, key.trim());
}

export function parseEssayAnswer(raw: string): EssayAnswerData {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        text: parsed.text || '',
        images: Array.isArray(parsed.images) ? parsed.images : [],
      };
    }
  } catch {}
  return { text: raw || '', images: [] };
}

export function serializeEssayAnswer(data: EssayAnswerData): string {
  return JSON.stringify({ text: data.text || '', images: data.images || [] });
}

export function hasEssayAnswer(raw: string | undefined): boolean {
  if (!raw) return false;
  const parsed = parseEssayAnswer(raw);
  return parsed.text.trim().length > 0 || parsed.images.length > 0;
}

function stripHtml(html: string) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function gradeEssayWithGemini(
  questionText: string,
  studentAnswer: string,
  maxScore: number,
  rubric?: string,
  apiKey?: string
): Promise<EssayGradeResult> {
  const key = apiKey || getGeminiApiKey();
  if (!key) {
    return {
      score: 0,
      maxScore,
      steps: [],
      comment: '',
      feedback: '',
      pending: true,
      error: 'Chưa cấu hình Gemini API key.',
    };
  }

  const answerData = parseEssayAnswer(studentAnswer);
  const prompt = `Bạn là giáo viên chấm bài. Hãy chấm bài tự luận/toán học của học sinh theo yêu cầu dưới đây.\n\nCÂU HỎI:\n${stripHtml(questionText)}\n\n${rubric ? `HƯỚNG DẪN/RUBRIC:\n${stripHtml(rubric)}\n` : ''}\nĐIỂM TỐI ĐA: ${maxScore}\n\nBÀI LÀM HỌC SINH:\n${answerData.text || '(Không có văn bản, xem ảnh đính kèm nếu có)'}\n\nTrả về JSON đúng định dạng, không markdown:\n{"score": 0, "steps": [{"text":"ý chấm", "ok": true}], "comment":"nhận xét ngắn", "feedback":"nhận xét cho học sinh"}\n\nYêu cầu: score từ 0 đến ${maxScore}, có thể dùng số thập phân 0.25/0.5 nếu cần.`;

  const parts: any[] = [{ text: prompt }];
  for (const img of answerData.images || []) {
    if (img.data) {
      parts.push({ inline_data: { mime_type: img.type || 'image/jpeg', data: img.data } });
    }
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.2, response_mime_type: 'application/json' },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { score: 0, maxScore, steps: [], comment: '', feedback: text || `Gemini lỗi ${res.status}`, error: text || `Gemini lỗi ${res.status}` };
  }

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  try {
    const parsed = JSON.parse(raw);
    const score = Math.max(0, Math.min(Number(parsed.score) || 0, maxScore));
    return {
      score,
      maxScore,
      steps: Array.isArray(parsed.steps) ? parsed.steps : [],
      comment: parsed.comment || '',
      feedback: parsed.feedback || parsed.comment || '',
    };
  } catch {
    return { score: 0, maxScore, steps: [], comment: '', feedback: raw, error: 'Không đọc được JSON từ Gemini.' };
  }
}
