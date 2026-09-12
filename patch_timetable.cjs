const fs = require('fs');
let code = fs.readFileSync('src/pages/Timetable.tsx', 'utf-8');

const targetFunc = `  const handleCopyPrevWeek = async () => {
    if (!window.confirm('Chức năng này sẽ sao chép toàn bộ lịch của tuần trước sang tuần hiện tại. Bạn có chắc chắn?')) return;
    setSaving(true);
    const prevWeek = getPrevWeek(selectedWeek);
    try {
      const prevSnap = await getDoc(doc(db, 'timetables', prevWeek));
      if (prevSnap.exists() && Object.keys(prevSnap.data().data || {}).length > 0) {
        const prevData = prevSnap.data().data;
        setSchedule(prevData);
        await saveToFirebase(prevData, selectedWeek);
        toast('Đã sao chép lịch tuần trước thành công!', 'success');
      } else {
        // Hỗ trợ chuyển đổi từ hệ thống cũ (chưa có tuần) sang hệ thống tuần
        const legacySnap = await getDoc(doc(db, 'settings', 'timetable'));
        if (legacySnap.exists() && Object.keys(legacySnap.data().data || {}).length > 0) {
            const legacyData = legacySnap.data().data;
            setSchedule(legacyData);
            await saveToFirebase(legacyData, selectedWeek);
            toast('Đã khởi tạo lịch từ dữ liệu gốc thành công!', 'success');
        } else {
            toast('Tuần trước không có dữ liệu lịch học nào để sao chép!', 'warning');
        }
      }
    } catch (e) {
      toast('Lỗi khi sao chép lịch', 'error');
    } finally {
      setSaving(false);
    }
  };`;

const replacementFunc = `  const handleCopyPrevWeek = async () => {
    // Chỉ hỏi xác nhận nếu tuần hiện tại đã có dữ liệu để tránh ghi đè nhầm
    const currentIsNotEmpty = Object.values(schedule).some(slots => slots && slots.length > 0);
    if (currentIsNotEmpty) {
      if (!window.confirm('Lịch tuần này đã có dữ liệu. Việc sao chép sẽ GHI ĐÈ lên toàn bộ. Bạn có chắc chắn?')) return;
    }
    
    setSaving(true);
    try {
      let foundData: ScheduleData | null = null;
      let currSearchWeek = getPrevWeek(selectedWeek);
      let searchCount = 0;
      let foundWeek = '';
      
      // Tìm ngược lại tối đa 10 tuần gần nhất xem tuần nào có dữ liệu
      while (searchCount < 10) {
        const snap = await getDoc(doc(db, 'timetables', currSearchWeek));
        if (snap.exists() && Object.keys(snap.data().data || {}).length > 0) {
          foundData = snap.data().data;
          foundWeek = currSearchWeek;
          break;
        }
        currSearchWeek = getPrevWeek(currSearchWeek);
        searchCount++;
      }

      if (foundData) {
        setSchedule(foundData);
        await saveToFirebase(foundData, selectedWeek);
        toast(\`Đã sao chép lịch từ Tuần \${foundWeek.split('-W')[1]} thành công!\`, 'success');
      } else {
        // Hỗ trợ chuyển đổi từ hệ thống cũ (chưa có tuần) sang hệ thống tuần
        const legacySnap = await getDoc(doc(db, 'settings', 'timetable'));
        if (legacySnap.exists() && Object.keys(legacySnap.data().data || {}).length > 0) {
            const legacyData = legacySnap.data().data;
            setSchedule(legacyData);
            await saveToFirebase(legacyData, selectedWeek);
            toast('Đã khởi tạo lịch từ dữ liệu gốc thành công!', 'success');
        } else {
            toast('Không tìm thấy dữ liệu lịch học trong 10 tuần gần nhất để sao chép!', 'warning');
        }
      }
    } catch (e) {
      toast('Lỗi khi sao chép lịch', 'error');
    } finally {
      setSaving(false);
    }
  };`;

if (code.includes(targetFunc)) {
  code = code.replace(targetFunc, replacementFunc);
  fs.writeFileSync('src/pages/Timetable.tsx', code);
  console.log("Replaced handleCopyPrevWeek successfully!");
} else {
  console.log("targetFunc not found in Timetable.tsx");
}
