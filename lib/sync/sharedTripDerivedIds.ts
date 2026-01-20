function safeIdSegment(input: string) {
  return input.replace(/[^A-Za-z0-9._-]/g, '_');
}

export function derivedTripShareId(userId: string, expenseId: string) {
  return `drv_trip_share_${safeIdSegment(userId)}_${safeIdSegment(expenseId)}`;
}

export function derivedTripCashflowId(userId: string, expenseId: string) {
  return `drv_trip_cashflow_${safeIdSegment(userId)}_${safeIdSegment(expenseId)}`;
}

export function derivedTripSettlementId(userId: string, settlementId: string, direction: 'in' | 'out') {
  return `drv_trip_settlement_${direction}_${safeIdSegment(userId)}_${safeIdSegment(settlementId)}`;
}
