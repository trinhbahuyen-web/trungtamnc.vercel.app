import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Copy, GraduationCap, Wallet, X } from 'lucide-react';
import {
  fmtCurrency,
  getClassPaymentConfig,
  getStudentReport,
  getTuitionPayment,
} from '../services/dataService';
import { ClassPaymentConfig, ParentReport, TuitionPaymentRecord } from '../types';
import {
  buildTransferNote,
  buildVietQrUrl,
  currentMonthKey,
  getEffectivePaymentConfig,
  getGlobalPaymentConfig,
  isPaymentConfigReady,
  monthLabel,
} from '../utils/payment';

export default function PayView() {
  const { studentId } = useParams<{ studentId: string }>();
  const [data, setData] = useState<ParentReport | null>(null);
  const [configs, setConfigs] = useState<Record<string, ClassPaymentConfig | null>>({});
  const [payments, setPayments] = useState<Record<string, TuitionPaymentRecord | null>>({});
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const globalConfig = useMemo(() => getGlobalPaymentConfig(), []);

  useEffect(() => {
    if (!studentId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, monthKey]);

  async function load() {
    if (!studentId) return;
    setLoading(true);
    setError('');
    try {
      const report = await getStudentReport(studentId);
      setData(report);

      const configEntries = await Promise.all(
        report.classes.map(async (cls) => [cls.classId, await getClassPaymentConfig(cls.classId)] as const)
      );
      setConfigs(Object.fromEntries(configEntries));

      const paymentEntries = await Promise.all(
        report.classes.map(async (cls) => [cls.classId, await getTuitionPayment(cls.classId, studentId, monthKey)] as const)
      );
      setPayments(Object.fromEntries(paymentEntries));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải thông tin học phí');
    } finally {
      setLoading(false);
    }
  }

  async function copyText(text: string) {
    await navigator.clipboard?.writeText(text);
  }

  if (loading) {
    return (
      <div className="center-screen">
        <div style={{ textAlign: 'center', color: 'var(--primary)' }}>
          <div className="spinner" style={{ margin: '0 auto' }} />
          <div style={{ marginTop: 12, fontWeight: 600 }}>Đang tải phiếu học phí...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="center-screen">
        <div className="info-card">
          <div className="info-icon" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>
            <X size={30} />
          </div>
          <h2 style={{ color: 'var(--danger)', margin: '0.5rem 0' }}>Không tìm thấy</h2>
          <p style={{ color: 'var(--text-muted)' }}>{error || 'Không có dữ liệu'}</p>
        </div>
      </div>
    );
  }

  const student = data.student;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-gradient)', padding: '1.5rem' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div
          style={{
            background: 'var(--teal-gradient)',
            borderRadius: 20,
            padding: '2rem',
            color: '#fff',
            marginBottom: '1.5rem',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div style={{ fontSize: '0.85rem', opacity: 0.85, marginBottom: '0.5rem', display: 'flex', gap: 6, alignItems: 'center' }}>
            <Wallet size={16} /> Phiếu học phí · {globalConfig.centerName}
          </div>
          <h1 style={{ margin: 0, fontSize: '1.7rem', fontWeight: 800 }}>{student.fullName}</h1>
          <div style={{ marginTop: '0.75rem', opacity: 0.92, fontSize: '0.92rem' }}>
            {student.parentName && <span style={{ marginRight: '1.5rem' }}>👨‍👩‍👧 {student.parentName}</span>}
            {student.parentPhone && <span>📞 {student.parentPhone}</span>}
          </div>
        </div>

        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Tháng học phí</label>
                <input
                  className="form-control"
                  type="month"
                  value={monthKey}
                  onChange={(e) => setMonthKey(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Link báo cáo học tập</label>
                <Link className="btn btn-secondary" to={`/parent/${studentId}`} style={{ width: '100%' }}>
                  <GraduationCap size={16} /> Xem điểm &amp; chuyên cần
                </Link>
              </div>
            </div>
          </div>
        </div>

        {data.classes.length === 0 && (
          <div className="card">
            <div className="card-body" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
              Học sinh chưa được đăng ký lớp nào
            </div>
          </div>
        )}

        {data.classes.map((cls) => {
          const classConfig = configs[cls.classId];
          const effectiveConfig = getEffectivePaymentConfig(classConfig);
          const ready = isPaymentConfigReady(effectiveConfig);
          const payment = payments[cls.classId];

          const monthlyAtt = cls.attendance.filter((a) => a.date.startsWith(monthKey));
          const attended = monthlyAtt.filter((a) => a.present).length;
          const sessionsTotal = new Set(monthlyAtt.map((a) => a.date)).size;
          const amount = attended * cls.feePerSession;
          const transferNote = buildTransferNote({
            pattern: effectiveConfig.notePattern,
            className: cls.className,
            studentName: student.fullName,
            monthKey,
          });
          const qrUrl = buildVietQrUrl({
            bankId: effectiveConfig.bankId,
            bankAccount: effectiveConfig.bankAccount,
            bankAccountName: effectiveConfig.bankAccountName,
            amount,
            addInfo: transferNote,
            template: effectiveConfig.qrTemplate,
          });
          const paid = payment?.status === 'PAID';

          return (
            <div key={cls.classId} className="card pay-card" style={{ marginBottom: '1rem' }}>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span>{cls.className}</span>
                {paid ? <span className="badge badge-success">Đã thu</span> : <span className="badge badge-warning">Chưa xác nhận thu</span>}
              </div>
              <div className="card-body">
                <div className="pay-summary-grid">
                  <div>
                    <div className="form-label">Tháng</div>
                    <strong>{monthLabel(monthKey)}</strong>
                  </div>
                  <div>
                    <div className="form-label">Số buổi đã học</div>
                    <strong>{attended}/{sessionsTotal} buổi</strong>
                  </div>
                  <div>
                    <div className="form-label">Học phí / buổi</div>
                    <strong>{fmtCurrency(cls.feePerSession)}</strong>
                  </div>
                  <div>
                    <div className="form-label">Tổng cần chuyển</div>
                    <strong style={{ color: 'var(--primary)', fontSize: '1.2rem' }}>{fmtCurrency(amount)}</strong>
                  </div>
                </div>

                {paid && (
                  <div className="payment-paid-box">
                    <CheckCircle2 size={18} /> Trung tâm đã xác nhận thu khoản học phí này.
                  </div>
                )}

                {!ready ? (
                  <div className="payment-warning" style={{ marginTop: '1rem' }}>
                    Lớp này chưa có cấu hình tài khoản nhận học phí. Vui lòng liên hệ trung tâm.
                  </div>
                ) : amount <= 0 ? (
                  <div className="payment-warning" style={{ marginTop: '1rem' }}>
                    Tháng này chưa phát sinh học phí theo dữ liệu điểm danh.
                  </div>
                ) : (
                  <div className="pay-qr-layout">
                    <div className="pay-qr-box">
                      <img src={qrUrl} alt="QR học phí" />
                    </div>
                    <div className="pay-bank-info">
                      <div className="form-label">Ngân hàng / tài khoản</div>
                      <p><strong>{effectiveConfig.bankId}</strong> · {effectiveConfig.bankAccount}</p>
                      <p>{effectiveConfig.bankAccountName}</p>
                      <div className="form-label" style={{ marginTop: '0.75rem' }}>Nội dung chuyển khoản</div>
                      <code className="transfer-note">{transferNote}</code>
                      <div style={{ display: 'flex', gap: 8, marginTop: '1rem', flexWrap: 'wrap' }}>
                        <button className="btn btn-primary" onClick={() => copyText(transferNote)}>
                          <Copy size={15} /> Copy nội dung CK
                        </button>
                        <button className="btn btn-ghost" onClick={() => copyText(window.location.href)}>
                          <Copy size={15} /> Copy link học phí
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div style={{ textAlign: 'center', marginTop: '2rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          🔒 Trang học phí dành riêng cho phụ huynh · {globalConfig.centerName}
        </div>
      </div>
    </div>
  );
}
