const syrianMobile = /^(?:\+963|00963|0)?(9[0-9]{8})$/u;

export function normalizeSyrianPhone(phone: string): string | null {
  const nationalNumber = syrianMobile.exec(phone)?.[1];
  return nationalNumber === undefined ? null : `+963${nationalNumber}`;
}

export function maskPhone(phone: string): string | null {
  const normalized = normalizeSyrianPhone(phone);
  return normalized === null ? null : `+9639••••••${normalized.slice(-2)}`;
}
