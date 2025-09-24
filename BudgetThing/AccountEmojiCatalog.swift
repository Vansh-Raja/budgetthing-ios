import Foundation

enum AccountEmojiCatalog {
    static let cash: [String] = [
        "💵","🪙","👛","👜","🎒","🧾","💴","💶","💷","🧰"
    ]

    static let bankAccount: [String] = [
        "🏦","🏛️","💱","📈","📉","🔐","🏧","🪪","📊","🗂️"
    ]

    static let cardCreditDebit: [String] = [
        "💳","🔒","✅","🔁","💸","🏷️","✨","📝","📇","📬"
    ]

    static func list(for kind: Account.Kind) -> [String] {
        switch kind {
        case .cash: return cash
        case .bank: return bankAccount
        case .credit: return cardCreditDebit
        }
    }
}


