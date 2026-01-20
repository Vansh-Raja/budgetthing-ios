# BudgetThing Rules

This document describes the app's money + trip rules in human terms.
Each rule also includes a compact contract in brackets so tests and agents can
reference the same source of truth.

## Trip Accounting (Local + Shared)

Trip accounting has two layers:

1) **Ledger**: who owes what (does NOT change personal accounts)
2) **Cashflow**: real money movement (DOES change personal accounts)

### Ledger Rules

- Your share in a trip is just a ledger entry. It should never change any account balance.
  [RULE TRIP_SHARE_LEDGER_ONLY | applies_to=local_trip,shared_trip | assert=trip_share.accountId==null]

### Cashflow Rules

- If you paid an expense, your personal account decreases by the full expense amount.
  [RULE CASHFLOW_ON_PAY | applies_to=local_trip,shared_trip | assert=if payer==me -> trip_cashflow(amount==total,type==expense,accountId!=null)]

- If you did not pay an expense, your personal accounts do not change until settlement.
  [RULE NO_CASHFLOW_IF_NOT_PAYER | applies_to=local_trip,shared_trip | assert=if payer!=me -> no trip_cashflow for me]

- Settlements always move money:
  - payer (from) decreases (expense)
  - receiver (to) increases (income)
  [RULE SETTLEMENT_MOVES_MONEY | applies_to=local_trip,shared_trip | assert=from->expense(trip_settlement,accountId!=null) && to->income(trip_settlement,accountId!=null)]

### Safety Rules

- Derivation must be idempotent (running derive twice must not create duplicates).
  [RULE RECONCILE_IDEMPOTENT | applies_to=local_trip,shared_trip | assert=compute(input)==compute(input)]

- If the user changes the account used for a derived cashflow row, reconcile must not overwrite it.
  [RULE PRESERVE_USER_ACCOUNT_CHOICE | applies_to=local_trip,shared_trip | assert=derived.cashflow.accountId preserved if already set]

## UI Rules

- Transactions tab shows ledger + settlements, not payer cashflow.
  [RULE UI_HIDE_CASHFLOW_IN_TXNS | assert=hideInTransactions=['trip_cashflow']]

- Trip share rows in Transactions list display as: `share · total`.
  The total is blue-muted (secondary emphasis).
  [RULE UI_TRIP_SHARE_AMOUNT_FORMAT | assert=trip_share.display='share · total' && totalStyle=blueMuted]

- Trip settlement rows are visible in Transactions, but excluded from monthly "spent" totals.
  [RULE UI_SETTLEMENT_EXCLUDED_FROM_TOTALS | assert=trip_settlement not counted in monthlyTotals]

- Derived rows are not bulk editable/deletable.
  [RULE UI_DERIVED_NOT_BULK_EDITABLE | assert=selectionMode excludes ['trip_share','trip_cashflow','trip_settlement']]

## Local Trip Identity Rules

- Every local group trip must have exactly one participant marked as the current user.
  [RULE LOCAL_TRIP_HAS_CURRENT_USER | applies_to=local_trip | assert=count(participants.isCurrentUser==true)==1]

## Parity

- Local trips should behave like shared trips where it matters:
  same ledger vs cashflow model, same transaction visibility rules.
  [RULE PARITY_LOCAL_SHARED | applies_to=local_trip,shared_trip | assert=accountingModel=identical && uiModel=identical]
