const fs = require('fs');
let code = fs.readFileSync('src/pages/Attendance.tsx', 'utf-8');

const target2 = `      <div className="page-header">
        <div>
          <h1 className="page-title">
            <CheckSquare size={26} /> <span>Điểm danh</span>
          </h1>
          <p className="page-sub">Gõ tìm lớp, điểm danh hàng ngày và xuất báo cáo Tổng hợp</p>
        </div>
      </div>`;

const replacement2 = `      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">
            <CheckSquare size={26} /> <span>Điểm danh</span>
          </h1>
          <p className="page-sub">Gõ tìm lớp, điểm danh hàng ngày và xuất báo cáo Tổng hợp</p>
        </div>
        <div>
          {selectedClass && (
            <button className="btn btn-secondary" onClick={loadHistory} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ClipboardList size={16} /> Lịch sử 20 buổi
            </button>
          )}
        </div>
      </div>`;

if (code.includes(target2)) {
  code = code.replace(target2, replacement2);
  fs.writeFileSync('src/pages/Attendance.tsx', code);
  console.log("Replaced target2 successfully!");
} else {
  console.log("target2 not found!");
}
