import { useState } from 'react';
import { Database, ShieldCheck, HardDriveDownload } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { db } from '../config/firebase';
import { collection, getDocs } from 'firebase/firestore';

// Danh sách tất cả các bảng dữ liệu đang có trong hệ thống trung tâm
const COLLECTIONS = [
  'users', 
  'classes', 
  'students', 
  'enrollments', 
  'attendance', 
  'grades', 
  'tuition', 
  'assignments', 
  'settings', 
  'classPaymentConfigs'
];

export default function Backup() {
  const toast = useToast();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    // Đã xóa chữ 'info' gây lỗi hệ thống ở dòng này
    toast('Đang thu thập toàn bộ dữ liệu hệ thống, vui lòng đợi...'); 
    
    try {
      const backupData: Record<string, any> = {};
      
      // Duyệt qua từng bảng và rút dữ liệu về
      for (const colName of COLLECTIONS) {
        const snap = await getDocs(collection(db, colName));
        backupData[colName] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      // Đóng gói thành file JSON
      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Tạo tên file theo ngày giờ hiện tại
      const now = new Date();
      const timeStr = `${now.getHours()}h${now.getMinutes()}p`;
      const dateStr = `${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()}`;
      const fileName = `SaoLuu_TrungTam_${dateStr}_${timeStr}.json`;
      
      // Kích hoạt tải về máy
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      
      toast('Đã tải xuống file sao lưu an toàn!', 'success');
    } catch (error) {
      toast('Lỗi khi sao lưu dữ liệu: ' + (error as Error).message, 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fade-up">
      <div className="page-header">
        <div>
          <h1 className="page-title"><Database size={26} /> <span>Sao lưu & Phục hồi</span></h1>
          <p className="page-sub">Kết xuất toàn bộ cơ sở dữ liệu của trung tâm về máy tính cá nhân</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 700, margin: '0 auto', marginTop: 20 }}>
        <div className="card-body" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <ShieldCheck size={64} style={{ color: '#059669', marginBottom: 20, margin: '0 auto' }} />
          <h2 style={{ fontSize: '1.5rem', marginBottom: 10 }}>Bảo vệ an toàn dữ liệu trung tâm</h2>
          <p style={{ color: '#4b5563', lineHeight: 1.6, marginBottom: 30 }}>
            Chức năng này sẽ quét qua toàn bộ các bảng dữ liệu (Học sinh, Lớp học, Điểm danh, Điểm số, Thời khóa biểu...) 
            và nén lại thành một tập tin duy nhất định dạng <strong>.json</strong>. <br/><br/>
            Thầy nên thực hiện việc tải sao lưu này định kỳ sau mỗi buổi dạy (Sáng, Chiều, Tối) để đề phòng sự cố mất dữ liệu.
          </p>

          <button 
            className="btn btn-primary" 
            style={{ fontSize: '1.1rem', padding: '12px 24px', display: 'inline-flex', alignItems: 'center', gap: 10 }}
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <><div className="spinner" style={{ width: 20, height: 20 }} /> Đang xử lý sao lưu...</>
            ) : (
              <><HardDriveDownload size={22} /> Tải file Sao lưu toàn bộ dữ liệu</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
