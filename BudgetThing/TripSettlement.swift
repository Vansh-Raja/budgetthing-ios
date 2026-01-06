//
//  TripSettlement.swift
//  BudgetThing
//

import Foundation
import SwiftData

@Model
final class TripSettlement {
    @Attribute(.unique) var id: UUID
    var amount: Decimal
    var date: Date
    var note: String?

    // Relationships
    var trip: Trip?
    var fromParticipant: TripParticipant?
    var toParticipant: TripParticipant?

    // Sync metadata
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        amount: Decimal,
        date: Date = .now,
        note: String? = nil,
        trip: Trip? = nil,
        fromParticipant: TripParticipant? = nil,
        toParticipant: TripParticipant? = nil,
        createdAt: Date = .now,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.amount = amount
        self.date = date
        self.note = note
        self.trip = trip
        self.fromParticipant = fromParticipant
        self.toParticipant = toParticipant
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}
