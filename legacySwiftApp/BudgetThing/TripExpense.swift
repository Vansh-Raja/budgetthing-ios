//
//  TripExpense.swift
//  BudgetThing
//

import Foundation
import SwiftData

@Model
final class TripExpense {
    @Attribute(.unique) var id: UUID

    // Relationships
    var trip: Trip?

    @Relationship(deleteRule: .nullify, inverse: \Transaction.tripExpense)
    var transaction: Transaction?

    var paidByParticipant: TripParticipant?

    // Split configuration
    var splitTypeRaw: String
    var splitDataJSON: Data?
    var computedSplitsJSON: Data?

    // Sync metadata
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        trip: Trip? = nil,
        transaction: Transaction? = nil,
        paidByParticipant: TripParticipant? = nil,
        splitType: SplitType = .equal,
        splitData: [UUID: Decimal]? = nil,
        createdAt: Date = .now,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.trip = trip
        self.transaction = transaction
        self.paidByParticipant = paidByParticipant
        self.splitTypeRaw = splitType.rawValue
        self.splitDataJSON = splitData.flatMap { try? JSONEncoder().encode($0) }
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

// MARK: - Split Type Enum

extension TripExpense {
    enum SplitType: String, Codable, CaseIterable, Identifiable {
        case equal          // Split among all participants equally
        case equalSelected  // Split among selected participants equally
        case exact          // Exact amounts per participant
        case percentage     // Custom percentages per participant
        case shares         // Shares-based (e.g., 2:1:1)

        var id: String { rawValue }

        var displayName: String {
            switch self {
            case .equal: return "Equal"
            case .equalSelected: return "Equal (Selected)"
            case .exact: return "Exact Amounts"
            case .percentage: return "By Percentage"
            case .shares: return "By Shares"
            }
        }

        var description: String {
            switch self {
            case .equal: return "Split equally among everyone"
            case .equalSelected: return "Split equally among selected people"
            case .exact: return "Enter exact amounts per person"
            case .percentage: return "Assign custom percentages"
            case .shares: return "Assign shares (e.g., 2:1:1)"
            }
        }
    }

    var splitType: SplitType {
        get { SplitType(rawValue: splitTypeRaw) ?? .equal }
        set { splitTypeRaw = newValue.rawValue }
    }

    var splitData: [UUID: Decimal]? {
        get {
            guard let data = splitDataJSON else { return nil }
            return try? JSONDecoder().decode([UUID: Decimal].self, from: data)
        }
        set {
            splitDataJSON = newValue.flatMap { try? JSONEncoder().encode($0) }
        }
    }

    var computedSplits: [UUID: Decimal]? {
        get {
            guard let data = computedSplitsJSON else { return nil }
            return try? JSONDecoder().decode([UUID: Decimal].self, from: data)
        }
        set {
            computedSplitsJSON = newValue.flatMap { try? JSONEncoder().encode($0) }
        }
    }
}
