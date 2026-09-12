const fs = require('fs');
let code = fs.readFileSync('src/types/index.ts', 'utf-8');

const target = `  shuffleOptions: boolean;
  antiCheat: boolean;`;

const replacement = `  shuffleOptions: boolean;
  antiCheat: boolean;
  showAnswers: boolean;`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('src/types/index.ts', code);
  console.log("Replaced type successfully!");
} else {
  console.log("type target not found!");
}
