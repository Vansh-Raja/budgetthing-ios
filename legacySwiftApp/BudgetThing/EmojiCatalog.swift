import Foundation
import SwiftUI

struct EmojiGroup: Identifiable, Hashable {
    let id: String
    let name: String
    let description: String?
    let items: [EmojiItem]
}

struct EmojiItem: Identifiable, Hashable {
    var id: String { emoji }
    let emoji: String
    let label: String
}

enum EmojiCatalog {
    static let topEmojis: [EmojiItem] = [
        .init(emoji: "🛒", label: "Groceries / Supermarket"),
        .init(emoji: "🍽️", label: "Dining / Restaurant"),
        .init(emoji: "🚗", label: "Transport / Ride"),
        .init(emoji: "💼", label: "Salary / Income / Work"),
        .init(emoji: "🏠", label: "Rent / Mortgage / Housing"),
        .init(emoji: "💳", label: "Card / Payments / Fees"),
        .init(emoji: "💵", label: "Cash / ATM"),
        .init(emoji: "📈", label: "Investments / Earnings"),
        .init(emoji: "🧾", label: "Bills / Receipts / Invoices"),
        .init(emoji: "🛠️", label: "Repairs / Maintenance"),
        .init(emoji: "🎁", label: "Gifts / Cashback / Rewards"),
        .init(emoji: "🏨", label: "Travel / Accommodation"),
    ]
    static let groups: [EmojiGroup] = [
        EmojiGroup(
            id: "income_money",
            name: "Income & Money",
            description: "Salary, bonuses, refunds and other incoming funds.",
            items: [
                .init(emoji: "💼", label: "Salary / Paycheck"),
                .init(emoji: "💸", label: "Income (general)"),
                .init(emoji: "🪙", label: "Coins / Cash"),
                .init(emoji: "🎁", label: "Cashback / Rewards"),
                .init(emoji: "🔁", label: "Refund / Reimbursement"),
            ]
        ),
        EmojiGroup(
            id: "banking_cash",
            name: "Banking & Cash",
            description: "Bank accounts, transfers, ATM, fees and interest.",
            items: [
                .init(emoji: "🏦", label: "Bank / Account"),
                .init(emoji: "🏧", label: "ATM / Cash withdrawal"),
                .init(emoji: "💵", label: "Cash"),
                .init(emoji: "🔁", label: "Transfer / Wire"),
                .init(emoji: "📈", label: "Interest / Earnings"),
                .init(emoji: "💳", label: "Fees / Card charge"),
            ]
        ),
        EmojiGroup(
            id: "shopping_retail",
            name: "Shopping & Retail",
            description: "In-store and online shopping, marketplaces and luxury purchases.",
            items: [
                .init(emoji: "🛍️", label: "Shopping / Retail"),
                .init(emoji: "🛒", label: "Groceries / Supermarket"),
                .init(emoji: "📦", label: "Online shopping / Delivery"),
                .init(emoji: "🏷️", label: "Sales / Marketplace"),
                .init(emoji: "👗", label: "Fashion / Designer"),
                .init(emoji: "♻️", label: "Thrift / Secondhand"),
            ]
        ),
        EmojiGroup(
            id: "food_drink",
            name: "Food & Drink",
            description: "Groceries, dining out, coffee, alcohol and snacks.",
            items: [
                .init(emoji: "🛒", label: "Groceries"),
                .init(emoji: "🍽️", label: "Dining / Restaurant"),
                .init(emoji: "☕", label: "Coffee / Cafe"),
                .init(emoji: "🍔", label: "Fast food / Takeout"),
                .init(emoji: "🍺", label: "Alcohol / Bar"),
                .init(emoji: "🍪", label: "Snacks / Sweets"),
            ]
        ),
        EmojiGroup(
            id: "transport_travel",
            name: "Transport & Travel",
            description: "Fuel, public transport, taxis, flights, hotels and travel expenses.",
            items: [
                .init(emoji: "⛽", label: "Fuel / Gas"),
                .init(emoji: "⚡", label: "EV charging / Electric"),
                .init(emoji: "🚕", label: "Taxi / Ride-share"),
                .init(emoji: "🚌", label: "Public transport"),
                .init(emoji: "🚲", label: "Bicycle"),
                .init(emoji: "🅿️", label: "Parking & Tolls"),
                .init(emoji: "✈️", label: "Flights / Airfare"),
                .init(emoji: "🏨", label: "Hotels / Accommodation"),
                .init(emoji: "🧳", label: "Travel / Tourism"),
                .init(emoji: "🚘", label: "Car payment / Lease"),
            ]
        ),
        EmojiGroup(
            id: "housing_utilities",
            name: "Housing & Utilities",
            description: "Rent, mortgage, repairs, furniture and household utilities.",
            items: [
                .init(emoji: "🏠", label: "Rent / Mortgage"),
                .init(emoji: "🛠️", label: "Repairs / Maintenance"),
                .init(emoji: "🛋️", label: "Furniture / Home goods"),
                .init(emoji: "💡", label: "Electricity"),
                .init(emoji: "🚰", label: "Water"),
                .init(emoji: "🔥", label: "Gas"),
                .init(emoji: "🗑️", label: "Waste / Recycling"),
            ]
        ),
        EmojiGroup(
            id: "bills_subscriptions",
            name: "Bills & Subscriptions",
            description: "Utilities, recurring subscriptions and memberships.",
            items: [
                .init(emoji: "🧾", label: "Bills (general)"),
                .init(emoji: "📱", label: "Mobile / Phone"),
                .init(emoji: "🌐", label: "Internet / Wi-Fi"),
                .init(emoji: "📺", label: "Cable / Streaming TV"),
                .init(emoji: "🎧", label: "Music streaming"),
                .init(emoji: "🏋️‍♂️", label: "Gym / Fitness membership"),
                .init(emoji: "🔁", label: "Subscriptions (general)"),
            ]
        ),
        EmojiGroup(
            id: "health_wellness",
            name: "Health & Wellness",
            description: "Medical, dental, pharmacy, therapy and fitness expenses.",
            items: [
                .init(emoji: "💊", label: "Pharmacy / Medicine"),
                .init(emoji: "🩺", label: "Doctor / Clinic"),
                .init(emoji: "🦷", label: "Dentist"),
                .init(emoji: "👓", label: "Eye care"),
                .init(emoji: "🧠", label: "Therapy / Mental health"),
                .init(emoji: "🏃‍♀️", label: "Fitness / Classes"),
            ]
        ),
        EmojiGroup(
            id: "entertainment_leisure",
            name: "Entertainment & Leisure",
            description: "Movies, concerts, gaming and hobbies.",
            items: [
                .init(emoji: "🎬", label: "Movies / Theater"),
                .init(emoji: "🎵", label: "Music / Concerts"),
                .init(emoji: "🎮", label: "Games / Gaming"),
                .init(emoji: "🎨", label: "Hobbies / Crafts"),
                .init(emoji: "⚽", label: "Sports / Events"),
            ]
        ),
        EmojiGroup(
            id: "fees_tips_misc",
            name: "Fees, Tips & Misc.",
            description: "Tips, service charges and uncategorized spending.",
            items: [
                .init(emoji: "💸", label: "Tips / Gratuity"),
                .init(emoji: "💳", label: "Service charge"),
                .init(emoji: "❓", label: "Miscellaneous / Other"),
            ]
        ),
    ]
}


