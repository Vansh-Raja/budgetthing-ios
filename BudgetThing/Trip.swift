//
//  Trip.swift
//  BudgetThing
//

import Foundation
import SwiftData

@Model
final class Trip {
    @Attribute(.unique) var id: UUID
    var name: String
    var emoji: String
    var startDate: Date?
    var endDate: Date?
    var budget: Decimal?
    var isGroup: Bool
    var isActive: Bool
    var isArchived: Bool

    // Relationships
    @Relationship(deleteRule: .cascade, inverse: \TripParticipant.trip)
    var participants: [TripParticipant]?

    @Relationship(deleteRule: .cascade, inverse: \TripExpense.trip)
    var expenses: [TripExpense]?

    @Relationship(deleteRule: .cascade, inverse: \TripSettlement.trip)
    var settlements: [TripSettlement]?

    // Sync metadata
    var createdAt: Date
    var updatedAt: Date
    var isDeleted: Bool?

    init(
        id: UUID = UUID(),
        name: String,
        emoji: String = "✈️",
        startDate: Date? = nil,
        endDate: Date? = nil,
        budget: Decimal? = nil,
        isGroup: Bool = false,
        isActive: Bool = true,
        isArchived: Bool = false,
        participants: [TripParticipant]? = nil,
        expenses: [TripExpense]? = nil,
        settlements: [TripSettlement]? = nil,
        createdAt: Date = .now,
        updatedAt: Date = .now,
        isDeleted: Bool? = nil
    ) {
        self.id = id
        self.name = name
        self.emoji = emoji
        self.startDate = startDate
        self.endDate = endDate
        self.budget = budget
        self.isGroup = isGroup
        self.isActive = isActive
        self.isArchived = isArchived
        self.participants = participants
        self.expenses = expenses
        self.settlements = settlements
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.isDeleted = isDeleted
    }
}
