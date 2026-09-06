const fs = require('fs');
let code = fs.readFileSync('src/pages/Tuition.tsx', 'utf-8');

const target2 = `    const tableHeaderHtml = tabMode === 'TREASURER' 
      ? \`<tr><th style="width: 40px;">STT</th><th>Họ và tên</th><th style="width: 100px;">Số ĐT</th><th style="width: 70px;">Số buổi</th><th style="width: 70px;">Miễn (%)</th><th style="width: 100px;">Số tiền</th><th style="width: 90px;">Trạng thái</th><th style="width: 130px;">Ghi chú</th></tr>\`
      : \`<tr><th style="width: 40px;">STT</th><th>Họ và tên</th><th style="width: 120px;">Số ĐT</th><th style="width: 80px;">Số buổi</th><th style="width: 80px;">Miễn (%)</th><th style="width: 120px;">Số tiền</th><th style="width: 160px;">Ghi chú</th></tr>\`;`;

const replacement2 = `    const tableHeaderHtml = tabMode === 'TREASURER' 
      ? \`<tr><th style="width: 40px;">STT</th><th>Họ và tên</th><th style="width: 100px;">Số ĐT</th><th style="width: 70px;">Tổng tham gia</th><th style="width: 70px;">Đã thu</th><th style="width: 70px;">Cần thu</th><th style="width: 70px;">Miễn (%)</th><th style="width: 100px;">Học phí đợt này</th><th style="width: 90px;">Trạng thái</th><th style="width: 130px;">Ghi chú</th></tr>\`
      : \`<tr><th style="width: 40px;">STT</th><th>Họ và tên</th><th style="width: 120px;">Số ĐT</th><th style="width: 80px;">Tổng tham gia</th><th style="width: 80px;">Đã thu</th><th style="width: 80px;">Cần thu</th><th style="width: 80px;">Miễn (%)</th><th style="width: 120px;">Học phí đợt này</th><th style="width: 160px;">Ghi chú</th></tr>\`;`;

if (code.includes(target2)) {
  code = code.replace(target2, replacement2);
  fs.writeFileSync('src/pages/Tuition.tsx', code);
  console.log("Replaced target2 successfully!");
} else {
  console.log("target2 not found!");
}
