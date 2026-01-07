//
//  TripModelTests.swift
//  BudgetThingTests
//

import Testing
import Foundation
import SwiftData
@testable import BudgetThing

@Suite("Trip Model Tests")
struct TripModelTests {
    
    // MARK: - Test Helpers
    
    @MainActor
    func makeTestContainer() throws -> ModelContainer {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        return try ModelContainer(
            for: Trip.self, TripParticipant.self, TripExpense.self, TripSettlement.self, Transaction.self, BudgetThing.Category.self, Account.self,
            configurations: config
        )
    }
    
    // MARK: - Trip Creation Tests
    
    @Test("Trip creation with all fields")
    @MainActor
    func tripCreation_AllFields() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let startDate = Date()
        let endDate = Calendar.current.date(byAdding: .day, value: 7, to: startDate)!
        
        let trip = Trip(
            name: "Beach Vacation",
            emoji: "🏖️",
            startDate: startDate,
            endDate: endDate,
            budget: Decimal(1000),
            isGroup: true,
            isActive: true,
            isArchived: false
        )
        context.insert(trip)
        
        #expect(trip.name == "Beach Vacation")
        #expect(trip.emoji == "🏖️")
        #expect(trip.startDate == startDate)
        #expect(trip.endDate == endDate)
        #expect(trip.budget == Decimal(1000))
        #expect(trip.isGroup == true)
        #expect(trip.isActive == true)
        #expect(trip.isArchived == false)
    }
    
    @Test("Trip creation with defaults")
    @MainActor
    func tripCreation_Defaults() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = Trip(name: "Simple Trip")
        context.insert(trip)
        
        #expect(trip.name == "Simple Trip")
        #expect(trip.emoji == "✈️")  // default
        #expect(trip.startDate == nil)
        #expect(trip.endDate == nil)
        #expect(trip.budget == nil)
        #expect(trip.isGroup == false)
        #expect(trip.isActive == true)
        #expect(trip.isArchived == false)
        #expect(trip.isDeleted == nil)
    }
    
    // MARK: - TripParticipant Tests
    
    @Test("Participant creation")
    @MainActor
    func participantCreation() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = Trip(name: "Test Trip")
        context.insert(trip)
        
        let participant = TripParticipant(
            name: "Alice",
            email: "alice@example.com",
            phone: "+1234567890",
            isCurrentUser: true,
            colorHex: "FF6B6B",
            trip: trip
        )
        context.insert(participant)
        
        #expect(participant.name == "Alice")
        #expect(participant.email == "alice@example.com")
        #expect(participant.phone == "+1234567890")
        #expect(participant.isCurrentUser == true)
        #expect(participant.colorHex == "FF6B6B")
        #expect(participant.trip === trip)
    }
    
    @Test("Participant nextColor assigns unique colors")
    func participantNextColor() {
        let p1 = TripParticipant(name: "P1", colorHex: "FF6B6B")
        let p2 = TripParticipant(name: "P2", colorHex: "4ECDC4")
        
        let nextColor = TripParticipant.nextColor(for: [p1, p2])
        
        #expect(nextColor != "FF6B6B")
        #expect(nextColor != "4ECDC4")
        #expect(TripParticipant.participantColors.contains(nextColor))
    }
    
    @Test("Participant nextColor wraps around")
    func participantNextColor_WrapAround() {
        // Use all colors
        var participants: [TripParticipant] = []
        for color in TripParticipant.participantColors {
            participants.append(TripParticipant(name: "P", colorHex: color))
        }
        
        // Should still return a color (random from pool)
        let nextColor = TripParticipant.nextColor(for: participants)
        #expect(TripParticipant.participantColors.contains(nextColor))
    }
    
    // MARK: - TripExpense Tests
    
    @Test("TripExpense split type enum")
    func tripExpense_SplitType() {
        #expect(TripExpense.SplitType.equal.rawValue == "equal")
        #expect(TripExpense.SplitType.equalSelected.rawValue == "equalSelected")
        #expect(TripExpense.SplitType.percentage.rawValue == "percentage")
        #expect(TripExpense.SplitType.shares.rawValue == "shares")
        #expect(TripExpense.SplitType.exact.rawValue == "exact")
        
        #expect(TripExpense.SplitType.equal.displayName == "Equal")
        #expect(TripExpense.SplitType.percentage.displayName == "By Percentage")
    }
    
    @Test("TripExpense splitData JSON encoding/decoding")
    @MainActor
    func tripExpense_SplitDataJSON() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = Trip(name: "Test")
        context.insert(trip)
        
        let transaction = Transaction(amount: Decimal(100), date: Date(), note: "Test")
        context.insert(transaction)
        
        let p1Id = UUID()
        let p2Id = UUID()
        
        let splitData: [UUID: Decimal] = [
            p1Id: Decimal(60),
            p2Id: Decimal(40)
        ]
        
        let expense = TripExpense(
            trip: trip,
            transaction: transaction,
            splitType: .percentage,
            splitData: splitData
        )
        context.insert(expense)
        
        // Verify data can be read back
        let readData = expense.splitData
        #expect(readData?[p1Id] == Decimal(60))
        #expect(readData?[p2Id] == Decimal(40))
    }
    
    @Test("TripExpense computedSplits JSON encoding/decoding")
    @MainActor
    func tripExpense_ComputedSplitsJSON() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = Trip(name: "Test")
        context.insert(trip)
        
        let transaction = Transaction(amount: Decimal(100), date: Date(), note: "Test")
        context.insert(transaction)
        
        let expense = TripExpense(trip: trip, transaction: transaction)
        context.insert(expense)
        
        let p1Id = UUID()
        let p2Id = UUID()
        
        expense.computedSplits = [
            p1Id: Decimal(string: "33.33")!,
            p2Id: Decimal(string: "66.67")!
        ]
        
        let readSplits = expense.computedSplits
        #expect(readSplits?[p1Id] == Decimal(string: "33.33"))
        #expect(readSplits?[p2Id] == Decimal(string: "66.67"))
    }
    
    @Test("TripExpense splitType getter/setter")
    @MainActor
    func tripExpense_SplitTypeProperty() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = Trip(name: "Test")
        context.insert(trip)
        
        let transaction = Transaction(amount: Decimal(100), date: Date(), note: "Test")
        context.insert(transaction)
        
        let expense = TripExpense(trip: trip, transaction: transaction, splitType: .equal)
        context.insert(expense)
        
        #expect(expense.splitType == .equal)
        #expect(expense.splitTypeRaw == "equal")
        
        expense.splitType = .percentage
        #expect(expense.splitType == .percentage)
        #expect(expense.splitTypeRaw == "percentage")
    }
    
    // MARK: - TripSettlement Tests
    
    @Test("TripSettlement creation")
    @MainActor
    func tripSettlement_Creation() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = Trip(name: "Test Trip")
        context.insert(trip)
        
        let from = TripParticipant(name: "Bob", trip: trip)
        let to = TripParticipant(name: "Alice", trip: trip)
        context.insert(from)
        context.insert(to)
        
        let settlement = TripSettlement(
            amount: Decimal(50),
            date: Date(),
            note: "Paid back for dinner",
            trip: trip,
            fromParticipant: from,
            toParticipant: to
        )
        context.insert(settlement)
        
        #expect(settlement.amount == Decimal(50))
        #expect(settlement.note == "Paid back for dinner")
        #expect(settlement.fromParticipant === from)
        #expect(settlement.toParticipant === to)
        #expect(settlement.trip === trip)
    }
    
    // MARK: - Relationship Tests
    
    @Test("Trip has participants relationship")
    @MainActor
    func trip_ParticipantsRelationship() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = Trip(name: "Test Trip")
        context.insert(trip)
        
        let p1 = TripParticipant(name: "Alice", trip: trip)
        let p2 = TripParticipant(name: "Bob", trip: trip)
        context.insert(p1)
        context.insert(p2)
        
        // Save to establish relationships
        try context.save()
        
        #expect(trip.participants?.count == 2)
        #expect(trip.participants?.contains(where: { $0.name == "Alice" }) == true)
        #expect(trip.participants?.contains(where: { $0.name == "Bob" }) == true)
    }
    
    @Test("Trip has expenses relationship")
    @MainActor
    func trip_ExpensesRelationship() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = Trip(name: "Test Trip")
        context.insert(trip)
        
        let tx1 = Transaction(amount: Decimal(100), date: Date(), note: "Test 1")
        let tx2 = Transaction(amount: Decimal(50), date: Date(), note: "Test 2")
        context.insert(tx1)
        context.insert(tx2)
        
        let exp1 = TripExpense(trip: trip, transaction: tx1)
        let exp2 = TripExpense(trip: trip, transaction: tx2)
        context.insert(exp1)
        context.insert(exp2)
        
        try context.save()
        
        #expect(trip.expenses?.count == 2)
    }
    
    @Test("Trip has settlements relationship")
    @MainActor
    func trip_SettlementsRelationship() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = Trip(name: "Test Trip")
        context.insert(trip)
        
        let p1 = TripParticipant(name: "Alice", trip: trip)
        let p2 = TripParticipant(name: "Bob", trip: trip)
        context.insert(p1)
        context.insert(p2)
        
        let settlement = TripSettlement(amount: Decimal(50), trip: trip, fromParticipant: p1, toParticipant: p2)
        context.insert(settlement)
        
        try context.save()
        
        #expect(trip.settlements?.count == 1)
    }
    
    @Test("Transaction has tripExpense relationship")
    @MainActor
    func transaction_TripExpenseRelationship() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = Trip(name: "Test Trip")
        context.insert(trip)
        
        let transaction = Transaction(amount: Decimal(100), date: Date(), note: "Test")
        context.insert(transaction)
        
        let expense = TripExpense(trip: trip, transaction: transaction)
        context.insert(expense)
        
        try context.save()
        
        #expect(transaction.tripExpense === expense)
    }
    
    // MARK: - Cascade Delete Tests
    
    @Test("Deleting trip cascades to participants")
    @MainActor
    func cascadeDelete_Participants() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = Trip(name: "Test Trip")
        context.insert(trip)
        
        let p1 = TripParticipant(name: "Alice", trip: trip)
        let p2 = TripParticipant(name: "Bob", trip: trip)
        context.insert(p1)
        context.insert(p2)
        
        try context.save()
        
        // Delete trip
        context.delete(trip)
        try context.save()
        
        // Participants should be deleted
        let descriptor = FetchDescriptor<TripParticipant>()
        let remainingParticipants = try context.fetch(descriptor)
        #expect(remainingParticipants.isEmpty)
    }
    
    @Test("Deleting trip cascades to expenses")
    @MainActor
    func cascadeDelete_Expenses() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = Trip(name: "Test Trip")
        context.insert(trip)
        
        let tx = Transaction(amount: Decimal(100), date: Date(), note: "Test")
        context.insert(tx)
        
        let expense = TripExpense(trip: trip, transaction: tx)
        context.insert(expense)
        
        try context.save()
        
        context.delete(trip)
        try context.save()
        
        let descriptor = FetchDescriptor<TripExpense>()
        let remainingExpenses = try context.fetch(descriptor)
        #expect(remainingExpenses.isEmpty)
        
        // Transaction should still exist (nullify relationship)
        let txDescriptor = FetchDescriptor<Transaction>()
        let remainingTx = try context.fetch(txDescriptor)
        #expect(remainingTx.count == 1)
        #expect(remainingTx.first?.tripExpense == nil)
    }
    
    @Test("Deleting trip cascades to settlements")
    @MainActor
    func cascadeDelete_Settlements() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = Trip(name: "Test Trip")
        context.insert(trip)
        
        let p1 = TripParticipant(name: "Alice", trip: trip)
        let p2 = TripParticipant(name: "Bob", trip: trip)
        context.insert(p1)
        context.insert(p2)
        
        let settlement = TripSettlement(amount: Decimal(50), trip: trip, fromParticipant: p1, toParticipant: p2)
        context.insert(settlement)
        
        try context.save()
        
        context.delete(trip)
        try context.save()
        
        let descriptor = FetchDescriptor<TripSettlement>()
        let remaining = try context.fetch(descriptor)
        #expect(remaining.isEmpty)
    }
    
    // MARK: - Edge Cases
    
    @Test("Trip with nil optional fields")
    @MainActor
    func trip_NilOptionalFields() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = Trip(
            name: "Minimal Trip",
            startDate: nil,
            endDate: nil,
            budget: nil
        )
        context.insert(trip)
        
        try context.save()
        
        #expect(trip.startDate == nil)
        #expect(trip.endDate == nil)
        #expect(trip.budget == nil)
        #expect(trip.participants?.isEmpty != false)
        #expect(trip.expenses?.isEmpty != false)
        #expect(trip.settlements?.isEmpty != false)
    }
    
    @Test("Expense with nil splitData returns nil")
    @MainActor
    func expense_NilSplitData() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let trip = Trip(name: "Test")
        context.insert(trip)
        
        let transaction = Transaction(amount: Decimal(100), date: Date(), note: "Test")
        context.insert(transaction)
        
        let expense = TripExpense(trip: trip, transaction: transaction)
        context.insert(expense)
        
        #expect(expense.splitData == nil)
        #expect(expense.computedSplits == nil)
    }
    
    @Test("Trip timestamps set correctly")
    @MainActor
    func trip_Timestamps() throws {
        let container = try makeTestContainer()
        let context = container.mainContext
        
        let beforeCreate = Date()
        let trip = Trip(name: "Test Trip")
        context.insert(trip)
        let afterCreate = Date()
        
        #expect(trip.createdAt >= beforeCreate)
        #expect(trip.createdAt <= afterCreate)
        #expect(trip.updatedAt >= beforeCreate)
        #expect(trip.updatedAt <= afterCreate)
    }
}
