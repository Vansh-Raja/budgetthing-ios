//
//  Item.swift
//  BudgetThing
//
//  Created by Vansh Raja on 01/09/25.
//

import Foundation
import SwiftData

@Model
final class Item {
    var timestamp: Date
    var amount: Decimal?
    var note: String?
    var categoryEmoji: String?
    
    init(timestamp: Date, amount: Decimal? = nil, note: String? = nil, categoryEmoji: String? = nil) {
        self.timestamp = timestamp
        self.amount = amount
        self.note = note
        self.categoryEmoji = categoryEmoji
    }
}
