import { ClassPaymentConfig, PaymentConfig } from '../types';

export const DEFAULT_QR_TEMPLATE = 'compact2';
export const DEFAULT_PAYMENT_NOTE_PATTERN = '{CLASS}_{STUDENT}_HP THANG {MONTH}';

export function getGlobalPaymentConfig(): PaymentConfig {
  return {
    bankId: import.meta.env.VITE_BANK_ID || '',
    bankAccount: import.meta.env.VITE_BANK_ACCOUNT || '',
    bankAccountName: import.meta.env.VITE_BANK_ACCOUNT_NAME || '',
    centerName: import.meta.env.VITE_CENTER_NAME || 'Trung tâm Giáo dục',
    qrTemplate: DEFAULT_QR_TEMPLATE,
    notePattern: DEFAULT_PAYMENT_NOTE_PATTERN,
  };
}

export function getEffectivePaymentConfig(
  classConfig?: ClassPaymentConfig | null
): PaymentConfig {
  const globalConfig = getGlobalPaymentConfig();

  if (!classConfig || classConfig.mode !== 'CLASS') {
    return globalConfig;
  }

  return {
    bankId: classConfig.bankId || globalConfig.bankId,
    bankAccount: classConfig.bankAccount || globalConfig.bankAccount,
    bankAccountName: classConfig.bankAccountName || globalConfig.bankAccountName,
    centerName: globalConfig.centerName,
    qrTemplate: classConfig.qrTemplate || globalConfig.qrTemplate,
    notePattern: classConfig.notePattern || globalConfig.notePattern,
  };
}

export function removeVietnameseTone(str: string) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function cleanTransferText(str: string, maxLength = 80) {
  return removeVietnameseTone(str)
    .toUpperCase()
    .replace(/[^A-Z0-9 _-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function monthNumber(monthKey: string) {
  const parts = String(monthKey || '').split('-');
  const m = parts.length >= 2 ? Number(parts[1]) : 0;
  return m || new Date().getMonth() + 1;
}

export function monthLabel(monthKey: string) {
  const parts = String(monthKey || '').split('-');
  const y = parts[0];
  const m = parts[1];

  if (!y || !m) return '';

  return `tháng ${Number(m)}/${y}`;
}

export function currentMonthKey() {
  const d = new Date();
  const month = d.getMonth() + 1;
  const mm = month < 10 ? `0${month}` : String(month);

  return `${d.getFullYear()}-${mm}`;
}

function replaceToken(input: string, token: string, value: string) {
  return String(input || '').split(token).join(value);
}

export function buildTransferNote(params: {
  pattern?: string;
  className: string;
  studentName: string;
  monthKey: string;
}) {
  const pattern = params.pattern || DEFAULT_PAYMENT_NOTE_PATTERN;
  const month = monthNumber(params.monthKey);

  let note = pattern;
  note = replaceToken(note, '{CLASS}', params.className || '');
  note = replaceToken(note, '{STUDENT}', params.studentName || '');
  note = replaceToken(note, '{MONTH}', String(month));

  return cleanTransferText(note);
}

export function buildVietQrUrl(params: {
  bankId: string;
  bankAccount: string;
  bankAccountName?: string;
  amount: number;
  addInfo: string;
  template?: string;
}) {
  const template = params.template || DEFAULT_QR_TEMPLATE;
  const bankId = encodeURIComponent(String(params.bankId || '').trim());
  const account = encodeURIComponent(String(params.bankAccount || '').trim());

  const query = new URLSearchParams({
    amount: String(Math.round(Number(params.amount) || 0)),
    addInfo: params.addInfo,
  });

  if (params.bankAccountName) {
    query.set('accountName', cleanTransferText(params.bankAccountName, 100));
  }

  return `https://img.vietqr.io/image/${bankId}-${account}-${template}.png?${query.toString()}`;
}

export function isPaymentConfigReady(config: PaymentConfig) {
  return Boolean(config.bankId && config.bankAccount && config.bankAccountName);
}
