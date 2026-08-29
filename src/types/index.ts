// ====== ROLES ======
export enum Role {
  ADMIN = 'ADMIN',
  TEACHER = 'TEACHER',
  TA = 'TA',
  STUDENT = 'STUDENT',
}

export const ROLE_LABEL: Record<Role, string> = {
  [Role.ADMIN]: 'Quản trị viên',
  [Role.TEACHER]: 'Giáo viên',
  [Role.TA]: 'Trợ giảng',
  [Role.STUDENT]: 'Học sinh',
};

// ====== USER ======
export interface AppUser {
  id: string; // Firebase UID
  name: string;
  email?: string;
  avatar?: string;
  role: Role;
  isApproved: boolean;
  createdAt?: Date;
  studentId?: string;
  classIds?: string[];
}

// ====== CLASS ======
export type Status = 'ACTIVE' | 'INACTIVE';

export interface ClassItem {
  id: string;
  className: string;
  subject: string;
  grade: string;
  feePerSession: number;
  startDate: string; // YYYY-MM-DD
  status: Status;
  createdAt?: Date;
}

// ====== STUDENT ======
export interface Student {
  id: string;
  fullName: string;
  studentClass: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  note: string;
  status: Status;
  createdAt?: Date;
}

// ====== ENROLLMENT (student <-> class) ======
export interface Enrollment {
  id: string;
  studentId: string;
  classId: string;
}

// ====== CLASS TEACHER (user <-> class) ======
export interface ClassTeacher {
  id: string;
  teacherId: string;
  classId: string;
}

// ====== ATTENDANCE ======
export interface AttendanceRecord {
  id: string;
  classId: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  present: boolean;
  note: string;
}

// ====== SCORE - LEGACY ======
// Giữ lại để trang phụ huynh / dữ liệu cũ vẫn hoạt động.
export interface ScoreRecord {
  id: string;
  classId: string;
  studentId: string;
  examName: string;
  score: number;
  maxScore: number;
  date: string;
  note: string;
}

// ====== GRADEBOOK - NEW EXCEL-LIKE SCORE ENTRY ======
export type GradeColumnType = 'REGULAR' | 'MIDTERM' | 'FINAL' | 'OTHER';

export const GRADE_COLUMN_TYPE_LABEL: Record<GradeColumnType, string> = {
  REGULAR: 'Thường xuyên',
  MIDTERM: 'Giữa kỳ',
  FINAL: 'Cuối kỳ',
  OTHER: 'Khác',
};

export interface Gradebook {
  id: string;
  classId: string;
  className: string;
  subject: string;
  grade: string;
  semester: string;
  schoolYear: string;
  createdBy?: string;
  legacyMigrated?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface GradeColumn {
  id: string;
  name: string;
  type: GradeColumnType;
  maxScore: number;
  weight: number;
  order: number;
  examDate: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface GradeRow {
  id: string; // = studentId
  studentId: string;
  fullName: string;
  studentClass: string;
  scores: Record<string, number>; // { [columnId]: score }
  average10: number | null;
  updatedAt?: Date;
  updatedBy?: string;
}

// ====== PAYMENT / VIETQR ======
export type PaymentMode = 'GLOBAL' | 'CLASS';
export type TuitionPaymentStatus = 'UNPAID' | 'PAID';

export interface PaymentConfig {
  bankId: string;
  bankAccount: string;
  bankAccountName: string;
  centerName: string;
  qrTemplate: string;
  notePattern: string;
}

export interface ClassPaymentConfig {
  classId: string;
  mode: PaymentMode; // GLOBAL = dùng tài khoản chung; CLASS = dùng tài khoản riêng của lớp
  bankId: string;
  bankAccount: string;
  bankAccountName: string;
  qrTemplate: string;
  notePattern: string;
  isEnabled: boolean;
  updatedAt?: Date;
  updatedBy?: string;
}

export interface TuitionPaymentRecord {
  id: string;
  classId: string;
  studentId: string;
  monthKey: string; // YYYY-MM
  amount: number;
  transferNote: string;
  status: TuitionPaymentStatus;
  confirmedAt?: Date;
  confirmedBy?: string;
  confirmedByName?: string;
  note?: string;
  updatedAt?: Date;
}

// ====== DASHBOARD ======
export interface DashboardStats {
  totalStudents: number;
  totalClasses: number;
  totalTeachers: number;
  totalTAs: number;
  presentToday: number;
  totalAttToday: number;
}

// ====== TUITION ======
export interface TuitionStudentRow {
  studentId: string;
  fullName: string;
  sessionsTotal: number;
  sessionsAttended: number;
  sessionsAbsent: number;
  feePerSession: number;
  tuition: number;
  paymentStatus?: TuitionPaymentStatus;
  paidAt?: Date;
  transferNote?: string;
}

export interface TuitionData {
  classInfo: ClassItem;
  students: TuitionStudentRow[];
}

// ====== PARENT REPORT ======
export interface ParentClassReport {
  classId: string;
  className: string;
  subject: string;
  grade: string;
  feePerSession: number;
  sessionsTotal: number;
  sessionsAttended: number;
  tuition: number;
  scores: ScoreRecord[];
  attendance: AttendanceRecord[];
  average10?: number | null;
}

export interface ParentReport {
  student: Student;
  classes: ParentClassReport[];
}

// ============================================================
//  ASSIGNMENTS / ONLINE HOMEWORK & EXAMS
// ============================================================
export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'writing' | 'unknown';
export type AssignmentMode = 'homework' | 'exam';
export type AssignmentStatus = 'draft' | 'published' | 'closed';
export type TargetStatus = 'assigned' | 'in_progress' | 'submitted' | 'graded';
export type SubmissionStatus = 'in_progress' | 'submitted' | 'graded';
export type GradingStatus = 'NOT_GRADED' | 'AI_SUGGESTED' | 'GRADED';

// ====== CẤU HÌNH ĐIỂM TÙY CHỈNH ======
export type TrueFalseMode = 'equal' | 'stepped';

export interface SectionPointsConfig {
  sectionId: string; // 'multiple_choice' | 'true_false' | 'short_answer' | 'writing'
  sectionName: string;
  questionType: Exclude<QuestionType, 'unknown'>;
  totalQuestions: number;
  totalPoints: number;
  pointsPerQuestion: number;
  trueFalseMode?: TrueFalseMode; // chỉ dùng cho Đúng/Sai
}

export interface ExamPointsConfig {
  maxScore: number;
  sections: SectionPointsConfig[];
  autoBalance?: boolean;
}

// ====== KẾT QUẢ TỪNG CÂU (lưu khi nộp để học sinh xem lại) ======
export type QuestionResultStatus = 'correct' | 'partial' | 'wrong' | 'unanswered' | 'pending';

export interface QuestionResult {
  points: number;      // điểm đạt được
  maxPoints: number;   // điểm tối đa của câu
  status: QuestionResultStatus; // pending = tự luận chờ chấm
  tfCorrectCount?: number;      // Đúng/Sai: số ý đúng
  tfTotal?: number;             // Đúng/Sai: tổng số ý
}

export interface ImageData {
  id: string;
  rId?: string;
  filename: string;
  base64?: string;
  contentType: string;
}

export interface QuestionOption {
  letter: string;
  text: string;
  isCorrect?: boolean;
}

export interface Question {
  number: number;
  text: string;
  type: QuestionType;
  options?: QuestionOption[];
  tfStatements?: Record<string, string>;
  correctAnswer?: string | null;
  solution?: string;
  images?: ImageData[];
  points?: number;
  part?: string;
  section?: {
    letter?: string;
    name?: string;
    points?: string;
  };
}

export interface ExamSection {
  name: string;
  description?: string;
  points?: string;
  questions: Question[];
  sectionType?: QuestionType;
}

export interface ExamData {
  title: string;
  timeLimit?: number;
  sections: ExamSection[];
  questions: Question[];
  answers?: Record<number, string>;
  images?: ImageData[];
}

export interface AssignmentExam {
  id: string;
  title: string;
  subject: string;
  questions: Question[];
  sections?: ExamSection[];
  images?: ImageData[];
  totalQuestions: number;
  maxScore: number;
  pointsConfig?: ExamPointsConfig; // cấu hình điểm tùy chỉnh (nếu có)
  sourceFileName?: string;
  createdBy: string;
  createdByName?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Assignment {
  id: string;
  examId: string;
  title: string;
  description: string;
  classId: string;
  className: string;
  mode: AssignmentMode;
  status: AssignmentStatus;
  opensAt?: Date;
  closesAt?: Date;
  timeLimit: number; // minutes; 0 = không giới hạn với bài tập
  allowResubmit: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  antiCheat: boolean;
  assignedBy: string;
  assignedByName?: string;
  assignedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AssignmentTarget {
  id: string; // assignmentId__studentId
  assignmentId: string;
  examId: string;
  classId: string;
  className: string;
  studentId: string;
  studentName: string;
  status: TargetStatus;
  openedAt?: Date;
  startedAt?: Date;
  submittedAt?: Date;
  gradedAt?: Date;
  autoScore?: number;
  aiScore?: number;
  finalScore?: number;
  maxScore?: number;
}

export interface Submission {
  id: string; // assignmentId__studentId
  assignmentId: string;
  examId: string;
  classId: string;
  studentId: string;
  studentName: string;
  answers: Record<string, string>; // key = question.number
  status: SubmissionStatus;
  autoScore: number;
  finalScore?: number;
  maxScore: number;
  correctCount: number;
  wrongCount: number;
  totalQuestions: number;
  questionResults?: Record<string, QuestionResult>; // kết quả từng câu, lưu khi nộp
  startedAt?: Date;
  updatedAt?: Date;
  submittedAt?: Date;
  gradedAt?: Date;
  gradedBy?: string;
  gradedByName?: string;
  tabSwitchCount?: number;
  tabSwitchWarnings?: string[];
  autoSubmitted?: boolean;
}

export interface SubmissionGrade {
  id: string; // submissionId__questionNumber or submissionId__FINAL
  submissionId: string;
  assignmentId: string;
  studentId: string;
  questionNumber: number | 'FINAL';
  score: number;
  maxScore: number;
  feedback: string;
  aiScore?: number;
  aiFeedback?: string;
  status: GradingStatus;
  gradedBy?: string;
  gradedByName?: string;
  updatedAt?: Date;
}

export interface StudentAccount {
  id: string; // username
  username: string;
  email: string;
  uid: string;
  studentId: string;
  studentName: string;
  classIds: string[];
  className?: string;
  isActive: boolean;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateStudentAccountInput {
  username: string;
  password: string;
  studentId: string;
  studentName: string;
  classIds: string[];
  className?: string;
  createdBy?: string;
}
