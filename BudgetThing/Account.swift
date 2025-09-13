import Foundation
import SwiftData

@Model
final class Account {
    enum Kind: String, Codable, CaseIterable { case cash, bank, credit }

    @Attribute(.unique) var id: UUID
    var name: String
    var emoji: String
    var kind: String // stored as rawValue of Kind for schema stability
    var openingBalance: Decimal?
    var limitAmount: Decimal?
    var createdAt: Date
    var updatedAt: Date

    init(id: UUID = UUID(), name: String, emoji: String, kind: Kind, openingBalance: Decimal? = nil, limitAmount: Decimal? = nil, createdAt: Date = .now, updatedAt: Date = .now) {
        self.id = id
        self.name = name
        self.emoji = emoji
        self.kind = kind.rawValue
        self.openingBalance = openingBalance
        self.limitAmount = limitAmount
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    var kindEnum: Kind { Kind(rawValue: kind) ?? .cash }
}


