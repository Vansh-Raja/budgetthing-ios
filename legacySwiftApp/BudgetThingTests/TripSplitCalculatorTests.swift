//
//  TripSplitCalculatorTests.swift
//  BudgetThingTests
//

import Testing
import Foundation
@testable import BudgetThing

@Suite("TripSplitCalculator Tests")
struct TripSplitCalculatorTests {
    
    // MARK: - Test Helpers
    
    func makeParticipant(id: UUID = UUID(), name: String = "Test") -> TripParticipant {
        TripParticipant(id: id, name: name)
    }
    
    // MARK: - Equal Split Tests
    
    @Test("Equal split with 2 participants")
    func equalSplit_2Participants() {
        let p1 = makeParticipant(name: "Alice")
        let p2 = makeParticipant(name: "Bob")
        let participants = [p1, p2]
        
        let result = TripSplitCalculator.calculateSplits(
            total: Decimal(100),
            splitType: .equal,
            participants: participants
        )
        
        #expect(result.count == 2)
        #expect(result[p1.id] == Decimal(50))
        #expect(result[p2.id] == Decimal(50))
    }
    
    @Test("Equal split with 3 participants handles rounding")
    func equalSplit_3Participants_Rounding() {
        let p1 = makeParticipant(name: "Alice")
        let p2 = makeParticipant(name: "Bob")
        let p3 = makeParticipant(name: "Charlie")
        let participants = [p1, p2, p3]
        
        let result = TripSplitCalculator.calculateSplits(
            total: Decimal(100),
            splitType: .equal,
            participants: participants
        )
        
        #expect(result.count == 3)
        
        // Sum should equal exactly 100
        let sum = result.values.reduce(Decimal(0), +)
        #expect(sum == Decimal(100))
        
        // Each share should be approximately 33.33
        for (_, amount) in result {
            #expect(amount >= Decimal(string: "33.33")!)
            #expect(amount <= Decimal(string: "33.34")!)
        }
    }
    
    @Test("Equal split with single participant")
    func equalSplit_SingleParticipant() {
        let p1 = makeParticipant(name: "Alice")
        let participants = [p1]
        
        let result = TripSplitCalculator.calculateSplits(
            total: Decimal(100),
            splitType: .equal,
            participants: participants
        )
        
        #expect(result.count == 1)
        #expect(result[p1.id] == Decimal(100))
    }
    
    @Test("Equal split with zero total returns empty")
    func equalSplit_ZeroTotal() {
        let p1 = makeParticipant(name: "Alice")
        let p2 = makeParticipant(name: "Bob")
        let participants = [p1, p2]
        
        let result = TripSplitCalculator.calculateSplits(
            total: Decimal(0),
            splitType: .equal,
            participants: participants
        )
        
        #expect(result.isEmpty)
    }
    
    @Test("Equal split with empty participants returns empty")
    func equalSplit_NoParticipants() {
        let result = TripSplitCalculator.calculateSplits(
            total: Decimal(100),
            splitType: .equal,
            participants: []
        )
        
        #expect(result.isEmpty)
    }
    
    @Test("Equal split with 4 participants - $99.99")
    func equalSplit_4Participants_OddAmount() {
        let p1 = makeParticipant(name: "A")
        let p2 = makeParticipant(name: "B")
        let p3 = makeParticipant(name: "C")
        let p4 = makeParticipant(name: "D")
        let participants = [p1, p2, p3, p4]
        
        let result = TripSplitCalculator.calculateSplits(
            total: Decimal(string: "99.99")!,
            splitType: .equal,
            participants: participants
        )
        
        // Sum must equal exactly 99.99
        let sum = result.values.reduce(Decimal(0), +)
        #expect(sum == Decimal(string: "99.99")!)
    }
    
    // MARK: - Equal Selected Split Tests
    
    @Test("Equal selected split - 2 of 4 selected")
    func equalSelectedSplit_2of4() {
        let p1 = makeParticipant(name: "Alice")
        let p2 = makeParticipant(name: "Bob")
        let p3 = makeParticipant(name: "Charlie")
        let p4 = makeParticipant(name: "Diana")
        
        // Only p1 and p3 selected (value > 0 means selected)
        let splitData: [UUID: Decimal] = [
            p1.id: 1,
            p2.id: 0,
            p3.id: 1,
            p4.id: 0
        ]
        
        let result = TripSplitCalculator.calculateSplits(
            total: Decimal(100),
            splitType: .equalSelected,
            participants: [p1, p2, p3, p4],
            splitData: splitData
        )
        
        #expect(result.count == 2)
        #expect(result[p1.id] == Decimal(50))
        #expect(result[p3.id] == Decimal(50))
        #expect(result[p2.id] == nil)
        #expect(result[p4.id] == nil)
    }
    
    @Test("Equal selected split - none selected returns empty")
    func equalSelectedSplit_NoneSelected() {
        let p1 = makeParticipant(name: "Alice")
        let splitData: [UUID: Decimal] = [p1.id: 0]
        
        let result = TripSplitCalculator.calculateSplits(
            total: Decimal(100),
            splitType: .equalSelected,
            participants: [p1],
            splitData: splitData
        )
        
        #expect(result.isEmpty)
    }
    
    @Test("Equal selected split - nil splitData returns empty")
    func equalSelectedSplit_NilData() {
        let p1 = makeParticipant(name: "Alice")
        
        let result = TripSplitCalculator.calculateSplits(
            total: Decimal(100),
            splitType: .equalSelected,
            participants: [p1],
            splitData: nil
        )
        
        #expect(result.isEmpty)
    }
    
    // MARK: - Percentage Split Tests
    
    @Test("Percentage split - 60/40")
    func percentageSplit_60_40() {
        let p1 = makeParticipant(name: "Alice")
        let p2 = makeParticipant(name: "Bob")
        
        let splitData: [UUID: Decimal] = [
            p1.id: 60,
            p2.id: 40
        ]
        
        let result = TripSplitCalculator.calculateSplits(
            total: Decimal(100),
            splitType: .percentage,
            participants: [p1, p2],
            splitData: splitData
        )
        
        let sum = result.values.reduce(Decimal(0), +)
        #expect(sum == Decimal(100))
    }
    
    @Test("Percentage split - 33.33/33.33/33.34 rounding")
    func percentageSplit_ThreeWay() {
        let p1 = makeParticipant(name: "A")
        let p2 = makeParticipant(name: "B")
        let p3 = makeParticipant(name: "C")
        
        let splitData: [UUID: Decimal] = [
            p1.id: Decimal(string: "33.33")!,
            p2.id: Decimal(string: "33.33")!,
            p3.id: Decimal(string: "33.34")!
        ]
        
        let result = TripSplitCalculator.calculateSplits(
            total: Decimal(100),
            splitType: .percentage,
            participants: [p1, p2, p3],
            splitData: splitData
        )
        
        // Sum must equal exactly 100
        let sum = result.values.reduce(Decimal(0), +)
        #expect(sum == Decimal(100))
    }
    
    @Test("Percentage split - nil data returns empty")
    func percentageSplit_NilData() {
        let result = TripSplitCalculator.calculateSplits(
            total: Decimal(100),
            splitType: .percentage,
            participants: [],
            splitData: nil
        )
        
        #expect(result.isEmpty)
    }
    
    // MARK: - Shares Split Tests
    
    @Test("Shares split - 2:1:1 ratio")
    func sharesSplit_2_1_1() {
        let p1 = makeParticipant(name: "Alice")
        let p2 = makeParticipant(name: "Bob")
        let p3 = makeParticipant(name: "Charlie")
        
        let splitData: [UUID: Decimal] = [
            p1.id: 2,
            p2.id: 1,
            p3.id: 1
        ]
        
        let result = TripSplitCalculator.calculateSplits(
            total: Decimal(100),
            splitType: .shares,
            participants: [p1, p2, p3],
            splitData: splitData
        )
        
        // Sum must equal exactly 100
        let sum = result.values.reduce(Decimal(0), +)
        #expect(sum == Decimal(100))
        
        // p1 should get 50%, p2 and p3 each 25%
        #expect(result[p1.id] == Decimal(50))
    }
    
    @Test("Shares split - 3:2:1 ratio with odd amount")
    func sharesSplit_3_2_1_OddAmount() {
        let p1 = makeParticipant(name: "A")
        let p2 = makeParticipant(name: "B")
        let p3 = makeParticipant(name: "C")
        
        let splitData: [UUID: Decimal] = [
            p1.id: 3,
            p2.id: 2,
            p3.id: 1
        ]
        
        let result = TripSplitCalculator.calculateSplits(
            total: Decimal(string: "99.99")!,
            splitType: .shares,
            participants: [p1, p2, p3],
            splitData: splitData
        )
        
        // Sum must equal exactly 99.99
        let sum = result.values.reduce(Decimal(0), +)
        #expect(sum == Decimal(string: "99.99")!)
    }
    
    @Test("Shares split - zero total shares returns empty")
    func sharesSplit_ZeroShares() {
        let p1 = makeParticipant(name: "Alice")
        let splitData: [UUID: Decimal] = [p1.id: 0]
        
        let result = TripSplitCalculator.calculateSplits(
            total: Decimal(100),
            splitType: .shares,
            participants: [p1],
            splitData: splitData
        )
        
        #expect(result.isEmpty)
    }
    
    // MARK: - Exact Split Tests
    
    @Test("Exact split passes through amounts")
    func exactSplit_Passthrough() {
        let p1 = makeParticipant(name: "Alice")
        let p2 = makeParticipant(name: "Bob")
        
        let splitData: [UUID: Decimal] = [
            p1.id: Decimal(75),
            p2.id: Decimal(25)
        ]
        
        let result = TripSplitCalculator.calculateSplits(
            total: Decimal(100),
            splitType: .exact,
            participants: [p1, p2],
            splitData: splitData
        )
        
        #expect(result[p1.id] == Decimal(75))
        #expect(result[p2.id] == Decimal(25))
    }
    
    @Test("Exact split with nil data returns empty")
    func exactSplit_NilData() {
        let result = TripSplitCalculator.calculateSplits(
            total: Decimal(100),
            splitType: .exact,
            participants: [],
            splitData: nil
        )
        
        #expect(result.isEmpty)
    }
    
    // MARK: - Validation Tests
    
    @Test("Validate percentages - valid 100%")
    func validatePercentages_Valid() {
        let percentages: [UUID: Decimal] = [
            UUID(): 60,
            UUID(): 40
        ]
        
        #expect(TripSplitCalculator.validatePercentages(percentages) == true)
    }
    
    @Test("Validate percentages - invalid 90%")
    func validatePercentages_Invalid() {
        let percentages: [UUID: Decimal] = [
            UUID(): 60,
            UUID(): 30
        ]
        
        #expect(TripSplitCalculator.validatePercentages(percentages) == false)
    }
    
    @Test("Validate percentages - invalid 110%")
    func validatePercentages_Over100() {
        let percentages: [UUID: Decimal] = [
            UUID(): 60,
            UUID(): 50
        ]
        
        #expect(TripSplitCalculator.validatePercentages(percentages) == false)
    }
    
    @Test("Validate exact amounts - valid")
    func validateExactAmounts_Valid() {
        let amounts: [UUID: Decimal] = [
            UUID(): 75,
            UUID(): 25
        ]
        
        #expect(TripSplitCalculator.validateExactAmounts(amounts, total: Decimal(100)) == true)
    }
    
    @Test("Validate exact amounts - invalid")
    func validateExactAmounts_Invalid() {
        let amounts: [UUID: Decimal] = [
            UUID(): 75,
            UUID(): 20
        ]
        
        #expect(TripSplitCalculator.validateExactAmounts(amounts, total: Decimal(100)) == false)
    }
    
    @Test("Validate selected participants - valid")
    func validateSelectedParticipants_Valid() {
        let splitData: [UUID: Decimal] = [
            UUID(): 1,
            UUID(): 0
        ]
        
        #expect(TripSplitCalculator.validateSelectedParticipants(splitData) == true)
    }
    
    @Test("Validate selected participants - none selected")
    func validateSelectedParticipants_NoneSelected() {
        let splitData: [UUID: Decimal] = [
            UUID(): 0,
            UUID(): 0
        ]
        
        #expect(TripSplitCalculator.validateSelectedParticipants(splitData) == false)
    }
    
    @Test("Validate selected participants - nil data")
    func validateSelectedParticipants_NilData() {
        #expect(TripSplitCalculator.validateSelectedParticipants(nil) == false)
    }
    
    // MARK: - Edge Cases
    
    @Test("Large amount split correctly")
    func largeAmount_SplitCorrectly() {
        let p1 = makeParticipant(name: "A")
        let p2 = makeParticipant(name: "B")
        let participants = [p1, p2]
        
        let largeAmount = Decimal(string: "999999.99")!
        
        let result = TripSplitCalculator.calculateSplits(
            total: largeAmount,
            splitType: .equal,
            participants: participants
        )
        
        let sum = result.values.reduce(Decimal(0), +)
        #expect(sum == largeAmount)
    }
    
    @Test("Very small amount split correctly")
    func smallAmount_SplitCorrectly() {
        let p1 = makeParticipant(name: "A")
        let p2 = makeParticipant(name: "B")
        let participants = [p1, p2]
        
        let smallAmount = Decimal(string: "0.01")!
        
        let result = TripSplitCalculator.calculateSplits(
            total: smallAmount,
            splitType: .equal,
            participants: participants
        )
        
        let sum = result.values.reduce(Decimal(0), +)
        #expect(sum == smallAmount)
    }
    
    @Test("Negative amount returns empty")
    func negativeAmount_ReturnsEmpty() {
        let p1 = makeParticipant(name: "A")
        
        let result = TripSplitCalculator.calculateSplits(
            total: Decimal(-100),
            splitType: .equal,
            participants: [p1]
        )
        
        #expect(result.isEmpty)
    }
}
