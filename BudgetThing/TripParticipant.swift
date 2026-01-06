//
//  TripParticipant.swift
//  BudgetThing
//

import Foundation
import SwiftData

@Model
final class TripParticipant {
    @Attribute(.unique) var id: UUID
    var name: String
    var email: String?
    var phone: String?
    var isCurrentUser: Bool
    var colorHex: String?

    // Relationships
    var trip: Trip?

    @Relationship(deleteRule: .nullify, inverse: \TripExpense.paidByParticipant)
    var paidExpenses: [TripExpense]?

    @Relationship(deleteRule: .nullify, inverse: \TripSettlement.fromParticipant)
    var settlementsFrom: [TripSettlement]?

    @Relationship(deleteRule: .nullify, inverse: \TripSettlement.toParticipant)
    var settlementsTo: [TripSettlement]?

    // Sync metadata
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        name: String,
        email: String? = nil,
        phone: String? = nil,
        isCurrentUser: Bool = false,
        colorHex: String? = nil,
        trip: Trip? = nil,
        createdAt: Date = .now,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.name = name
        self.email = email
        self.phone = phone
        self.isCurrentUser = isCurrentUser
        self.colorHex = colorHex
        self.trip = trip
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

// MARK: - Predefined Colors for Participants

extension TripParticipant {
    static let participantColors: [String] = [
        "FF6B6B", // Red
        "4ECDC4", // Teal
        "45B7D1", // Blue
        "96CEB4", // Green
        "FFEAA7", // Yellow
        "DDA0DD", // Plum
        "98D8C8", // Mint
        "F7DC6F", // Gold
        "BB8FCE", // Purple
        "85C1E9", // Light Blue
    ]

    static func nextColor(for existingParticipants: [TripParticipant]) -> String {
        let usedColors = Set(existingParticipants.compactMap { $0.colorHex })
        return participantColors.first { !usedColors.contains($0) } ?? participantColors.randomElement() ?? "FF6B6B"
    }
}
