/**
 * CurrencyUtils - Currency formatting utilities
 * 
 * This is a direct port of CurrencyUtils.swift with identical behavior.
 */

export const POPULAR_CURRENCIES: Array<{ code: string; name: string }> = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'NZD', name: 'New Zealand Dollar' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'SEK', name: 'Swedish Krona' },
  { code: 'NOK', name: 'Norwegian Krone' },
  { code: 'DKK', name: 'Danish Krone' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'AED', name: 'UAE Dirham' },
];

// Full list with symbols for picker
export const CURRENCIES: Array<{ code: string; name: string; symbol: string }> = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: '$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: '$' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: '$' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: '$' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: '$' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' },
];

const CODE_TO_SYMBOL: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
  JPY: '¥',
  CNY: '¥',
  CAD: '$',
  AUD: '$',
  NZD: '$',
  CHF: 'CHF',
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
  SGD: '$',
  HKD: '$',
  AED: 'د.إ',
};

/**
 * Get currency symbol for a currency code
 */
export function getCurrencySymbol(code: string): string {
  return CODE_TO_SYMBOL[code] ?? '$';
}

/**
 * Format cents as a currency string
 * 
 * @param cents - Amount in cents (e.g., 1234 = $12.34)
 * @param currencyCode - ISO 4217 currency code (e.g., 'USD')
 * @param options - Formatting options
 */
export function formatCents(
  cents: number,
  currencyCode: string = 'INR',
  options?: {
    showSymbol?: boolean;
    showSign?: boolean;
    compact?: boolean;
  }
): string {
  const { showSymbol = true, showSign = false, compact = false } = options ?? {};

  const amount = cents / 100;
  const symbol = getCurrencySymbol(currencyCode);

  // Determine decimal places (JPY and similar have 0 decimal places)
  const noDecimalCurrencies = ['JPY', 'KRW', 'VND'];
  const decimals = noDecimalCurrencies.includes(currencyCode) ? 0 : 2;

  let formatted: string;

  if (compact && Math.abs(amount) >= 1000) {
    // Compact format for large numbers
    if (Math.abs(amount) >= 10000000) { // Crore (10M)
      formatted = `${(amount / 10000000).toFixed(1)}Cr`;
    } else if (Math.abs(amount) >= 100000) { // Lakh (100K)
      formatted = `${(amount / 100000).toFixed(1)}L`;
    } else if (Math.abs(amount) >= 1000) {
      formatted = `${(amount / 1000).toFixed(1)}K`;
    } else {
      formatted = amount.toFixed(decimals);
    }
  } else {
    // Standard format with locale-aware number formatting
    // Use en-IN for INR to get correct comma placement (1,50,000)
    const locale = currencyCode === 'INR' ? 'en-IN' : 'en-US';
    formatted = Math.abs(amount).toLocaleString(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  let result = showSymbol ? `${symbol}${formatted}` : formatted;

  if (showSign && cents > 0) {
    result = `+${result}`;
  } else if (cents < 0) {
    result = `-${showSymbol ? symbol : ''}${formatted}`;
    if (showSymbol) {
      result = `-${symbol}${formatted}`;
    }
  }

  return result;
}

/**
 * Parse a currency string to cents
 * 
 * @param value - String value (e.g., "12.34" or "$12.34")
 * @returns Amount in cents, or null if invalid
 */
export function parseToCents(value: string): number | null {
  // Remove currency symbols and whitespace
  const cleaned = value.replace(/[$€£₹¥,\s]/g, '').trim();

  if (!cleaned || isNaN(Number(cleaned))) {
    return null;
  }

  const amount = parseFloat(cleaned);
  return Math.round(amount * 100);
}

/**
 * Convert cents to decimal amount
 */
export function centsToAmount(cents: number): number {
  return cents / 100;
}

/**
 * Convert decimal amount to cents
 */
export function amountToCents(amount: number): number {
  return Math.round(amount * 100);
}

// Export as namespace for compatibility
export const CurrencyUtils = {
  POPULAR_CURRENCIES,
  getCurrencySymbol,
  formatCents,
  parseToCents,
  centsToAmount,
  amountToCents,
};
