import Foundation

struct CategorySnapshot: Codable, Hashable, Identifiable {
    let id: UUID
    let name: String
    let emoji: String
}

struct TransactionSnapshot: Codable, Hashable, Identifiable {
    let id: UUID
    let amount: Decimal
    let date: Date
    let type: String // "expense" or "income"
    let categoryEmoji: String?
}

struct AccountSpendSnapshot: Codable, Hashable, Identifiable {
    let id: UUID
    let name: String
    let emoji: String
    let monthSpent: Decimal
}

enum WidgetCurrency {
    static let codeToSymbol: [String: String] = [
        "USD": "$", "EUR": "€", "GBP": "£", "INR": "₹", "JPY": "¥", "CNY": "¥",
        "CAD": "$", "AUD": "$", "NZD": "$", "CHF": "CHF", "SEK": "kr", "NOK": "kr", "DKK": "kr",
        "SGD": "$", "HKD": "$", "AED": "د.إ"
    ]
    static func symbol(for code: String) -> String { codeToSymbol[code, default: "$"] }
}

enum WidgetShared {
    static let appGroupId: String = "group.com.Vansh.BudgetThing"
    enum Keys {
        static let categories = "widget.categories"
        static let latestTransactions = "widget.latest5"
        static let accountSpends = "widget.accountSpends"
        static let currencyCode = "widget.currencyCode"
    }
}


