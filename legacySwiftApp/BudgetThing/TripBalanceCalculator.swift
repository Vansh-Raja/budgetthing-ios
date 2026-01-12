//
//  TripBalanceCalculator.swift
//  BudgetThing
//

import Foundation

// MARK: - Data Structures

struct ParticipantBalance: Identifiable {
    let id: UUID
    let participantId: UUID
    let participantName: String
    let isCurrentUser: Bool
    let colorHex: String?
    let totalPaid: Decimal      // What they paid for the group
    let totalOwed: Decimal      // What they owe to the group
    let netBalance: Decimal     // Positive = owed money, Negative = owes money

    var displayName: String {
        isCurrentUser ? "You" : participantName
    }

    var owesOrGets: String {
        if netBalance > 0 {
            return "gets back"
        } else if netBalance < 0 {
            return "owes"
        } else {
            return "settled"
        }
    }
}

struct DebtRelation: Identifiable {
    let id: UUID
    let fromParticipant: TripParticipant
    let toParticipant: TripParticipant
    let amount: Decimal

    init(fromParticipant: TripParticipant, toParticipant: TripParticipant, amount: Decimal) {
        self.id = UUID()
        self.fromParticipant = fromParticipant
        self.toParticipant = toParticipant
        self.amount = amount
    }
}

// MARK: - Balance Calculator

enum TripBalanceCalculator {

    /// Calculate net balance for each participant
    /// - Parameters:
    ///   - participants: All participants in the trip
    ///   - expenses: All trip expenses with their splits
    ///   - settlements: All recorded settlements
    /// - Returns: Array of participant balances
    static func calculateBalances(
        participants: [TripParticipant],
        expenses: [TripExpense],
        settlements: [TripSettlement]
    ) -> [ParticipantBalance] {

        var paidByParticipant: [UUID: Decimal] = [:]
        var owedByParticipant: [UUID: Decimal] = [:]

        // Initialize all participants with zero
        for participant in participants {
            paidByParticipant[participant.id] = 0
            owedByParticipant[participant.id] = 0
        }

        // Process expenses
        for expense in expenses {
            guard let transaction = expense.transaction,
                  let payerId = expense.paidByParticipant?.id else { continue }

            let amount = transaction.amount

            // The payer paid for the group
            paidByParticipant[payerId, default: 0] += amount

            // Each participant owes their share
            if let splits = expense.computedSplits {
                for (participantId, owedAmount) in splits {
                    owedByParticipant[participantId, default: 0] += owedAmount
                }
            }
        }

        // Process settlements - when A pays B, it's like A paid for something B owed
        for settlement in settlements {
            guard let fromId = settlement.fromParticipant?.id,
                  let toId = settlement.toParticipant?.id else { continue }

            // Settlement reduces the debt: from paid to, so from's paid increases
            // and from's owed increases by the same amount (they "owed" this settlement)
            paidByParticipant[fromId, default: 0] += settlement.amount
            owedByParticipant[fromId, default: 0] += settlement.amount
        }

        // Calculate net balances
        return participants.map { participant in
            let paid = paidByParticipant[participant.id] ?? 0
            let owed = owedByParticipant[participant.id] ?? 0
            let net = paid - owed

            return ParticipantBalance(
                id: UUID(),
                participantId: participant.id,
                participantName: participant.name,
                isCurrentUser: participant.isCurrentUser,
                colorHex: participant.colorHex,
                totalPaid: paid,
                totalOwed: owed,
                netBalance: net
            )
        }
    }

    /// Debt simplification algorithm (greedy approach)
    /// Minimizes the number of transactions needed to settle all debts
    /// - Parameters:
    ///   - participants: All trip participants
    ///   - balances: Current balance for each participant
    /// - Returns: Minimal set of settlements to balance all debts
    static func simplifyDebts(
        participants: [TripParticipant],
        balances: [ParticipantBalance]
    ) -> [DebtRelation] {

        // Build participant lookup
        let participantLookup = Dictionary(uniqueKeysWithValues: participants.map { ($0.id, $0) })

        // Separate into creditors (positive balance = owed money) and debtors (negative balance = owes money)
        var creditors: [(participantId: UUID, amount: Decimal)] = []
        var debtors: [(participantId: UUID, amount: Decimal)] = []

        for balance in balances {
            if balance.netBalance > 0 {
                creditors.append((balance.participantId, balance.netBalance))
            } else if balance.netBalance < 0 {
                debtors.append((balance.participantId, -balance.netBalance)) // Store as positive
            }
        }

        // Sort by amount descending for more efficient matching
        creditors.sort { $0.amount > $1.amount }
        debtors.sort { $0.amount > $1.amount }

        var settlements: [DebtRelation] = []
        var creditorIndex = 0
        var debtorIndex = 0

        // Greedy matching: pair largest debtor with largest creditor
        while creditorIndex < creditors.count && debtorIndex < debtors.count {
            let creditor = creditors[creditorIndex]
            let debtor = debtors[debtorIndex]

            let transferAmount = min(creditor.amount, debtor.amount)

            if transferAmount > 0 {
                guard let fromParticipant = participantLookup[debtor.participantId],
                      let toParticipant = participantLookup[creditor.participantId] else {
                    continue
                }

                settlements.append(DebtRelation(
                    fromParticipant: fromParticipant,
                    toParticipant: toParticipant,
                    amount: transferAmount
                ))
            }

            // Update remaining balances
            creditors[creditorIndex].amount -= transferAmount
            debtors[debtorIndex].amount -= transferAmount

            // Move to next creditor/debtor if their balance is settled
            if creditors[creditorIndex].amount == 0 {
                creditorIndex += 1
            }
            if debtors[debtorIndex].amount == 0 {
                debtorIndex += 1
            }
        }

        return settlements
    }

    /// Calculate what the current user owes or is owed
    static func currentUserSummary(
        balances: [ParticipantBalance]
    ) -> (owes: Decimal, getsBack: Decimal) {
        guard let currentUserBalance = balances.first(where: { $0.isCurrentUser }) else {
            return (0, 0)
        }

        if currentUserBalance.netBalance < 0 {
            return (owes: -currentUserBalance.netBalance, getsBack: 0)
        } else if currentUserBalance.netBalance > 0 {
            return (owes: 0, getsBack: currentUserBalance.netBalance)
        }
        return (0, 0)
    }

    /// Get detailed breakdown of who owes whom for display
    static func detailedDebts(
        participants: [TripParticipant],
        expenses: [TripExpense]
    ) -> [UUID: [UUID: Decimal]] {
        // Result: [creditorId: [debtorId: amount]]
        var debts: [UUID: [UUID: Decimal]] = [:]

        for expense in expenses {
            guard let transaction = expense.transaction,
                  let payerId = expense.paidByParticipant?.id,
                  let splits = expense.computedSplits else { continue }

            for (participantId, owedAmount) in splits {
                // Skip if participant is the payer (they don't owe themselves)
                if participantId == payerId { continue }
                if owedAmount <= 0 { continue }

                // participantId owes payerId
                if debts[payerId] == nil {
                    debts[payerId] = [:]
                }
                debts[payerId]![participantId, default: 0] += owedAmount
            }
        }

        return debts
    }
}
