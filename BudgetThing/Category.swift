//
//  Category.swift
//  BudgetThing
//

import Foundation
import SwiftData

@Model
final class Category {
    var id: UUID
    var name: String
    var emoji: String
    var sortIndex: Int?
    var colorHex: String?
    var monthlyBudget: Decimal?

    // Sync-friendly metadata (optional to avoid migrations while iterating)
    var createdAt: Date
    var updatedAt: Date
    var isDeleted: Bool?
    var syncState: String?
    var ckRecordID: String?

    init(
        id: UUID = UUID(),
        name: String,
        emoji: String,
        sortIndex: Int? = nil,
        colorHex: String? = nil,
        monthlyBudget: Decimal? = nil,
        createdAt: Date = .now,
        updatedAt: Date = .now,
        isDeleted: Bool? = nil,
        syncState: String? = nil,
        ckRecordID: String? = nil
    ) {
        self.id = id
        self.name = name
        self.emoji = emoji
        self.sortIndex = sortIndex
        self.colorHex = colorHex
        self.monthlyBudget = monthlyBudget
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.isDeleted = isDeleted
        self.syncState = syncState
        self.ckRecordID = ckRecordID
    }
}


