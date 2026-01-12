//
//  TripSummaryCalculatorTests.swift
//  BudgetThingTests
//

import Testing
import Foundation
import SwiftData
@testable import BudgetThing

@Suite("TripSummaryCalculator Tests")
struct TripSummaryCalculatorTests {
    
    // MARK: - Test Helpers
    
    @MainActor
    func makeTestContainer() throws -> ModelContainer {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        return try ModelContainer(
            for: Trip.self, TripParticipant.self, TripExpense.self, TripSettlement.self, Transaction.self, Category.self, Account.self,
            configurations: config
        )
    }
    
    @MainActor
    func createTrip(
        context: ModelContext,
        name: String = "Test Trip",
        startDate: Date? = nil,
        endDate: Date? = nil,
        budget: Decimal? = nil
    ) -> Trip {
        let trip = Trip(
            name: name,
            startDate: startDate,
            endDate: endDate,
            budget: budget
        )
        context.insert(trip)
        return trip
    }
    
    @MainActor
    func createParticipant(context: ModelContext, name: String, trip: Trip, isCurrentUser: Bool = false) -> TripParticipant {
        let participant = TripParticipant(name: name, isCurrentUser: isCurrentUser, trip: trip)
        context.insert(participant)
        return participant
    }
    
    @MainActor
    func createExpense(
        context: ModelContext,
        trip: Trip,
        amount: Decimal,
        payer: TripParticipant,
        category: BudgetThing.Category? = nil,
        date: Date = Date()
    ) -> TripExpense {
        let transaction = Transaction(amount: amount, date: date, note: "Test", category: category)
        context.insert(transaction)
        
        let expense = TripExpense(trip: trip, transaction: transaction, paidByParticipant: payer)
        context.insert(expense)
        
        // Add to trip's expenses
        if trip.expenses == nil {
            trip.expenses = []
        }
        trip.expenses?.append(expense)
        
        return expense
    }
    
    // MARK: - Total Spent Tests
    
    @Test("Calculate total spent - single expense")
    @MainActor
    func calculate_TotalSpent_SingleExpense() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = createTrip(context: context)
        let alice = createParticipant(context: context, name: "Alice", trip: trip, isCurrentUser: true)
        
        _ = createExpense(context: context, trip: trip, amount: Decimal(100), payer: alice)
        
        let summary = TripSummaryCalculator.calculate(trip: trip)
        
        #expect(summary.totalSpent == Decimal(100))
        #expect(summary.expenseCount == 1)
    }
    
    @Test("Calculate total spent - multiple expenses")
    @MainActor
    func calculate_TotalSpent_MultipleExpenses() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = createTrip(context: context)
        let alice = createParticipant(context: context, name: "Alice", trip: trip)
        let bob = createParticipant(context: context, name: "Bob", trip: trip)
        
        _ = createExpense(context: context, trip: trip, amount: Decimal(100), payer: alice)
        _ = createExpense(context: context, trip: trip, amount: Decimal(50), payer: bob)
        _ = createExpense(context: context, trip: trip, amount: Decimal(25), payer: alice)
        
        let summary = TripSummaryCalculator.calculate(trip: trip)
        
        #expect(summary.totalSpent == Decimal(175))
        #expect(summary.expenseCount == 3)
    }
    
    @Test("Calculate total spent - empty trip")
    @MainActor
    func calculate_TotalSpent_Empty() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = createTrip(context: context)
        
        let summary = TripSummaryCalculator.calculate(trip: trip)
        
        #expect(summary.totalSpent == Decimal(0))
        #expect(summary.expenseCount == 0)
    }
    
    // MARK: - Budget Tests
    
    @Test("Budget remaining calculated correctly")
    @MainActor
    func calculate_BudgetRemaining() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = createTrip(context: context, budget: Decimal(500))
        let alice = createParticipant(context: context, name: "Alice", trip: trip)
        
        _ = createExpense(context: context, trip: trip, amount: Decimal(150), payer: alice)
        
        let summary = TripSummaryCalculator.calculate(trip: trip)
        
        #expect(summary.budgetRemaining == Decimal(350))
    }
    
    @Test("Budget percent used calculated correctly")
    @MainActor
    func calculate_BudgetPercentUsed() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = createTrip(context: context, budget: Decimal(200))
        let alice = createParticipant(context: context, name: "Alice", trip: trip)
        
        _ = createExpense(context: context, trip: trip, amount: Decimal(100), payer: alice)
        
        let summary = TripSummaryCalculator.calculate(trip: trip)
        
        #expect(summary.budgetPercentUsed == 50.0)
    }
    
    @Test("Budget over 100% when overspent")
    @MainActor
    func calculate_BudgetOverspent() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = createTrip(context: context, budget: Decimal(100))
        let alice = createParticipant(context: context, name: "Alice", trip: trip)
        
        _ = createExpense(context: context, trip: trip, amount: Decimal(150), payer: alice)
        
        let summary = TripSummaryCalculator.calculate(trip: trip)
        
        #expect(summary.budgetRemaining == Decimal(-50))
        #expect(summary.budgetPercentUsed == 150.0)
    }
    
    @Test("No budget returns nil")
    @MainActor
    func calculate_NoBudget() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = createTrip(context: context, budget: nil)
        let alice = createParticipant(context: context, name: "Alice", trip: trip)
        
        _ = createExpense(context: context, trip: trip, amount: Decimal(100), payer: alice)
        
        let summary = TripSummaryCalculator.calculate(trip: trip)
        
        #expect(summary.budgetRemaining == nil)
        #expect(summary.budgetPercentUsed == nil)
    }
    
    // MARK: - Daily Average Tests
    
    @Test("Daily average with trip dates")
    @MainActor
    func calculate_DailyAverage_WithDates() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let calendar = Calendar.current
        let startDate = calendar.date(byAdding: .day, value: -4, to: Date())!
        let endDate = Date()
        
        let trip = createTrip(context: context, startDate: startDate, endDate: endDate)
        let alice = createParticipant(context: context, name: "Alice", trip: trip)
        
        // 5 days total (inclusive), $100 spent
        _ = createExpense(context: context, trip: trip, amount: Decimal(100), payer: alice)
        
        let summary = TripSummaryCalculator.calculate(trip: trip)
        
        #expect(summary.daysCount == 5)
        #expect(summary.dailyAverage == Decimal(20))
    }
    
    @Test("Days count is at least 1")
    @MainActor
    func calculate_DaysCount_MinOne() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        // Same start and end date
        let today = Date()
        let trip = createTrip(context: context, startDate: today, endDate: today)
        let alice = createParticipant(context: context, name: "Alice", trip: trip)
        
        _ = createExpense(context: context, trip: trip, amount: Decimal(100), payer: alice)
        
        let summary = TripSummaryCalculator.calculate(trip: trip)
        
        #expect(summary.daysCount >= 1)
    }
    
    // MARK: - Participant Count Tests
    
    @Test("Participant count")
    @MainActor
    func calculate_ParticipantCount() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = createTrip(context: context)
        _ = createParticipant(context: context, name: "Alice", trip: trip)
        _ = createParticipant(context: context, name: "Bob", trip: trip)
        _ = createParticipant(context: context, name: "Charlie", trip: trip)
        
        let summary = TripSummaryCalculator.calculate(trip: trip)
        
        #expect(summary.participantCount == 3)
    }
    
    // MARK: - Highest Expense Tests
    
    @Test("Highest expense identified")
    @MainActor
    func calculate_HighestExpense() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = createTrip(context: context)
        let alice = createParticipant(context: context, name: "Alice", trip: trip)
        
        _ = createExpense(context: context, trip: trip, amount: Decimal(50), payer: alice)
        _ = createExpense(context: context, trip: trip, amount: Decimal(200), payer: alice)
        _ = createExpense(context: context, trip: trip, amount: Decimal(75), payer: alice)
        
        let summary = TripSummaryCalculator.calculate(trip: trip)
        
        #expect(summary.highestExpense?.amount == Decimal(200))
    }
    
    @Test("Highest expense nil for empty trip")
    @MainActor
    func calculate_HighestExpense_Empty() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = createTrip(context: context)
        
        let summary = TripSummaryCalculator.calculate(trip: trip)
        
        #expect(summary.highestExpense == nil)
    }
    
    // MARK: - Category Spending Tests
    
    @Test("Category spending breakdown")
    @MainActor
    func categorySpending_Breakdown() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = createTrip(context: context)
        let alice = createParticipant(context: context, name: "Alice", trip: trip)
        
        let foodCategory = BudgetThing.Category(name: "Food", emoji: "🍕")
        let transportCategory = BudgetThing.Category(name: "Transport", emoji: "🚗")
        context.insert(foodCategory)
        context.insert(transportCategory)
        
        _ = createExpense(context: context, trip: trip, amount: Decimal(100), payer: alice, category: foodCategory)
        _ = createExpense(context: context, trip: trip, amount: Decimal(50), payer: alice, category: foodCategory)
        _ = createExpense(context: context, trip: trip, amount: Decimal(50), payer: alice, category: transportCategory)
        
        let spending = TripSummaryCalculator.categorySpending(trip: trip)
        
        // Food should be $150 (75%), Transport $50 (25%)
        #expect(spending.count == 2)
        
        let foodSpending = spending.first { $0.category?.name == "Food" }
        #expect(foodSpending?.amount == Decimal(150))
        #expect(foodSpending?.transactionCount == 2)
        
        let transportSpending = spending.first { $0.category?.name == "Transport" }
        #expect(transportSpending?.amount == Decimal(50))
        #expect(transportSpending?.transactionCount == 1)
    }
    
    @Test("Category spending sorted by amount descending")
    @MainActor
    func categorySpending_Sorted() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = createTrip(context: context)
        let alice = createParticipant(context: context, name: "Alice", trip: trip)
        
        let cat1 = BudgetThing.Category(name: "Small", emoji: "📌")
        let cat2 = BudgetThing.Category(name: "Large", emoji: "📦")
        context.insert(cat1)
        context.insert(cat2)
        
        _ = createExpense(context: context, trip: trip, amount: Decimal(10), payer: alice, category: cat1)
        _ = createExpense(context: context, trip: trip, amount: Decimal(100), payer: alice, category: cat2)
        
        let spending = TripSummaryCalculator.categorySpending(trip: trip)
        
        // Larger amount should come first
        #expect(spending.first?.category?.name == "Large")
    }
    
    @Test("Category spending empty trip returns empty")
    @MainActor
    func categorySpending_Empty() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = createTrip(context: context)
        
        let spending = TripSummaryCalculator.categorySpending(trip: trip)
        
        #expect(spending.isEmpty)
    }
    
    // MARK: - Participant Spending Tests
    
    @Test("Participant spending breakdown")
    @MainActor
    func participantSpending_Breakdown() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = createTrip(context: context)
        let alice = createParticipant(context: context, name: "Alice", trip: trip)
        let bob = createParticipant(context: context, name: "Bob", trip: trip)
        
        _ = createExpense(context: context, trip: trip, amount: Decimal(100), payer: alice)
        _ = createExpense(context: context, trip: trip, amount: Decimal(50), payer: alice)
        _ = createExpense(context: context, trip: trip, amount: Decimal(75), payer: bob)
        
        let spending = TripSummaryCalculator.participantSpending(trip: trip)
        
        #expect(spending.count == 2)
        
        // Alice paid $150, Bob paid $75
        #expect(spending.first?.participant.name == "Alice")
        #expect(spending.first?.amount == Decimal(150))
        
        #expect(spending.last?.participant.name == "Bob")
        #expect(spending.last?.amount == Decimal(75))
    }
    
    // MARK: - Daily Spending Tests
    
    @Test("Daily spending breakdown")
    @MainActor
    func dailySpending_Breakdown() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = createTrip(context: context)
        let alice = createParticipant(context: context, name: "Alice", trip: trip)
        
        let calendar = Calendar.current
        let today = Date()
        let yesterday = calendar.date(byAdding: .day, value: -1, to: today)!
        
        _ = createExpense(context: context, trip: trip, amount: Decimal(100), payer: alice, date: today)
        _ = createExpense(context: context, trip: trip, amount: Decimal(50), payer: alice, date: today)
        _ = createExpense(context: context, trip: trip, amount: Decimal(75), payer: alice, date: yesterday)
        
        let spending = TripSummaryCalculator.dailySpending(trip: trip)
        
        #expect(spending.count == 2)
        
        // Yesterday should come first (sorted by date ascending)
        #expect(spending.first?.amount == Decimal(75))
        #expect(spending.last?.amount == Decimal(150))
    }
    
    @Test("Daily spending sorted by date ascending")
    @MainActor
    func dailySpending_Sorted() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = createTrip(context: context)
        let alice = createParticipant(context: context, name: "Alice", trip: trip)
        
        let calendar = Calendar.current
        let day1 = calendar.date(byAdding: .day, value: -3, to: Date())!
        let day2 = calendar.date(byAdding: .day, value: -1, to: Date())!
        
        _ = createExpense(context: context, trip: trip, amount: Decimal(50), payer: alice, date: day2)
        _ = createExpense(context: context, trip: trip, amount: Decimal(100), payer: alice, date: day1)
        
        let spending = TripSummaryCalculator.dailySpending(trip: trip)
        
        // Earlier date should come first
        if let firstDate = spending.first?.date, let lastDate = spending.last?.date {
            #expect(firstDate < lastDate)
        }
    }
    
    // MARK: - Most Expensive Day Tests
    
    @Test("Most expensive day identified")
    @MainActor
    func calculate_MostExpensiveDay() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = createTrip(context: context)
        let alice = createParticipant(context: context, name: "Alice", trip: trip)
        
        let calendar = Calendar.current
        let today = Date()
        let yesterday = calendar.date(byAdding: .day, value: -1, to: today)!
        
        // Yesterday: $75
        _ = createExpense(context: context, trip: trip, amount: Decimal(75), payer: alice, date: yesterday)
        
        // Today: $100 + $50 = $150
        _ = createExpense(context: context, trip: trip, amount: Decimal(100), payer: alice, date: today)
        _ = createExpense(context: context, trip: trip, amount: Decimal(50), payer: alice, date: today)
        
        let summary = TripSummaryCalculator.calculate(trip: trip)
        
        #expect(summary.mostExpensiveDay?.amount == Decimal(150))
    }
    
    // MARK: - CategorySpending Properties Tests
    
    @Test("CategorySpending displayName for uncategorized")
    @MainActor
    func categorySpending_DisplayName() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = createTrip(context: context)
        let alice = createParticipant(context: context, name: "Alice", trip: trip)
        
        // Expense without category
        _ = createExpense(context: context, trip: trip, amount: Decimal(100), payer: alice, category: nil)
        
        let spending = TripSummaryCalculator.categorySpending(trip: trip)
        
        #expect(spending.first?.displayName == "Uncategorized")
        #expect(spending.first?.emoji == "📝")
    }
    
    // MARK: - Edge Cases
    
    @Test("Large number of expenses")
    @MainActor
    func largeNumberOfExpenses() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = createTrip(context: context)
        let alice = createParticipant(context: context, name: "Alice", trip: trip)
        
        // Create 100 expenses
        for i in 0..<100 {
            _ = createExpense(context: context, trip: trip, amount: Decimal(i + 1), payer: alice)
        }
        
        let summary = TripSummaryCalculator.calculate(trip: trip)
        
        // Sum of 1 to 100 = 5050
        #expect(summary.totalSpent == Decimal(5050))
        #expect(summary.expenseCount == 100)
        #expect(summary.highestExpense?.amount == Decimal(100))
    }
    
    @Test("Decimal precision maintained")
    @MainActor
    func decimalPrecision() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = createTrip(context: context)
        let alice = createParticipant(context: context, name: "Alice", trip: trip)
        
        _ = createExpense(context: context, trip: trip, amount: Decimal(string: "33.33")!, payer: alice)
        _ = createExpense(context: context, trip: trip, amount: Decimal(string: "33.33")!, payer: alice)
        _ = createExpense(context: context, trip: trip, amount: Decimal(string: "33.34")!, payer: alice)
        
        let summary = TripSummaryCalculator.calculate(trip: trip)
        
        #expect(summary.totalSpent == Decimal(100))
    }
}
