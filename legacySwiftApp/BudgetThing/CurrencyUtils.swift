//
//  CurrencyUtils.swift
//  BudgetThing
//

import Foundation

enum CurrencyUtils {
    static let popular: [(code: String, name: String)] = [
        ("USD","US Dollar"), ("EUR","Euro"), ("GBP","British Pound"), ("INR","Indian Rupee"),
        ("JPY","Japanese Yen"), ("CNY","Chinese Yuan"), ("CAD","Canadian Dollar"), ("AUD","Australian Dollar"),
        ("NZD","New Zealand Dollar"), ("CHF","Swiss Franc"), ("SEK","Swedish Krona"), ("NOK","Norwegian Krone"),
        ("DKK","Danish Krone"), ("SGD","Singapore Dollar"), ("HKD","Hong Kong Dollar"), ("AED","UAE Dirham")
    ]

    // Minimal symbol mapping to avoid Locale edge cases
    static let codeToSymbol: [String: String] = [
        "USD": "$", "EUR": "€", "GBP": "£", "INR": "₹", "JPY": "¥", "CNY": "¥",
        "CAD": "$", "AUD": "$", "NZD": "$", "CHF": "CHF", "SEK": "kr", "NOK": "kr", "DKK": "kr",
        "SGD": "$", "HKD": "$", "AED": "د.إ"
    ]

    static func symbol(for code: String) -> String {
        codeToSymbol[code, default: "$"]
    }
}




