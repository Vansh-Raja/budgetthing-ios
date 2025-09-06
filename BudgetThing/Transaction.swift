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
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.isDeleted = isDeleted
        self.syncState = syncState
        self.ckRecordID = ckRecordID
    }
}


