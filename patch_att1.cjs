const fs = require('fs');
let code = fs.readFileSync('src/pages/Attendance.tsx', 'utf-8');

const target1 = `  const [classSearchTerm, setClassSearchTerm] = useState('');
  const [isClassDropdownOpen, setIsClassDropdownOpen] = useState(false);`;

const replacement1 = `  const [classSearchTerm, setClassSearchTerm] = useState('');
  const [isClassDropdownOpen, setIsClassDropdownOpen] = useState(false);

  const [showHistory, setShowHistory] = useState(false);
  const [historyDates, setHistoryDates] = useState<string[]>([]);
  const [historyRecords, setHistoryRecords] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadHistory = async () => {
    if (!selectedClass) return;
    setLoadingHistory(true);
    setShowHistory(true);
    try {
      const attSnap = await getDocs(
        query(collection(db, 'attendance'), where('classId', '==', selectedClass))
      );
      const allAtt = attSnap.docs.map(d => d.data());
      
      const datesSet = new Set<string>();
      allAtt.forEach(a => datesSet.add(a.date));
      const sortedDates = Array.from(datesSet).sort().reverse().slice(0, 20);
      
      setHistoryDates(sortedDates);
      setHistoryRecords(allAtt);
    } catch (error) {
      console.error(error);
      toast('Lỗi tải lịch sử', 'error');
    } finally {
      setLoadingHistory(false);
    }
  };`;

if (code.includes(target1)) {
  code = code.replace(target1, replacement1);
  fs.writeFileSync('src/pages/Attendance.tsx', code);
  console.log("Replaced target1 successfully!");
} else {
  console.log("target1 not found!");
}
