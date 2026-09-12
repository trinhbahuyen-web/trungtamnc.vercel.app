const fs = require('fs');
let code = fs.readFileSync('src/pages/StudentWorkRoom.tsx', 'utf-8');

const target = `  if (reviewMode) {
    const isCorrect = result?.status === 'correct';
    const unanswered = !value || !value.trim();
    return (
      <div className={\`exam-sa-box review \${isCorrect ? 'right' : 'wrong'}\`}>
        <label className="exam-sa-label">Đáp án của bạn</label>
        <div className={\`review-sa-answer \${isCorrect ? 'right' : 'wrong'}\`}>
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
  }`;

const rep = `  if (reviewMode) {
    const isCorrect = result?.status === 'correct';
    const unanswered = !value || !value.trim();
    return (
      <div className={\`exam-sa-box review \${showAnswers ? (isCorrect ? 'right' : 'wrong') : ''}\`}>
        <label className="exam-sa-label">Đáp án của bạn</label>
        <div className={\`review-sa-answer \${showAnswers ? (isCorrect ? 'right' : 'wrong') : ''}\`}>
          {unanswered ? <em>— Chưa trả lời —</em> : <MathText html={mathify(value)} />}
          {showAnswers && <span className="review-sa-mark">{isCorrect ? '✓' : '✕'}</span>}
        </div>
        {showAnswers && !isCorrect && correctAnswer && (
          <div className="review-sa-correct">
            <span>Đáp án đúng:</span> <MathText html={mathify(correctAnswer)} />
          </div>
        )}
      </div>
    );
  }`;

if (code.includes(target)) {
  code = code.replace(target, rep);
  fs.writeFileSync('src/pages/StudentWorkRoom.tsx', code);
  console.log("Replaced 3 successfully!");
} else {
  console.log("3 target not found!");
}
