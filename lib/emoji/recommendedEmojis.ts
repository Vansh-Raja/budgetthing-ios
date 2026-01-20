import type { AccountKind } from '../logic/types';

export const RECOMMENDED_ACCOUNT_EMOJIS_BY_KIND: Record<AccountKind, string[]> = {
  cash: ['💵', '🪙', '👛', '👜', '🎒', '🧾', '💴', '💶', '💷', '🧰'],
  card: ['💳', '🔒', '✅', '🔁', '💸', '🏷️', '✨', '📝', '📇', '📬'],
  savings: ['🏦', '🏛️', '💱', '📈', '📉', '🔐', '🏧', '🪪', '📊', '🗂️'],
};

export const RECOMMENDED_TRIP_EMOJIS: string[] = [
  '✈️', '🏝️', '🏔️', '🏙️', '🏰', '🗽', '🗼', '⛩️',
  '🚗', '🚂', '🚢', '⛺', '🎢', '🏟️', '🏖️', '🏜️',
  '🗺️', '📸', '🎒', '🕶️', '🍷', '🍻', '🍕', '🍱',
];

export const RECOMMENDED_CATEGORY_EMOJIS: string[] = [
  '🍔', '🛒', '🍽️', '☕',
  '🚕', '🚗', '⛽', '🅿️',
  '🏠', '💡', '🌐', '📱',
  '💳', '🧾', '💵', '🏦',
  '🎉', '🎬', '🎁', '✈️',
  '💊', '🏋️', '📚', '❓',
];
