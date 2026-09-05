import { useState, useRef } from 'react';
import { Database, ShieldCheck, HardDriveDownload, UploadCloud, Upload, FileText, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { db } from '../config/firebase';
import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';

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

const COLLECTION_LABELS: Record<string, string> = {
  users: 'Người dùng & GV',
  classes: 'Lớp học',
  students: 'Học sinh',
  enrollments: 'Danh sách học sinh',
  attendance: 'Điểm danh',
  grades: 'Bảng điểm',
  tuition: 'Học phí',
  assignments: 'Bài tập & Kiểm tra',
  settings: 'Cấu hình hệ thống',
  classPaymentConfigs: 'Cấu hình học phí'
};

export default function Backup() {
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // States cho tính năng phục hồi (Bước 1: Chọn file -> Bước 2: Xác nhận)
  const [importStep, setImportStep] = useState<1 | 2>(1);
  const [backupSummary, setBackupSummary] = useState<Record<string, number> | null>(null);
  const [backupPayload, setBackupPayload] = useState<any | null>(null);

  const handleExport = async () => {
    setExporting(true);
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const backupData = JSON.parse(text);

      const summary: Record<string, number> = {};
      let hasData = false;
      
      for (const colName of COLLECTIONS) {
        if (backupData[colName] && Array.isArray(backupData[colName])) {
          summary[colName] = backupData[colName].length;
          if (summary[colName] > 0) hasData = true;
        } else {
          summary[colName] = 0;
        }
      }

      if (!hasData) {
        toast('File sao lưu trống hoặc không hợp lệ.', 'error');
        return;
      }

      setBackupPayload(backupData);
      setBackupSummary(summary);
      setImportStep(2); // Chuyển sang bước 2 (Xác nhận)
    } catch (error) {
      toast('Lỗi đọc file: File không đúng định dạng JSON.', 'error');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const processRestore = async () => {
    if (!backupPayload) return;
    
    setImporting(true);
    toast('Đang phục hồi dữ liệu, vui lòng không đóng trang...', 'warning');

    try {
      let totalDocs = 0;
      
      for (const colName of COLLECTIONS) {
        if (backupPayload[colName] && Array.isArray(backupPayload[colName])) {
          const docs = backupPayload[colName];
          totalDocs += docs.length;
          
          // Ghi dữ liệu theo từng batch 400 bản ghi để tránh giới hạn của Firestore
          const chunkSize = 400;
          for (let i = 0; i < docs.length; i += chunkSize) {
            const chunk = docs.slice(i, i + chunkSize);
            const batch = writeBatch(db);
            
            for (const docData of chunk) {
              const { id, ...data } = docData;
              if (id) {
                const docRef = doc(db, colName, id);
                batch.set(docRef, data);
              }
            }
            await batch.commit();
          }
        }
      }

      toast(`Đã phục hồi thành công ${totalDocs} bản ghi dữ liệu!`, 'success');
      setImportStep(1);
      setBackupPayload(null);
      setBackupSummary(null);
    } catch (error) {
      toast('Lỗi khi phục hồi dữ liệu: ' + (error as Error).message, 'error');
    } finally {
      setImporting(false);
    }
  };

  const cancelRestore = () => {
    setImportStep(1);
    setBackupPayload(null);
    setBackupSummary(null);
  };

  return (
    <div className="fade-up">
      <div className="page-header">
        <div>
          <h1 className="page-title"><Database size={26} /> <span>Sao lưu & Phục hồi</span></h1>
          <p className="page-sub">Kết xuất toàn bộ cơ sở dữ liệu của trung tâm về máy tính cá nhân hoặc phục hồi dữ liệu từ bản sao lưu</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px', marginTop: 20 }}>
        {/* Backup Card */}
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '40px 20px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <ShieldCheck size={64} style={{ color: '#059669', marginBottom: 20, margin: '0 auto' }} />
            <h2 style={{ fontSize: '1.5rem', marginBottom: 10 }}>Sao lưu dữ liệu an toàn</h2>
            <p style={{ color: '#4b5563', lineHeight: 1.6, marginBottom: 30 }}>
              Chức năng này sẽ quét qua toàn bộ các bảng dữ liệu (Học sinh, Lớp học, Điểm danh, Điểm số, Thời khóa biểu...) 
              và nén lại thành một tập tin duy nhất định dạng <strong>.json</strong>. <br/><br/>
              Thầy nên thực hiện việc tải sao lưu này định kỳ sau mỗi buổi dạy (Sáng, Chiều, Tối) để đề phòng sự cố mất dữ liệu.
            </p>

            <button 
              className="btn btn-primary" 
              style={{ fontSize: '1.1rem', padding: '12px 24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', maxWidth: '300px', margin: '0 auto' }}
              onClick={handleExport}
              disabled={exporting || importing}
            >
              {exporting ? (
                <><div className="spinner" style={{ width: 20, height: 20 }} /> Đang xử lý sao lưu...</>
              ) : (
                <><HardDriveDownload size={22} /> Tải file Sao lưu toàn bộ dữ liệu</>
              )}
            </button>
          </div>
        </div>

        {/* Restore Card */}
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '40px 20px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {importStep === 1 ? (
              // BƯỚC 1: Chọn file
              <>
                <UploadCloud size={64} style={{ color: '#0284c7', marginBottom: 20, margin: '0 auto' }} />
                <h2 style={{ fontSize: '1.5rem', marginBottom: 10 }}>Phục hồi dữ liệu hệ thống</h2>
                <p style={{ color: '#4b5563', lineHeight: 1.6, marginBottom: 30 }}>
                  Chức năng này sẽ đọc file sao lưu định dạng <strong>.json</strong> và nạp lại toàn bộ dữ liệu vào hệ thống Trung tâm của Thầy. <br/><br/>
                  <strong style={{ color: '#b91c1c' }}>Lưu ý:</strong> Dữ liệu hiện tại trên hệ thống sẽ bị <strong>GHI ĐÈ</strong> bởi dữ liệu trong file.
                </p>
                
                <input 
                  type="file" 
                  accept=".json" 
                  style={{ display: 'none' }} 
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                />
                
                <button 
                  className="btn btn-primary" 
                  style={{ fontSize: '1.1rem', padding: '12px 24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#0284c7', borderColor: '#0284c7', width: '100%', maxWidth: '300px', margin: '0 auto' }}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing || exporting}
                >
                  <Upload size={22} /> Chọn file Sao lưu để Phục hồi
                </button>
              </>
            ) : (
              // BƯỚC 2: Xác nhận và hiển thị thông tin file
              <div style={{ textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 15, color: '#b91c1c' }}>
                  <AlertTriangle size={32} />
                  <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Xác nhận Phục hồi Dữ liệu</h2>
                </div>
                
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px' }}>
                  <p style={{ margin: 0, color: '#991b1b', fontSize: '0.9rem', lineHeight: 1.5 }}>
                    <strong>CẢNH BÁO:</strong> Hành động này sẽ <strong>XÓA & GHI ĐÈ</strong> toàn bộ dữ liệu hiện tại bằng dữ liệu từ file phục hồi. Dữ liệu cũ sẽ bị thay thế hoàn toàn và không thể hoàn tác.
                  </p>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '15px', marginBottom: '25px' }}>
                  <h3 style={{ fontSize: '0.95rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, marginTop: 0 }}>
                    <FileText size={18} color="#0284c7" /> Tóm tắt dữ liệu trong file:
                  </h3>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.9rem' }}>
                    {backupSummary && Object.entries(backupSummary).map(([key, count]) => {
                      if (count === 0) return null;
                      return (
                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                          <span style={{ color: '#4b5563' }}>{COLLECTION_LABELS[key] || key}</span>
                          <strong style={{ color: '#0369a1' }}>{count}</strong>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    className="btn btn-secondary" 
                    style={{ flex: 1, padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    onClick={cancelRestore}
                    disabled={importing}
                  >
                    <XCircle size={18} /> Hủy bỏ
                  </button>
                  <button 
                    className="btn btn-primary" 
                    style={{ flex: 1, padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#dc2626', borderColor: '#dc2626' }}
                    onClick={processRestore}
                    disabled={importing}
                  >
                    {importing ? (
                      <><div className="spinner" style={{ width: 18, height: 18 }} /> Đang xử lý...</>
                    ) : (
                      <><CheckCircle2 size={18} /> Chấp nhận Phục hồi</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
