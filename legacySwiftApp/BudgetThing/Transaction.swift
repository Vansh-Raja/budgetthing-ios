//
//  Transaction.swift
//  BudgetThing
//

import Foundation
import SwiftData

@Model
final class Transaction {
    var id: UUID
    var amount: Decimal
    var date: Date
    var note: String?
    var category: Category?
    var account: Account?
    var typeRaw: String? // "expense" or "income"; nil treated as expense for backward-compat
    // System-originated kinds (e.g., balance adjustment). nil for normal user-entered txns.
    var systemRaw: String?

    // Transfer metadata (single transfer txn visible in both accounts)
    var transferFromAccountId: UUID?
    var transferToAccountId: UUID?

    // Trip relationship (for trip expense tracking)
    var tripExpense: TripExpense?

    // Sync-friendly metadata
    var createdAt: Date
    var updatedAt: Date
    var isDeleted: Bool?
    var syncState: String?
    var ckRecordID: String?

    init(
        id: UUID = UUID(),
        amount: Decimal,
        date: Date = .now,
        note: String? = nil,
        category: Category? = nil,
        account: Account? = nil,
        type: String? = nil,
        system: String? = nil,
        transferFromAccountId: UUID? = nil,
        transferToAccountId: UUID? = nil,
        createdAt: Date = .now,
        updatedAt: Date = .now,
        isDeleted: Bool? = nil,
        syncState: String? = nil,
        ckRecordID: String? = nil
    ) {
        self.id = id
        self.amount = amount
        self.date = date
        self.note = note
        self.category = category
        self.account = account
        self.typeRaw = type
        self.systemRaw = system
        self.transferFromAccountId = transferFromAccountId
        self.transferToAccountId = transferToAccountId
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.isDeleted = isDeleted
        self.syncState = syncState
        self.ckRecordID = ckRecordID
    }
}


