//
//  TripSettleUpTab.swift
//  BudgetThing
//

import SwiftUI
import SwiftData

struct TripSettleUpTab: View {
    @Bindable var trip: Trip
    @Environment(\.modelContext) private var modelContext
    @Environment(\._currencyCode) private var currencyCode

    @State private var showingRecordSettlement: Bool = false
    @State private var selectedSettlement: DebtRelation? = nil

    private var participants: [TripParticipant] {
        trip.participants ?? []
    }

    private var expenses: [TripExpense] {
        trip.expenses ?? []
    }

    private var existingSettlements: [TripSettlement] {
        (trip.settlements ?? []).sorted { $0.date > $1.date }
    }

    private var balances: [ParticipantBalance] {
        TripBalanceCalculator.calculateBalances(
            participants: participants,
            expenses: expenses,
            settlements: existingSettlements
        )
    }

    private var suggestedSettlements: [DebtRelation] {
        TripBalanceCalculator.simplifyDebts(
            participants: participants,
            balances: balances
        )
    }

    private var isAllSettled: Bool {
        suggestedSettlements.isEmpty
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 24) {
                    if isAllSettled {
                        settledStateView
                    } else {
                        suggestedSettlementsSection
                    }

                    if !existingSettlements.isEmpty {
                        settlementHistorySection
                    }
                }
                .padding(.vertical, 16)
                .padding(.bottom, 40)
            }
            .scrollIndicators(.hidden)
        }
        .sheet(item: $selectedSettlement) { settlement in
            NavigationStack {
                RecordSettlementView(
                    trip: trip,
                    fromParticipant: settlement.fromParticipant,
                    toParticipant: settlement.toParticipant,
                    suggestedAmount: settlement.amount
                )
            }
            .presentationDetents([.medium])
        }
        .sheet(isPresented: $showingRecordSettlement) {
            NavigationStack {
                RecordSettlementView(trip: trip)
            }
            .presentationDetents([.medium])
        }
    }

    // MARK: - Settled State

    private var settledStateView: some View {
        VStack(spacing: 16) {
            Text("🎉")
                .font(.system(size: 48))

            Text("All Settled Up!")
                .font(Font.custom("AvenirNextCondensed-Heavy", size: 24))
                .foregroundStyle(.white)

            Text("Everyone is even. No payments needed.")
                .font(.system(size: 14))
                .foregroundStyle(.white.opacity(0.6))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 20)
    }

    // MARK: - Suggested Settlements

    private var suggestedSettlementsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Suggested Settlements")
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                    .foregroundStyle(.white.opacity(0.6))

                Spacer()

                Text("\(suggestedSettlements.count) payment\(suggestedSettlements.count == 1 ? "" : "s")")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.4))
            }
            .padding(.horizontal, 20)

            Text("Tap to record a payment")
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.4))
                .padding(.horizontal, 20)

            ForEach(suggestedSettlements) { settlement in
                settlementSuggestionRow(settlement)
                    .onTapGesture {
                        Haptics.selection()
                        selectedSettlement = settlement
                    }
            }
        }
    }

    private func settlementSuggestionRow(_ settlement: DebtRelation) -> some View {
        HStack(spacing: 12) {
            // From person
            VStack(spacing: 4) {
                Circle()
                    .fill(Color(hex: settlement.fromParticipant.colorHex ?? "FF6B6B") ?? .orange)
                    .frame(width: 40, height: 40)
                    .overlay(
                        Text(String(settlement.fromParticipant.name.prefix(1)).uppercased())
                            .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
                            .foregroundStyle(.white)
                    )

                Text(settlement.fromParticipant.isCurrentUser ? "You" : settlement.fromParticipant.name)
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.6))
                    .lineLimit(1)
            }
            .frame(width: 60)

            // Arrow with amount
            VStack(spacing: 4) {
                Image(systemName: "arrow.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.orange)

                Text(formatCurrency(settlement.amount))
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                    .foregroundStyle(.white)
            }

            // To person
            VStack(spacing: 4) {
                Circle()
                    .fill(Color(hex: settlement.toParticipant.colorHex ?? "4ECDC4") ?? .teal)
                    .frame(width: 40, height: 40)
                    .overlay(
                        Text(String(settlement.toParticipant.name.prefix(1)).uppercased())
                            .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
                            .foregroundStyle(.white)
                    )

                Text(settlement.toParticipant.isCurrentUser ? "You" : settlement.toParticipant.name)
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.6))
                    .lineLimit(1)
            }
            .frame(width: 60)

            Spacer()

            // Record button
            Image(systemName: "checkmark.circle")
                .font(.system(size: 24))
                .foregroundStyle(.green.opacity(0.8))
        }
        .padding(16)
        .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 20)
    }

    // MARK: - Settlement History

    private var settlementHistorySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Settlement History")
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                    .foregroundStyle(.white.opacity(0.6))

                Spacer()

                Button(action: { showingRecordSettlement = true }) {
                    HStack(spacing: 4) {
                        Image(systemName: "plus")
                        Text("Record")
                    }
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.orange)
                }
            }
            .padding(.horizontal, 20)

            ForEach(existingSettlements) { settlement in
                settlementHistoryRow(settlement)
            }
        }
    }

    private func settlementHistoryRow(_ settlement: TripSettlement) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 20))
                .foregroundStyle(.green)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(settlement.fromParticipant?.isCurrentUser == true ? "You" : settlement.fromParticipant?.name ?? "Unknown")
                        .fontWeight(.semibold)
                    Text("paid")
                    Text(settlement.toParticipant?.isCurrentUser == true ? "You" : settlement.toParticipant?.name ?? "Unknown")
                        .fontWeight(.semibold)
                }
                .font(.system(size: 14))
                .foregroundStyle(.white)

                Text(settlement.date, style: .date)
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.5))
            }

            Spacer()

            Text(formatCurrency(settlement.amount))
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                .foregroundStyle(.green)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
    }

    // MARK: - Helpers

    private func formatCurrency(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        formatter.maximumFractionDigits = 2
        return formatter.string(from: value as NSDecimalNumber) ?? "\(value)"
    }
}

#Preview {
    TripSettleUpTab(trip: Trip(name: "Test", emoji: "✈️", isGroup: true))
}
