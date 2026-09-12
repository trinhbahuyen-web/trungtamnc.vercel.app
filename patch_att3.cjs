const fs = require('fs');
let code = fs.readFileSync('src/pages/Attendance.tsx', 'utf-8');

const target3 = `      {!selectedClass && (
        <div className="empty-state" style={{ paddingTop: 30 }}>
          <div className="empty-icon">
            <CheckSquare size={40} />
          </div>
          <h3>Gõ chọn lớp để bắt đầu điểm danh</h3>
        </div>
      )}
    </div>
  );
}`;

const replacement3 = `      {!selectedClass && (
        <div className="empty-state" style={{ paddingTop: 30 }}>
          <div className="empty-icon">
            <CheckSquare size={40} />
          </div>
          <h3>Gõ chọn lớp để bắt đầu điểm danh</h3>
        </div>
      )}

      {showHistory && (
        <div className="modal-backdrop" onClick={() => setShowHistory(false)}>
          <div className="modal-content" style={{ maxWidth: '1000px', width: '95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ClipboardList size={20} /> Lịch sử điểm danh (20 buổi gần nhất)
              </h2>
              <button className="icon-btn" onClick={() => setShowHistory(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body" style={{ overflowX: 'auto', maxHeight: '70vh' }}>
              {loadingHistory ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280' }}>Đang tải dữ liệu...</div>
              ) : historyDates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280' }}>Chưa có dữ liệu điểm danh nào của lớp này.</div>
              ) : (
                <table className="table" style={{ whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr>
                      <th style={{ position: 'sticky', left: 0, background: '#f9fafb', zIndex: 10 }}>STT</th>
                      <th style={{ position: 'sticky', left: 40, background: '#f9fafb', zIndex: 10 }}>Học sinh</th>
                      {historyDates.map(d => {
                        const [, m, day] = d.split('-');
                        return <th key={d} style={{ textAlign: 'center', minWidth: '70px' }}>{day}/{m}</th>;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((student, idx) => (
                      <tr key={student.id}>
                        <td style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 5 }}>{idx + 1}</td>
                        <td style={{ position: 'sticky', left: 40, background: '#fff', zIndex: 5, fontWeight: 500 }}>{student.fullName}</td>
                        {historyDates.map(d => {
                          const record = historyRecords.find(r => r.studentId === student.id && r.date === d);
                          if (!record) return <td key={d} style={{ textAlign: 'center', color: '#9ca3af' }}>-</td>;
                          if (!record.present) return <td key={d} style={{ textAlign: 'center', color: '#dc2626', fontWeight: 'bold' }} title="Vắng mặt">V</td>;
                          
                          // Có mặt
                          if (record.tuitionPaid) {
                            return <td key={d} style={{ textAlign: 'center', color: '#059669', fontWeight: 'bold' }} title="Đã đóng học phí">✓ (Đã thu)</td>;
                          } else {
                            return <td key={d} style={{ textAlign: 'center', color: '#d97706', fontWeight: 'bold' }} title="Chưa đóng học phí">✓ (Chưa thu)</td>;
                          }
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}`;

if (code.includes(target3)) {
  code = code.replace(target3, replacement3);
  fs.writeFileSync('src/pages/Attendance.tsx', code);
  console.log("Replaced target3 successfully!");
} else {
  console.log("target3 not found!");
}
