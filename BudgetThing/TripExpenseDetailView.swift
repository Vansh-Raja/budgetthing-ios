//
//  TripExpenseDetailView.swift
//  BudgetThing
//

import SwiftUI
import SwiftData

struct TripExpenseDetailView: View {
    @Bindable var tripExpense: TripExpense
    @Bindable var trip: Trip
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Environment(\._currencyCode) private var currencyCode

    @State private var showDeleteConfirm: Bool = false
    @State private var showEditSplit: Bool = false

    private var transaction: Transaction? {
        tripExpense.transaction
    }

    private var participants: [TripParticipant] {
        trip.participants ?? []
    }

    private var computedSplits: [UUID: Decimal] {
        tripExpense.computedSplits ?? [:]
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 24) {
                    // Header Card
                    headerCard

                    // Split Details (for group trips)
                    if trip.isGroup {
                        splitDetailsSection
                    }

                    // Transaction Details
                    detailsSection

                    Spacer(minLength: 40)

                    // Remove from Trip Button
                    Button(action: { showDeleteConfirm = true }) {
                        HStack {
                            Image(systemName: "arrow.uturn.left")
                            Text("Remove from Trip")
                        }
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                        .foregroundStyle(.orange)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                    }
                    .padding(.horizontal, 20)
                }
                .padding(.vertical, 20)
            }
            .scrollIndicators(.hidden)
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button(action: { dismiss() }) {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                }
            }

            ToolbarItem(placement: .principal) {
                Text("Expense Details")
                    .font(Font.custom("AvenirNextCondensed-Heavy", size: 20))
                    .foregroundStyle(.white)
            }
        }
        .sheet(isPresented: $showEditSplit) {
            if trip.isGroup {
                NavigationStack {
                    SplitEditorView(
                        participants: participants,
                        splitType: Binding(
                            get: { tripExpense.splitType },
                            set: { tripExpense.splitType = $0 }
                        ),
                        splitData: Binding(
                            get: { tripExpense.splitData ?? [:] },
                            set: { newData in
                                tripExpense.splitData = newData
                                // Recalculate splits
                                let computed = TripSplitCalculator.calculateSplits(
                                    total: transaction?.amount ?? 0,
                                    splitType: tripExpense.splitType,
                                    participants: participants,
                                    splitData: newData
                                )
                                tripExpense.computedSplits = computed
                            }
                        ),
                        totalAmount: transaction?.amount ?? 0
                    )
                }
                .presentationDetents([.large])
            }
        }
        .confirmationDialog("Remove from Trip?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("Remove", role: .destructive) { removeFromTrip() }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("The transaction will be kept but unlinked from this trip.")
        }
        .preferredColorScheme(.dark)
    }

    // MARK: - Header Card

    private var headerCard: some View {
        VStack(spacing: 16) {
            // Category Emoji
            Text(transaction?.category?.emoji ?? "📝")
                .font(.system(size: 48))

            // Amount
            Text(formatCurrency(transaction?.amount ?? 0))
                .font(Font.custom("AvenirNextCondensed-Heavy", size: 36))
                .foregroundStyle(.white)

            // Category Name
            Text(transaction?.category?.name ?? "Expense")
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                .foregroundStyle(.white.opacity(0.7))

            // Date
            if let date = transaction?.date {
                Text(date, style: .date)
                    .font(.system(size: 14))
                    .foregroundStyle(.white.opacity(0.5))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 20)
    }

    // MARK: - Split Details

    private var splitDetailsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Split Details")
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                    .foregroundStyle(.white.opacity(0.6))

                Spacer()

                Button(action: { showEditSplit = true }) {
                    HStack(spacing: 4) {
                        Text("Edit")
                        Image(systemName: "chevron.right")
                    }
                    .font(.system(size: 12))
                    .foregroundStyle(.orange)
                }
            }

            VStack(spacing: 0) {
                // Paid by
                if let paidBy = tripExpense.paidByParticipant {
                    HStack(spacing: 12) {
                        Circle()
                            .fill(Color(hex: paidBy.colorHex ?? "FF6B6B") ?? .orange)
                            .frame(width: 32, height: 32)
                            .overlay(
                                Text(String(paidBy.name.prefix(1)).uppercased())
                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 12))
                                    .foregroundStyle(.white)
                            )

                        Text(paidBy.isCurrentUser ? "You paid" : "\(paidBy.name) paid")
                            .font(Font.custom("AvenirNextCondensed-DemiBold", size: 15))
                            .foregroundStyle(.white)

                        Spacer()

                        Text(formatCurrency(transaction?.amount ?? 0))
                            .font(Font.custom("AvenirNextCondensed-DemiBold", size: 15))
                            .foregroundStyle(.white)
                    }
                    .padding(14)
                    .background(.white.opacity(0.08))
                }

                Rectangle()
                    .fill(.white.opacity(0.06))
                    .frame(height: 1)

                // Split type indicator
                HStack(spacing: 8) {
                    Image(systemName: tripExpense.splitType.icon)
                        .font(.system(size: 14))
                        .foregroundStyle(.orange)

                    Text(tripExpense.splitType.displayName)
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
                        .foregroundStyle(.white.opacity(0.7))

                    Spacer()
                }
                .padding(14)
                .background(.white.opacity(0.04))

                // Individual splits
                ForEach(participants) { participant in
                    if let owedAmount = computedSplits[participant.id], owedAmount > 0 {
                        HStack(spacing: 12) {
                            Circle()
                                .fill(Color(hex: participant.colorHex ?? "FF6B6B") ?? .orange)
                                .frame(width: 28, height: 28)
                                .overlay(
                                    Text(String(participant.name.prefix(1)).uppercased())
                                        .font(.system(size: 10, weight: .bold))
                                        .foregroundStyle(.white)
                                )

                            Text(participant.isCurrentUser ? "You" : participant.name)
                                .font(.system(size: 14))
                                .foregroundStyle(.white.opacity(0.8))

                            Spacer()

                            Text(formatCurrency(owedAmount))
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
                                .foregroundStyle(.white.opacity(0.8))
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)

                        if participant.id != participants.last?.id {
                            Rectangle()
                                .fill(.white.opacity(0.04))
                                .frame(height: 1)
                                .padding(.leading, 54)
                        }
                    }
                }
            }
            .background(.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 12))
        }
        .padding(.horizontal, 20)
    }

    // MARK: - Details Section

    private var detailsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Details")
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                .foregroundStyle(.white.opacity(0.6))

            VStack(spacing: 0) {
                // Account
                if let account = transaction?.account {
                    detailRow(icon: "creditcard", title: "Account", value: "\(account.emoji) \(account.name)")
                    Rectangle().fill(.white.opacity(0.06)).frame(height: 1)
                }

                // Note
                if let note = transaction?.note, !note.isEmpty {
                    detailRow(icon: "note.text", title: "Note", value: note)
                }
            }
            .background(.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 12))
        }
        .padding(.horizontal, 20)
    }

    private func detailRow(icon: String, title: String, value: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundStyle(.white.opacity(0.5))
                .frame(width: 24)

            Text(title)
                .font(.system(size: 14))
                .foregroundStyle(.white.opacity(0.5))

            Spacer()

            Text(value)
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
                .foregroundStyle(.white)
                .lineLimit(2)
                .multilineTextAlignment(.trailing)
        }
        .padding(14)
    }

    // MARK: - Actions

    private func removeFromTrip() {
        transaction?.tripExpense = nil
        modelContext.delete(tripExpense)
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
        TripExpenseDetailView(
            tripExpense: TripExpense(splitType: .equal),
            trip: Trip(name: "Test", emoji: "✈️", isGroup: true)
        )
    }
}
