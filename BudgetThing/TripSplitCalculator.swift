//
//  TripSplitCalculator.swift
//  BudgetThing
//

import Foundation

enum TripSplitCalculator {

    /// Calculate how much each participant owes for an expense
    /// - Parameters:
    ///   - total: The total expense amount
    ///   - splitType: How to split the expense
    ///   - participants: All participants in the trip
    ///   - splitData: Additional data for non-equal splits (percentages, shares, or exact amounts)
    /// - Returns: Dictionary mapping participant ID to their owed amount
    static func calculateSplits(
        total: Decimal,
        splitType: TripExpense.SplitType,
        participants: [TripParticipant],
        splitData: [UUID: Decimal]? = nil
    ) -> [UUID: Decimal] {

        guard total > 0 else { return [:] }

        switch splitType {
        case .equal:
            return calculateEqualSplit(total: total, participants: participants)

        case .equalSelected:
            return calculateEqualSelectedSplit(total: total, splitData: splitData)

        case .percentage:
            return calculatePercentageSplit(total: total, splitData: splitData)

        case .shares:
            return calculateSharesSplit(total: total, splitData: splitData)

        case .exact:
            return splitData ?? [:]
        }
    }

    // MARK: - Split Type Implementations

    /// Equal split among all participants
    private static func calculateEqualSplit(
        total: Decimal,
        participants: [TripParticipant]
    ) -> [UUID: Decimal] {
        let count = Decimal(participants.count)
        guard count > 0 else { return [:] }

        let share = (total / count).rounded(scale: 2, roundingMode: .bankers)

        // Handle rounding by adjusting the last person's share
        var result: [UUID: Decimal] = [:]
        var runningTotal: Decimal = 0

        for (index, participant) in participants.enumerated() {
            if index == participants.count - 1 {
                // Last participant gets the remainder to handle rounding
                result[participant.id] = total - runningTotal
            } else {
                result[participant.id] = share
                runningTotal += share
            }
        }

        return result
    }

    /// Equal split among selected participants only
    private static func calculateEqualSelectedSplit(
        total: Decimal,
        splitData: [UUID: Decimal]?
    ) -> [UUID: Decimal] {
        guard let selected = splitData else { return [:] }

        // splitData keys are participant IDs, values are 1 (selected) or 0 (not selected)
        let selectedIds = selected.filter { $0.value > 0 }.keys
        let count = Decimal(selectedIds.count)
        guard count > 0 else { return [:] }

        let share = (total / count).rounded(scale: 2, roundingMode: .bankers)

        var result: [UUID: Decimal] = [:]
        var runningTotal: Decimal = 0
        let sortedIds = Array(selectedIds).sorted { $0.uuidString < $1.uuidString }

        for (index, id) in sortedIds.enumerated() {
            if index == sortedIds.count - 1 {
                result[id] = total - runningTotal
            } else {
                result[id] = share
                runningTotal += share
            }
        }

        return result
    }

    /// Percentage-based split
    private static func calculatePercentageSplit(
        total: Decimal,
        splitData: [UUID: Decimal]?
    ) -> [UUID: Decimal] {
        guard let percentages = splitData else { return [:] }

        var result: [UUID: Decimal] = [:]
        var runningTotal: Decimal = 0
        let sortedEntries = percentages.sorted { $0.key.uuidString < $1.key.uuidString }

        for (index, entry) in sortedEntries.enumerated() {
            let amount = (total * entry.value / 100).rounded(scale: 2, roundingMode: .bankers)
            if index == sortedEntries.count - 1 {
                // Last participant gets remainder
                result[entry.key] = total - runningTotal
            } else {
                result[entry.key] = amount
                runningTotal += amount
            }
        }

        return result
    }

    /// Shares-based split (e.g., 2:1:1)
    private static func calculateSharesSplit(
        total: Decimal,
        splitData: [UUID: Decimal]?
    ) -> [UUID: Decimal] {
        guard let shares = splitData else { return [:] }

        let totalShares = shares.values.reduce(0, +)
        guard totalShares > 0 else { return [:] }

        var result: [UUID: Decimal] = [:]
        var runningTotal: Decimal = 0
        let sortedEntries = shares.sorted { $0.key.uuidString < $1.key.uuidString }

        for (index, entry) in sortedEntries.enumerated() {
            let amount = (total * entry.value / totalShares).rounded(scale: 2, roundingMode: .bankers)
            if index == sortedEntries.count - 1 {
                result[entry.key] = total - runningTotal
            } else {
                result[entry.key] = amount
                runningTotal += amount
            }
        }

        return result
    }

    // MARK: - Validation

    /// Validate that percentages sum to 100%
    static func validatePercentages(_ percentages: [UUID: Decimal]) -> Bool {
        let sum = percentages.values.reduce(0, +)
        return sum == 100
    }

    /// Validate that exact amounts sum to the total
    static func validateExactAmounts(_ amounts: [UUID: Decimal], total: Decimal) -> Bool {
        let sum = amounts.values.reduce(0, +)
        return sum == total
    }

    /// Check if at least one participant is selected
    static func validateSelectedParticipants(_ splitData: [UUID: Decimal]?) -> Bool {
        guard let data = splitData else { return false }
        return data.values.contains { $0 > 0 }
    }
}

// MARK: - Decimal Extension for Rounding

extension Decimal {
    func rounded(scale: Int, roundingMode: NSDecimalNumber.RoundingMode) -> Decimal {
        var result = Decimal()
        var mutableSelf = self
        NSDecimalRound(&result, &mutableSelf, scale, roundingMode)
        return result
    }
}
