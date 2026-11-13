import { CountryPack } from '../countries/types';

export function formatDate(dateVal: Date | string | number | null | undefined, pack?: CountryPack): string {
  if (!dateVal) return '—';
  const date = new Date(dateVal);
  if (isNaN(date.getTime())) return '—';

  const locale = pack?.locale || 'en-US';
  
  if (pack?.dateFormat === 'DD/MM/YYYY') {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  if (pack?.dateFormat === 'YYYY/MM/DD' || pack?.dateFormat === 'YYYY-MM-DD') {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${year}/${month}/${day}`;
  }

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function formatDateTime(dateVal: Date | string | number | null | undefined, pack?: CountryPack): string {
  if (!dateVal) return '—';
  const date = new Date(dateVal);
  if (isNaN(date.getTime())) return '—';

  const locale = pack?.locale || 'en-US';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatPhone(phone: string | null | undefined, pack?: CountryPack): string {
  if (!phone) return '—';
  const prefix = pack?.phonePrefix || '';
  if (prefix && !phone.startsWith('+')) {
    return `${prefix} ${phone}`;
  }
  return phone;
}
