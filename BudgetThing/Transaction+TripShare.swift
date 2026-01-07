//
//  Transaction+TripShare.swift
//  BudgetThing
//
//  Extension to calculate effective amounts for personal budget tracking
//  when transactions are part of group trips.
//

import Foundation

extension Transaction {
    
    /// Result of calculating the effective display info for a transaction
    /// - `amount`: The amount to display (user's share for trip expenses)
    /// - `isIncome`: Whether this should be displayed as income (green)
    /// - `shouldHide`: Whether this transaction should be hidden from the main list
    struct EffectiveDisplayInfo {
        let amount: Decimal
        let isIncome: Bool
        let shouldHide: Bool
    }
    
    /// Returns the effective amount and display info for personal budget tracking.
    ///
    /// Logic:
    /// - Income & transfers: Always show full amount, never hide
    /// - Regular expense (no trip): Show full amount
    /// - Trip expense where I paid and my share > 0: Show my share as expense
    /// - Trip expense where I paid and my share = 0: Show full amount as income (getting it all back)
    /// - Trip expense where someone else paid and my share > 0: Show my share as expense
    /// - Trip expense where someone else paid and my share = 0: Hide (not my concern)
    func effectiveDisplayInfo() -> EffectiveDisplayInfo {
        let txType = typeRaw ?? "expense"
        let systemType = systemRaw ?? ""
        
        // Income transactions: always show full amount as income
        if txType == "income" {
            return EffectiveDisplayInfo(amount: amount, isIncome: true, shouldHide: false)
        }
        
        // Transfer transactions: always show full amount, not income
        if systemType.contains("transfer") {
            return EffectiveDisplayInfo(amount: amount, isIncome: false, shouldHide: false)
        }
        
        // Adjustment transactions: show full amount
        if systemType.contains("adjustment") {
            return EffectiveDisplayInfo(amount: amount, isIncome: false, shouldHide: false)
        }
        
        // Not a trip expense: normal expense, show full amount
        guard let expense = tripExpense, let trip = expense.trip else {
            return EffectiveDisplayInfo(amount: amount, isIncome: false, shouldHide: false)
        }
        
        // Find current user in this trip's participants
        guard let currentUser = trip.participants?.first(where: { $0.isCurrentUser }) else {
            // No current user found in trip - fallback to full amount
            return EffectiveDisplayInfo(amount: amount, isIncome: false, shouldHide: false)
        }
        
        // Get computed splits (recalculate if not stored)
        let splits: [UUID: Decimal]
        if let stored = expense.computedSplits, !stored.isEmpty {
            splits = stored
        } else {
            splits = TripSplitCalculator.calculateSplits(
                total: amount,
                splitType: expense.splitType,
                participants: trip.participants ?? [],
                splitData: expense.splitData
            )
        }
        
        let myShare = splits[currentUser.id] ?? 0
        let iPaid = expense.paidByParticipant?.id == currentUser.id
        
        if myShare <= 0 {
            if iPaid {
                // I paid for others but I'm not included in the split
                // This is effectively income - I'm getting all the money back
                return EffectiveDisplayInfo(amount: amount, isIncome: true, shouldHide: false)
            } else {
                // Someone else paid and I'm not included - hide from my transactions
                return EffectiveDisplayInfo(amount: 0, isIncome: false, shouldHide: true)
            }
        } else {
            // My share is my actual expense (regardless of who paid)
            return EffectiveDisplayInfo(amount: myShare, isIncome: false, shouldHide: false)
        }
    }
    
    /// Convenience property for just the effective amount
    var effectiveAmount: Decimal {
        effectiveDisplayInfo().amount
    }
}
