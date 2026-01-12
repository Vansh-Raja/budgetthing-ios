//
//  AssignToTripSheet.swift
//  BudgetThing
//

import SwiftUI
import SwiftData

struct AssignToTripSheet: View {
    @Bindable var trip: Trip
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Environment(\._currencyCode) private var currencyCode

    @Query(sort: \Transaction.date, order: .reverse)
    private var allTransactions: [Transaction]

    @State private var selectedTransactions: Set<UUID> = []
    @State private var paidByParticipant: TripParticipant? = nil

    private var participants: [TripParticipant] {
        trip.participants ?? []
    }

    // Transactions not already assigned to a trip
    private var availableTransactions: [Transaction] {
        allTransactions.filter { tx in
            tx.tripExpense == nil &&
            tx.systemRaw == nil &&
            tx.typeRaw != "income"
        }
    }

    private var canAssign: Bool {
        !selectedTransactions.isEmpty && (!trip.isGroup || paidByParticipant != nil)
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                // Who Paid (for group trips)
                if trip.isGroup {
                    whoPaidSection
                }

                // Transaction List
                if availableTransactions.isEmpty {
                    emptyStateView
                } else {
                    transactionList
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Cancel") { dismiss() }
                    .foregroundStyle(.white)
            }

            ToolbarItem(placement: .principal) {
                Text("Assign to Trip")
                    .font(Font.custom("AvenirNextCondensed-Heavy", size: 20))
                    .foregroundStyle(.white)
            }

            ToolbarItem(placement: .topBarTrailing) {
                Button("Assign (\(selectedTransactions.count))") { assignTransactions() }
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(canAssign ? .orange : .white.opacity(0.3))
                    .disabled(!canAssign)
            }
        }
        .onAppear {
            if trip.isGroup {
                paidByParticipant = participants.first { $0.isCurrentUser }
            }
        }
        .preferredColorScheme(.dark)
    }

    // MARK: - Who Paid Section

    private var whoPaidSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("All expenses paid by:")
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.5))

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(participants) { participant in
                        Button(action: {
                            Haptics.selection()
                            paidByParticipant = participant
                        }) {
                            HStack(spacing: 6) {
                                Circle()
                                    .fill(Color(hex: participant.colorHex ?? "FF6B6B") ?? .orange)
                                    .frame(width: 20, height: 20)
                                    .overlay(
                                        Text(String(participant.name.prefix(1)).uppercased())
                                            .font(.system(size: 10, weight: .bold))
                                            .foregroundStyle(.white)
                                    )

                                Text(participant.isCurrentUser ? "You" : participant.name)
                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
                            }
                            .foregroundStyle(paidByParticipant?.id == participant.id ? .white : .white.opacity(0.6))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(
                                paidByParticipant?.id == participant.id ? Color.orange : Color.white.opacity(0.08),
                                in: Capsule()
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(16)
        .background(.white.opacity(0.04))
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        VStack(spacing: 16) {
            Spacer()
            Text("📝")
                .font(.system(size: 48))
            Text("No transactions to assign")
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 20))
                .foregroundStyle(.white)
            Text("All your expenses are either already\nassigned to a trip or are transfers/income")
                .font(.system(size: 14))
                .foregroundStyle(.white.opacity(0.6))
                .multilineTextAlignment(.center)
            Spacer()
        }
    }

    // MARK: - Transaction List

    private var transactionList: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(availableTransactions) { transaction in
                    transactionRow(transaction)
                        .onTapGesture {
                            Haptics.light()
                            toggleSelection(transaction)
                        }

                    if transaction.id != availableTransactions.last?.id {
                        Rectangle()
                            .fill(.white.opacity(0.06))
                            .frame(height: 1)
                            .padding(.leading, 60)
                    }
                }
            }
            .padding(.bottom, 40)
        }
    }

    private func transactionRow(_ transaction: Transaction) -> some View {
        let isSelected = selectedTransactions.contains(transaction.id)

        return HStack(spacing: 12) {
            // Selection indicator
            Circle()
                .stroke(isSelected ? Color.orange : Color.white.opacity(0.3), lineWidth: 2)
                .frame(width: 24, height: 24)
                .overlay(
                    Circle()
                        .fill(isSelected ? Color.orange : Color.clear)
                        .frame(width: 14, height: 14)
                )

            // Category emoji
            Text(transaction.category?.emoji ?? "📝")
                .font(.system(size: 22))
                .frame(width: 36, height: 36)
                .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))

            // Details
            VStack(alignment: .leading, spacing: 2) {
                Text(transaction.category?.name ?? transaction.note ?? "Expense")
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 15))
                    .foregroundStyle(.white)
                    .lineLimit(1)

                Text(transaction.date, style: .date)
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.5))
            }

            Spacer()

            Text(formatCurrency(transaction.amount))
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(isSelected ? Color.orange.opacity(0.1) : Color.clear)
        .contentShape(Rectangle())
    }

    // MARK: - Actions

    private func toggleSelection(_ transaction: Transaction) {
        if selectedTransactions.contains(transaction.id) {
            selectedTransactions.remove(transaction.id)
        } else {
            selectedTransactions.insert(transaction.id)
        }
    }

    private func assignTransactions() {
        for transactionId in selectedTransactions {
            guard let transaction = availableTransactions.first(where: { $0.id == transactionId }) else { continue }

            let tripExpense = TripExpense(
                trip: trip,
                transaction: transaction,
                paidByParticipant: paidByParticipant,
                splitType: .equal
            )

            // Calculate splits for group trips
            if trip.isGroup {
                let computed = TripSplitCalculator.calculateSplits(
                    total: transaction.amount,
                    splitType: .equal,
                    participants: participants,
                    splitData: nil
                )
                tripExpense.computedSplits = computed
            }

            modelContext.insert(tripExpense)
            transaction.tripExpense = tripExpense
        }

        trip.updatedAt = .now
        Haptics.success()
        dismiss()
    }

    private func formatCurrency(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        formatter.maximumFractionDigits = 2
        return formatter.string(from: value as NSDecimalNumber) ?? "\(value)"
    }
}

#Preview {
    NavigationStack {
        AssignToTripSheet(trip: Trip(name: "Test", emoji: "✈️"))
    }
}
