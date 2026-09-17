---
name: BudgetThing Import
description: Import structured expense or income candidates into BudgetThing's review inbox using the BudgetThing Import API.
---

# BudgetThing Import

Use this skill when the user asks you to send structured expense or income candidates to BudgetThing for review.

## Secret

Read the API key from the environment variable `BUDGETTHING_API_KEY`.

Never print, store, or hardcode the API key.

## Base URL

Production:

```text
https://ceaseless-mandrill-733.convex.site/v1
```

## Rules

- Submit structured JSON only.
- Never send raw emails, raw messages, OCR dumps, attachments, images, card numbers, bank statements, or passwords.
- Use integer cents for money.
- Use ISO 8601 timestamps for `occurredAt`.
- Use the user's current BudgetThing currency from `/v1/import/metadata`.
- Use `expense` or `income` only.
- Call `/v1/import/metadata` to look up accounts and categories.
- Leave `accountId` or `categoryId` blank when uncertain.
- Reuse the same `Idempotency-Key` when retrying the same request.
- Use stable per-item `externalId` values from the source system.
- If BudgetThing returns duplicate flags, do not retry with a new external ID. Tell the user it was queued for review.

## Metadata Lookup

```bash
curl -s \
  -H "Authorization: Bearer $BUDGETTHING_API_KEY" \
  https://ceaseless-mandrill-733.convex.site/v1/import/metadata
```

The response includes only safe lookup data: currency, default account ID, account IDs/names, and category IDs/names. It does not include balances or transaction history.

## Create Imports

```bash
curl -s \
  -X POST \
  -H "Authorization: Bearer $BUDGETTHING_API_KEY" \
  -H "Idempotency-Key: gmail-message-abc123" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "gmail-agent",
    "items": [
      {
        "externalId": "gmail-message-abc123:line-1",
        "type": "expense",
        "amountCents": 1299,
        "currencyCode": "INR",
        "occurredAt": "2026-05-24T10:30:00+05:30",
        "merchantName": "Blue Tokai",
        "note": "Coffee",
        "accountId": "optional-account-id",
        "categoryId": "optional-category-id"
      }
    ]
  }' \
  https://ceaseless-mandrill-733.convex.site/v1/imports
```

BudgetThing will place the item in the user's import inbox. The user must confirm or edit it in the app before it affects balances.

## Check Status

```bash
curl -s \
  -H "Authorization: Bearer $BUDGETTHING_API_KEY" \
  "https://ceaseless-mandrill-733.convex.site/v1/imports/status?source=gmail-agent&externalId=gmail-message-abc123:line-1"
```
