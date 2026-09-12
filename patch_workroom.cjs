const fs = require('fs');
let code = fs.readFileSync('src/pages/StudentWorkRoom.tsx', 'utf-8');

const target1 = `function QuestionBlock({ question, value, onChange, disabled, index, shuffleOptions, seed, reviewMode, result, grade }: {
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
}) {`;

const rep1 = `function QuestionBlock({ question, value, onChange, disabled, index, shuffleOptions, seed, reviewMode, showAnswers = true, result, grade }: {
  key?: any;
  question: Question;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  index: number;
  shuffleOptions: boolean;
  seed: number;
  reviewMode?: boolean;
  showAnswers?: boolean;
  result?: QuestionResult;
  grade?: SubmissionGrade;
}) {`;

const target2 = `        <span className="exam-point-badge">
          {reviewMode && result
            ? \`\${formatScore(type === 'writing' && essayGraded ? grade!.score : result.points)}/\${formatScore(result.maxPoints)}đ\`
            : \`\${formatScore(Number(question.points) || 1)}đ\`}
        </span>`;

const rep2 = `        <span className="exam-point-badge">
          {reviewMode && result && showAnswers
            ? \`\${formatScore(type === 'writing' && essayGraded ? grade!.score : result.points)}/\${formatScore(result.maxPoints)}đ\`
            : \`\${formatScore(Number(question.points) || 1)}đ\`}
        </span>`;

const target3 = `        {type === 'multiple_choice' && (
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
        )}`;

const rep3 = `        {type === 'multiple_choice' && (
          <MultipleChoiceOptions
            options={options}
            value={value}
            disabled={disabled}
            onChange={onChange}
            reviewMode={reviewMode && showAnswers}
            correctAnswer={question.correctAnswer || ''}
          />
        )}

        {type === 'true_false' && (
          <TrueFalseGrid
            options={options.length ? options : getTrueFalseOptions(question)}
            value={value}
            disabled={disabled}
            onChange={onChange}
            reviewMode={reviewMode && showAnswers}
            correctAnswer={question.correctAnswer || ''}
          />
        )}

        {type === 'short_answer' && (
          <ShortMathInput
            value={value}
            disabled={disabled}
            onChange={onChange}
            reviewMode={reviewMode}
            showAnswers={showAnswers}
            result={result}
            correctAnswer={question.correctAnswer || ''}
          />
        )}`;

if (code.includes(target1) && code.includes(target2) && code.includes(target3)) {
  code = code.replace(target1, rep1);
  code = code.replace(target2, rep2);
  code = code.replace(target3, rep3);
  fs.writeFileSync('src/pages/StudentWorkRoom.tsx', code);
  console.log("Replaced 1-3 successfully!");
} else {
  console.log("1-3 targets not found!");
  if (!code.includes(target1)) console.log('target1 missing');
  if (!code.includes(target2)) console.log('target2 missing');
  if (!code.includes(target3)) console.log('target3 missing');
}
