const fs = require('fs');
let code = fs.readFileSync('src/services/assignmentService.ts', 'utf-8');

const target1 = `  allowResubmit: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  antiCheat: boolean;
  assignedBy: AppUser;`;

const replacement1 = `  allowResubmit: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  antiCheat: boolean;
  showAnswers: boolean;
  assignedBy: AppUser;`;

const target2 = `    allowResubmit: params.allowResubmit,
    shuffleQuestions: params.shuffleQuestions,
    shuffleOptions: params.shuffleOptions,
    antiCheat: params.antiCheat,
    assignedBy: params.assignedBy.id,`;

const replacement2 = `    allowResubmit: params.allowResubmit,
    shuffleQuestions: params.shuffleQuestions,
    shuffleOptions: params.shuffleOptions,
    antiCheat: params.antiCheat,
    showAnswers: params.showAnswers,
    assignedBy: params.assignedBy.id,`;

if (code.includes(target1) && code.includes(target2)) {
  code = code.replace(target1, replacement1);
  code = code.replace(target2, replacement2);
  fs.writeFileSync('src/services/assignmentService.ts', code);
  console.log("Replaced service successfully!");
} else {
  console.log("service target not found!");
}
