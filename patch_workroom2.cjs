const fs = require('fs');
let code = fs.readFileSync('src/pages/StudentWorkRoom.tsx', 'utf-8');

const target1 = `                  reviewMode={readonly}
                  result={questionResults[String(q.number)]}`;

const rep1 = `                  reviewMode={readonly}
                  showAnswers={assignment.showAnswers ?? true}
                  result={questionResults[String(q.number)]}`;

const target2 = `function ShortMathInput({ value, disabled, onChange, reviewMode, result, correctAnswer }: {
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
  reviewMode?: boolean;
  result?: QuestionResult;
  correctAnswer?: string;
})`;

const rep2 = `function ShortMathInput({ value, disabled, onChange, reviewMode, showAnswers = true, result, correctAnswer }: {
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
  reviewMode?: boolean;
  showAnswers?: boolean;
  result?: QuestionResult;
  correctAnswer?: string;
})`;

if (code.includes(target1) && code.includes(target2)) {
  code = code.replace(target1, rep1);
  code = code.replace(target2, rep2);
  fs.writeFileSync('src/pages/StudentWorkRoom.tsx', code);
  console.log("Replaced 2 successfully!");
} else {
  console.log("2 targets not found!");
  if (!code.includes(target1)) console.log("target1 missing");
  if (!code.includes(target2)) console.log("target2 missing");
}
