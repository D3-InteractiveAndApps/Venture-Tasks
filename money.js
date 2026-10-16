// money.js — formatting a task's client "value" in whichever currency the
// user picked in Settings (Appearance → Currency). Values themselves are
// stored as plain numbers; the currency is display-only, so switching it
// never changes any data.

export const CURRENCIES = [
  ["USD", "US dollar ($)"],
  ["CAD", "Canadian dollar (CA$)"],
  ["EUR", "Euro (€)"],
  ["GBP", "British pound (£)"],
  ["AUD", "Australian dollar (A$)"],
  ["NZD", "New Zealand dollar (NZ$)"],
  ["JPY", "Japanese yen (¥)"],
  ["INR", "Indian rupee (₹)"],
  ["MXN", "Mexican peso (MX$)"],
  ["BRL", "Brazilian real (R$)"],
  ["CHF", "Swiss franc (CHF)"],
  ["SEK", "Swedish krona (kr)"],
  ["ZAR", "South African rand (R)"],
  ["PHP", "Philippine peso (₱)"],
];

export function normalizeCurrency(code) {
  return CURRENCIES.some(([c]) => c === code) ? code : "USD";
}

// "$450" for a whole amount, "$450.50" with cents, thousands separators,
// symbol placed however the currency/locale expects (e.g. "450 €" in some
// locales). null/0/unset all render as nothing — no badge, no stat.
export function formatMoney(n, currency) {
  if (n === null || n === undefined || n === "") return null;
  const num = Number(n);
  if (!isFinite(num) || num <= 0) return null;
  const code = normalizeCurrency(currency);
  const whole = Number.isInteger(num) || code === "JPY";
  try {
    return num.toLocaleString(undefined, {
      style: "currency",
      currency: code,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: code === "JPY" ? 0 : 2
    });
  } catch (e) {
    return code + " " + num.toFixed(whole ? 0 : 2);
  }
}
