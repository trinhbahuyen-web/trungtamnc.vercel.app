const fs = require('fs');
let code = fs.readFileSync('src/pages/Attendance.tsx', 'utf-8');

const targetState = `  const [loadingHistory, setLoadingHistory] = useState(false);`;
const replacementState = `  const [loadingHistory, setLoadingHistory] = useState(false);

  const [recentSessions, setRecentSessions] = useState<{sessionNumber: number, date: string}[]>([]);
  const [refreshRecentTrigger, setRefreshRecentTrigger] = useState(0);

  useEffect(() => {
    if (!selectedClass) {
      setRecentSessions([]);
      return;
    }
    let isMounted = true;
    const fetchRecent = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'attendance'), where('classId', '==', selectedClass))
        );
        const dateSet = new Set<string>();
        snap.forEach(d => dateSet.add(d.data().date));
        const allSortedDates = Array.from(dateSet).sort();
        const recent = allSortedDates.slice(-8).map((d) => ({
          sessionNumber: allSortedDates.indexOf(d) + 1,
          date: d
        }));
        if (isMounted) setRecentSessions(recent);
      } catch (e) {
        console.error(e);
      }
    };
    fetchRecent();
    return () => { isMounted = false; };
  }, [selectedClass, refreshRecentTrigger]);`;

const targetSave = `      setHasSavedData(true); // Cập nhật trạng thái hiển thị nút Xóa`;
const replacementSave = `      setHasSavedData(true); // Cập nhật trạng thái hiển thị nút Xóa
      setRefreshRecentTrigger(t => t + 1);`;

const targetClear = `      setHasSavedData(false);
      loadRosterAndAttendance(); // Tải lại giao diện về mặc định`;
const replacementClear = `      setHasSavedData(false);
      setRefreshRecentTrigger(t => t + 1);
      loadRosterAndAttendance(); // Tải lại giao diện về mặc định`;

const targetUI = `      <div className="card" style={{ marginBottom: 16, position: 'relative', zIndex: 50, overflow: 'visible' }}>`;
const replacementUI = `      {/* Bảng nhỏ gọn một số buổi */}
      {selectedClass && recentSessions.length > 0 && (
        <div className="card" style={{ marginBottom: 16, border: '1px solid #10b981', boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.1)' }}>
          <div className="card-body" style={{ padding: '12px' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#059669', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <ClipboardList size={14} /> Tóm tắt các buổi gần nhất
            </h4>
            <div style={{ overflowX: 'auto', paddingBottom: '4px' }}>
              <table style={{ minWidth: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '13px' }}>
                <tbody>
                  <tr>
                    {recentSessions.map((s, i) => (
                      <td key={\`b-\${i}\`} style={{ border: '1px solid #e2e8f0', padding: '6px 12px', fontWeight: 600, background: '#ecfdf5', color: '#065f46', whiteSpace: 'nowrap' }}>
                        Buổi {s.sessionNumber}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    {recentSessions.map((s, i) => (
                      <td key={\`d-\${i}\`} style={{ border: '1px solid #e2e8f0', padding: '6px 12px', whiteSpace: 'nowrap', color: '#475569' }}>
                        {fmtDate(s.date).slice(0, 5)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16, position: 'relative', zIndex: 50, overflow: 'visible' }}>`;

if (code.includes(targetState) && code.includes(targetSave) && code.includes(targetClear) && code.includes(targetUI)) {
  code = code.replace(targetState, replacementState);
  code = code.replace(targetSave, replacementSave);
  code = code.replace(targetClear, replacementClear);
  code = code.replace(targetUI, replacementUI);
  fs.writeFileSync('src/pages/Attendance.tsx', code);
  console.log("Patched successfully!");
} else {
  console.log("Failed to find targets");
  if (!code.includes(targetState)) console.log("Missing State");
  if (!code.includes(targetSave)) console.log("Missing Save");
  if (!code.includes(targetClear)) console.log("Missing Clear");
  if (!code.includes(targetUI)) console.log("Missing UI");
}
