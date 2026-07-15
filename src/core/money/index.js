/**
 * Money.
 *
 * Amounts are integers in MINOR units (paisa, cents) held as BigInt. Never floats:
 * 0.1 + 0.2 !== 0.3 in binary floating point, and a rounding error in a savings
 * ledger is not a cosmetic bug — it's someone's money going missing.
 *
 * Percentages are integer BASIS POINTS (bps). 250 bps = 2.50%. Same reason.
 *
 * BigInt cannot be JSON-serialised, so amounts cross the Server/Client boundary as
 * strings via the DTO layer. That constraint is a feature: it forces an explicit
 * decision about precision at the edge instead of letting a float sneak in.
 */

export const BPS_DIVISOR = 10000n;

/** Convert a major-unit input (e.g. "5000.50" taka) to minor units. */
export function toMinor(amount, exponent = 2) {
  if (typeof amount === "bigint") return amount;

  const str = String(amount).trim();
  if (!/^-?\d+(\.\d+)?$/.test(str)) {
    throw new Error(`Not a valid amount: ${amount}`);
  }

  const negative = str.startsWith("-");
  const [whole, fraction = ""] = (negative ? str.slice(1) : str).split(".");

  // Pad or truncate the fraction to exactly `exponent` digits.
  const padded = fraction.padEnd(exponent, "0").slice(0, exponent);
  const minor = BigInt(whole) * 10n ** BigInt(exponent) + BigInt(padded || "0");

  return negative ? -minor : minor;
}

/** Convert minor units back to a major-unit string. Exact — no float involved. */
export function toMajorString(minor, exponent = 2) {
  const value = BigInt(minor);
  const negative = value < 0n;
  const abs = negative ? -value : value;

  const divisor = 10n ** BigInt(exponent);
  const whole = abs / divisor;
  const fraction = abs % divisor;

  const fractionStr = exponent > 0 ? "." + fraction.toString().padStart(exponent, "0") : "";
  return `${negative ? "-" : ""}${whole}${fractionStr}`;
}

/**
 * Human-readable amount, e.g. "৳5,000.00".
 * Formats the integer and fractional parts separately so the value never passes
 * through a JavaScript number and loses precision on large sums.
 */
export function formatMoney(minor, currency = "BDT", exponent = 2, locale = "en-BD") {
  const major = toMajorString(minor, exponent);
  const negative = major.startsWith("-");
  const [whole, fraction = ""] = (negative ? major.slice(1) : major).split(".");

  const groupedWhole = new Intl.NumberFormat(locale).format(BigInt(whole));
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;

  return `${negative ? "-" : ""}${symbol}${groupedWhole}${fraction ? "." + fraction : ""}`;
}

export const CURRENCY_SYMBOLS = {
  BDT: "৳",
  USD: "$",
  EUR: "€",
  GBP: "£",
  INR: "₹",
  PKR: "₨",
  NPR: "रू",
  AED: "د.إ",
};

/**
 * Apply a basis-point rate, e.g. a late fee.
 * Rounds half-up, and rounds the magnitude so -0.5 and +0.5 move the same distance
 * from zero (banker's asymmetry here would quietly favour one side of the ledger).
 */
export function applyBps(minor, bps) {
  const value = BigInt(minor);
  const rate = BigInt(bps);
  if (rate === 0n) return 0n;

  const negative = value < 0n;
  const abs = negative ? -value : value;

  const product = abs * rate;
  const rounded = (product + BPS_DIVISOR / 2n) / BPS_DIVISOR;

  return negative ? -rounded : rounded;
}

/** Sum a list of minor amounts. */
export function sumMinor(amounts) {
  return amounts.reduce((total, a) => total + BigInt(a), 0n);
}

/** The full pot for one cycle: contribution x roster size. */
export function potForCycle(contributionMinor, memberCount) {
  return BigInt(contributionMinor) * BigInt(memberCount);
}
