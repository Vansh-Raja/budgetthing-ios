import Foundation
import SwiftData

@Model
final class Account {
    enum Kind: String, Codable, CaseIterable { case cash, bank, credit }

    @Attribute(.unique) var id: UUID
    var name: String
    var emoji: String
    var sortIndex: Int?
    var kind: String // stored as rawValue of Kind for schema stability
    var openingBalance: Decimal?
    var limitAmount: Decimal?
    var billingCycleDay: Int? // 1-28 for credit card cycle start
    var createdAt: Date
    var updatedAt: Date

    init(id: UUID = UUID(), name: String, emoji: String, kind: Kind, sortIndex: Int? = nil, openingBalance: Decimal? = nil, limitAmount: Decimal? = nil, billingCycleDay: Int? = nil, createdAt: Date = .now, updatedAt: Date = .now) {
        self.id = id
        self.name = name
        self.emoji = emoji
        self.kind = kind.rawValue
        self.sortIndex = sortIndex
        self.openingBalance = openingBalance
        self.limitAmount = limitAmount
        self.billingCycleDay = billingCycleDay
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    var kindEnum: Kind { Kind(rawValue: kind) ?? .cash }
}


