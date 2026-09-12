const fs = require('fs');
let code = fs.readFileSync('src/pages/AssignmentCreate.tsx', 'utf-8');

const targetState = `  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [antiCheat, setAntiCheat] = useState(false);`;

const repState = `  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [antiCheat, setAntiCheat] = useState(false);
  const [showAnswers, setShowAnswers] = useState(true);`;

const targetData = `        timeLimit: mode === 'exam' ? Number(timeLimit) || 45 : Number(timeLimit) || 0,
        allowResubmit,
        shuffleQuestions,
        shuffleOptions,
        antiCheat: mode === 'exam' ? antiCheat : false,`;

const repData = `        timeLimit: mode === 'exam' ? Number(timeLimit) || 45 : Number(timeLimit) || 0,
        allowResubmit,
        shuffleQuestions,
        shuffleOptions,
        antiCheat: mode === 'exam' ? antiCheat : false,
        showAnswers,`;

const targetUI = `              <label><input type="checkbox" checked={allowResubmit} onChange={(e) => setAllowResubmit(e.target.checked)} /> Cho nộp lại</label>
              <label><input type="checkbox" checked={shuffleQuestions} onChange={(e) => setShuffleQuestions(e.target.checked)} /> Xáo câu</label>
              <label><input type="checkbox" checked={shuffleOptions} onChange={(e) => setShuffleOptions(e.target.checked)} /> Xáo đáp án</label>
              <label><input type="checkbox" disabled={mode !== 'exam'} checked={antiCheat} onChange={(e) => setAntiCheat(e.target.checked)} /> Chống chuyển tab</label>`;

const repUI = `              <label><input type="checkbox" checked={allowResubmit} onChange={(e) => setAllowResubmit(e.target.checked)} /> Cho nộp lại</label>
              <label><input type="checkbox" checked={showAnswers} onChange={(e) => setShowAnswers(e.target.checked)} /> Xem đáp án sau nộp</label>
              <label><input type="checkbox" checked={shuffleQuestions} onChange={(e) => setShuffleQuestions(e.target.checked)} /> Xáo câu</label>
              <label><input type="checkbox" checked={shuffleOptions} onChange={(e) => setShuffleOptions(e.target.checked)} /> Xáo đáp án</label>
              <label><input type="checkbox" disabled={mode !== 'exam'} checked={antiCheat} onChange={(e) => setAntiCheat(e.target.checked)} /> Chống chuyển tab</label>`;

if (code.includes(targetState) && code.includes(targetData) && code.includes(targetUI)) {
  code = code.replace(targetState, repState);
  code = code.replace(targetData, repData);
  code = code.replace(targetUI, repUI);
  fs.writeFileSync('src/pages/AssignmentCreate.tsx', code);
  console.log("Replaced create successfully!");
} else {
  console.log("create target not found!");
}
