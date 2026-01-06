//
//  TripSummaryCalculator.swift
//  BudgetThing
//

import Foundation

// MARK: - Data Structures

struct TripSummary {
    let totalSpent: Decimal
    let spentByCategory: [(category: Category?, amount: Decimal)]
    let dailyAverage: Decimal
    let daysCount: Int
    let budgetRemaining: Decimal?
    let budgetPercentUsed: Double?
    let expenseCount: Int
    let participantCount: Int
    let highestExpense: (transaction: Transaction, amount: Decimal)?
    let mostExpensiveDay: (date: Date, amount: Decimal)?
}

struct CategorySpending: Identifiable {
    let id: UUID
    let category: Category?
    let amount: Decimal
    let percentage: Double
    let transactionCount: Int

    var displayName: String {
        category?.name ?? "Uncategorized"
    }

    var emoji: String {
        category?.emoji ?? "📝"
    }
}

// MARK: - Summary Calculator

enum TripSummaryCalculator {

    /// Calculate comprehensive summary for a trip
    static func calculate(trip: Trip) -> TripSummary {
        let expenses = trip.expenses ?? []
        let transactions = expenses.compactMap { $0.transaction }
        let participants = trip.participants ?? []

        // Total spent
        let total = transactions.reduce(Decimal(0)) { $0 + $1.amount }

        // Group by category
        let byCategory = calculateCategorySpending(transactions: transactions)

        // Days calculation
        let (daysCount, dailyAvg) = calculateDailyStats(
            trip: trip,
            transactions: transactions,
            total: total
        )

        // Budget calculations
        let budgetRemaining = trip.budget.map { $0 - total }
        let budgetPercent: Double? = trip.budget.flatMap { budget in
            guard budget > 0 else { return nil }
            return Double(truncating: (total / budget * 100) as NSDecimalNumber)
        }

        // Highest expense
        let highestExpense = transactions.max(by: { $0.amount < $1.amount })
            .map { ($0, $0.amount) }

        // Most expensive day
        let mostExpensiveDay = calculateMostExpensiveDay(transactions: transactions)

        return TripSummary(
            totalSpent: total,
            spentByCategory: byCategory,
            dailyAverage: dailyAvg,
            daysCount: daysCount,
            budgetRemaining: budgetRemaining,
            budgetPercentUsed: budgetPercent,
            expenseCount: transactions.count,
            participantCount: participants.count,
            highestExpense: highestExpense,
            mostExpensiveDay: mostExpensiveDay
        )
    }

    /// Calculate spending breakdown by category
    static func categorySpending(trip: Trip) -> [CategorySpending] {
        let expenses = trip.expenses ?? []
        let transactions = expenses.compactMap { $0.transaction }
        let total = transactions.reduce(Decimal(0)) { $0 + $1.amount }

        guard total > 0 else { return [] }

        // Group by category
        var categoryTotals: [UUID?: (category: Category?, amount: Decimal, count: Int)] = [:]

        for tx in transactions {
            let catId = tx.category?.id
            let existing = categoryTotals[catId]
            categoryTotals[catId] = (
                category: tx.category ?? existing?.category,
                amount: (existing?.amount ?? 0) + tx.amount,
                count: (existing?.count ?? 0) + 1
            )
        }

        return categoryTotals.map { _, value in
            let percentage = Double(truncating: (value.amount / total * 100) as NSDecimalNumber)
            return CategorySpending(
                id: value.category?.id ?? UUID(),
                category: value.category,
                amount: value.amount,
                percentage: percentage,
                transactionCount: value.count
            )
        }.sorted { $0.amount > $1.amount }
    }

    /// Calculate spending by participant (what each person spent for the group)
    static func participantSpending(trip: Trip) -> [(participant: TripParticipant, amount: Decimal)] {
        let expenses = trip.expenses ?? []
        var spending: [UUID: (participant: TripParticipant, amount: Decimal)] = [:]

        for expense in expenses {
            guard let participant = expense.paidByParticipant,
                  let transaction = expense.transaction else { continue }

            let existing = spending[participant.id]
            spending[participant.id] = (
                participant: participant,
                amount: (existing?.amount ?? 0) + transaction.amount
            )
        }

        return spending.values.sorted { $0.amount > $1.amount }
    }

    /// Calculate daily spending breakdown
    static func dailySpending(trip: Trip) -> [(date: Date, amount: Decimal)] {
        let expenses = trip.expenses ?? []
        let transactions = expenses.compactMap { $0.transaction }

        let calendar = Calendar.current
        var dailyTotals: [DateComponents: Decimal] = [:]

        for tx in transactions {
            let components = calendar.dateComponents([.year, .month, .day], from: tx.date)
            dailyTotals[components, default: 0] += tx.amount
        }

        return dailyTotals.compactMap { components, amount in
            guard let date = calendar.date(from: components) else { return nil }
            return (date, amount)
        }.sorted { $0.date < $1.date }
    }

    // MARK: - Private Helpers

    private static func calculateCategorySpending(
        transactions: [Transaction]
    ) -> [(category: Category?, amount: Decimal)] {
        var categoryTotals: [UUID?: Decimal] = [:]
        var categoryLookup: [UUID?: Category?] = [:]

        for tx in transactions {
            let catId = tx.category?.id
            categoryTotals[catId, default: 0] += tx.amount
            if categoryLookup[catId] == nil {
                categoryLookup[catId] = tx.category
            }
        }

        return categoryTotals.map { catId, amount in
            (categoryLookup[catId] ?? nil, amount)
        }.sorted { $0.amount > $1.amount }
    }

    private static func calculateDailyStats(
        trip: Trip,
        transactions: [Transaction],
        total: Decimal
    ) -> (daysCount: Int, dailyAverage: Decimal) {
        let calendar = Calendar.current

        // Determine date range
        let transactionDates = transactions.map { $0.date }
        let minDate = transactionDates.min() ?? trip.startDate ?? Date()
        let maxDate = transactionDates.max() ?? trip.endDate ?? Date()

        // If trip has explicit dates, use those
        let startDate = trip.startDate ?? minDate
        let endDate = trip.endDate ?? maxDate

        let days = max(1, (calendar.dateComponents([.day], from: startDate, to: endDate).day ?? 0) + 1)
        let dailyAvg = total / Decimal(days)

        return (days, dailyAvg)
    }

    private static func calculateMostExpensiveDay(
        transactions: [Transaction]
    ) -> (date: Date, amount: Decimal)? {
        let calendar = Calendar.current
        var dailyTotals: [DateComponents: Decimal] = [:]

        for tx in transactions {
            let components = calendar.dateComponents([.year, .month, .day], from: tx.date)
            dailyTotals[components, default: 0] += tx.amount
        }

        guard let maxEntry = dailyTotals.max(by: { $0.value < $1.value }),
              let date = calendar.date(from: maxEntry.key) else {
            return nil
        }

        return (date, maxEntry.value)
    }
}
