//
//  TripBalancesTab.swift
//  BudgetThing
//

import SwiftUI
import SwiftData

struct TripBalancesTab: View {
    @Bindable var trip: Trip
    @Environment(\._currencyCode) private var currencyCode

    private var participants: [TripParticipant] {
        trip.participants ?? []
    }

    private var expenses: [TripExpense] {
        trip.expenses ?? []
    }

    private var settlements: [TripSettlement] {
        trip.settlements ?? []
    }

    private var balances: [ParticipantBalance] {
        TripBalanceCalculator.calculateBalances(
            participants: participants,
            expenses: expenses,
            settlements: settlements
        )
    }

    private var currentUserSummary: (owes: Decimal, getsBack: Decimal) {
        TripBalanceCalculator.currentUserSummary(balances: balances)
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if participants.isEmpty {
                emptyStateView
            } else {
                ScrollView {
                    VStack(spacing: 20) {
                        // Your Summary Card
                        yourSummaryCard

                        // Participant Balances
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Everyone's Balance")
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                                .foregroundStyle(.white.opacity(0.6))
                                .padding(.horizontal, 20)

                            ForEach(balances.sorted(by: { abs($0.netBalance) > abs($1.netBalance) })) { balance in
                                participantBalanceRow(balance)
                            }
                        }

                        // Spending Breakdown
                        spendingBreakdown
                    }
                    .padding(.vertical, 16)
                    .padding(.bottom, 40)
                }
                .scrollIndicators(.hidden)
            }
        }
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        VStack(spacing: 16) {
            Spacer()
            Text("👥")
                .font(.system(size: 48))
            Text("No participants yet")
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 20))
                .foregroundStyle(.white)
            Text("Add participants to track\nwho owes what")
                .font(.system(size: 14))
                .foregroundStyle(.white.opacity(0.6))
                .multilineTextAlignment(.center)
            Spacer()
        }
    }

    // MARK: - Your Summary Card

    private var yourSummaryCard: some View {
        VStack(spacing: 16) {
            if currentUserSummary.owes > 0 {
                VStack(spacing: 4) {
                    Text("You owe")
                        .font(.system(size: 14))
                        .foregroundStyle(.white.opacity(0.6))

                    Text(formatCurrency(currentUserSummary.owes))
                        .font(Font.custom("AvenirNextCondensed-Heavy", size: 36))
                        .foregroundStyle(.orange)
                }
            } else if currentUserSummary.getsBack > 0 {
                VStack(spacing: 4) {
                    Text("You get back")
                        .font(.system(size: 14))
                        .foregroundStyle(.white.opacity(0.6))

                    Text(formatCurrency(currentUserSummary.getsBack))
                        .font(Font.custom("AvenirNextCondensed-Heavy", size: 36))
                        .foregroundStyle(.green)
                }
            } else {
                VStack(spacing: 4) {
                    Text("You're all settled up!")
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 20))
                        .foregroundStyle(.white)

                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 32))
                        .foregroundStyle(.green)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 20)
    }

    // MARK: - Participant Balance Row

    private func participantBalanceRow(_ balance: ParticipantBalance) -> some View {
        HStack(spacing: 12) {
            // Avatar
            Circle()
                .fill(Color(hex: balance.colorHex ?? "FF6B6B") ?? .orange)
                .frame(width: 40, height: 40)
                .overlay(
                    Text(String(balance.participantName.prefix(1)).uppercased())
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                        .foregroundStyle(.white)
                )

            // Name and status
            VStack(alignment: .leading, spacing: 2) {
                Text(balance.displayName)
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                    .foregroundStyle(.white)

                Text("Paid \(formatCurrency(balance.totalPaid))")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.5))
            }

            Spacer()

            // Balance
            VStack(alignment: .trailing, spacing: 2) {
                Text(formatCurrency(abs(balance.netBalance)))
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                    .foregroundStyle(balanceColor(balance.netBalance))

                Text(balance.owesOrGets)
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.5))
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(.white.opacity(0.04))
    }

    // MARK: - Spending Breakdown

    private var spendingBreakdown: some View {
        let spending = TripSummaryCalculator.participantSpending(trip: trip)

        return VStack(alignment: .leading, spacing: 12) {
            Text("Who Paid What")
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                .foregroundStyle(.white.opacity(0.6))
                .padding(.horizontal, 20)

            ForEach(spending, id: \.participant.id) { entry in
                HStack(spacing: 12) {
                    Circle()
                        .fill(Color(hex: entry.participant.colorHex ?? "FF6B6B") ?? .orange)
                        .frame(width: 32, height: 32)
                        .overlay(
                            Text(String(entry.participant.name.prefix(1)).uppercased())
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 12))
                                .foregroundStyle(.white)
                        )

                    Text(entry.participant.isCurrentUser ? "You" : entry.participant.name)
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
                        .foregroundStyle(.white)

                    Spacer()

                    Text(formatCurrency(entry.amount))
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                        .foregroundStyle(.white)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 8)
            }
        }
    }

    // MARK: - Helpers

    private func formatCurrency(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        formatter.maximumFractionDigits = 2
        return formatter.string(from: value as NSDecimalNumber) ?? "\(value)"
    }

    private func balanceColor(_ balance: Decimal) -> Color {
        if balance > 0 {
            return .green
        } else if balance < 0 {
            return .orange
        } else {
            return .white.opacity(0.6)
        }
    }
}

#Preview {
    TripBalancesTab(trip: Trip(name: "Test", emoji: "✈️", isGroup: true))
}
