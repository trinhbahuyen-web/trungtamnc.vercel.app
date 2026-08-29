// ====== CẤU HÌNH TÀI KHOẢN NHẬN HỌC PHÍ ======
// Điền qua biến môi trường (Vercel → Environment Variables):
//   VITE_BANK_ID           mã ngân hàng (vd 'VCB', 'MB', 'TCB') hoặc BIN (vd '970436')
//   VITE_BANK_ACCOUNT      số tài khoản
//   VITE_BANK_ACCOUNT_NAME tên chủ tài khoản (viết HOA không dấu)
//   VITE_CENTER_NAME       (tuỳ chọn) tên trung tâm hiển thị trên trang thanh toán

export const BANK = {
  id: import.meta.env.VITE_BANK_ID || '',
  account: import.meta.env.VITE_BANK_ACCOUNT || '',
  name: import.meta.env.VITE_BANK_ACCOUNT_NAME || '',
};

export const CENTER_NAME =
  import.meta.env.VITE_CENTER_NAME || 'Trung tâm Giáo dục';

export const isBankConfigured = () => Boolean(BANK.id && BANK.account);

/** Bỏ dấu tiếng Việt để nội dung chuyển khoản an toàn. */
export const stripDiacritics = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');

/**
 * Sinh URL ảnh VietQR (miễn phí, không cần API key).
 * template: 'compact' | 'compact2' | 'qr_only' | 'print'
 */
export function vietQrUrl(
  amount: number,
  info: string,
  template: 'compact' | 'compact2' | 'qr_only' | 'print' = 'compact2'
) {
  const base = `https://img.vietqr.io/image/${BANK.id}-${BANK.account}-${template}.png`;
  const params = new URLSearchParams({
    amount: String(Math.max(0, Math.round(amount))),
    addInfo: stripDiacritics(info),
    accountName: BANK.name,
  });
  return `${base}?${params.toString()}`;
}
