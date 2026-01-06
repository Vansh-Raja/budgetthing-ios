//
//  TripExpensesTab.swift
//  BudgetThing
//

import SwiftUI
import SwiftData

struct TripExpensesTab: View {
    @Bindable var trip: Trip

    @Environment(\.modelContext) private var modelContext
    @Environment(\._currencyCode) private var currencyCode

    @State private var selectedExpense: TripExpense? = nil

    private var expenses: [TripExpense] {
        (trip.expenses ?? []).sorted { ($0.transaction?.date ?? .distantPast) > ($1.transaction?.date ?? .distantPast) }
    }

    private var groupedExpenses: [(date: Date, expenses: [TripExpense])] {
        let calendar = Calendar.current
        let grouped = Dictionary(grouping: expenses) { expense in
            calendar.startOfDay(for: expense.transaction?.date ?? Date())
        }
        return grouped.sorted { $0.key > $1.key }.map { ($0.key, $0.value) }
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if expenses.isEmpty {
                emptyStateView
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(groupedExpenses, id: \.date) { group in
                            dateSection(date: group.date, expenses: group.expenses)
                        }
                    }
                    .padding(.bottom, 40)
                }
                .scrollIndicators(.hidden)
            }
        }
        .sheet(item: $selectedExpense) { expense in
            if expense.transaction != nil {
                NavigationStack {
                    TripExpenseDetailView(tripExpense: expense, trip: trip)
                }
                .presentationDetents([.large])
            }
        }
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        VStack(spacing: 20) {
            Spacer()

            Text("📝")
                .font(.system(size: 48))

            Text("No expenses yet")
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 22))
                .foregroundStyle(.white)

            Text("Add expenses from the calculator\nwith this trip selected")
                .font(.system(size: 14))
                .foregroundStyle(.white.opacity(0.6))
                .multilineTextAlignment(.center)

            Spacer()
            Spacer()
        }
    }

    // MARK: - Date Section

    private func dateSection(date: Date, expenses: [TripExpense]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Date Header
            HStack {
                Text(date, style: .date)
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
                    .foregroundStyle(.white.opacity(0.5))

                Spacer()

                let dayTotal = expenses.compactMap { $0.transaction?.amount }.reduce(0, +)
                Text(formatCurrency(dayTotal))
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
                    .foregroundStyle(.white.opacity(0.5))
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
            .background(.white.opacity(0.04))

            // Expense Rows
            ForEach(expenses) { expense in
                if let transaction = expense.transaction {
                    expenseRow(expense: expense, transaction: transaction)
                        .onTapGesture {
                            Haptics.selection()
                            selectedExpense = expense
                        }

                    if expense.id != expenses.last?.id {
                        Rectangle()
                            .fill(.white.opacity(0.06))
                            .frame(height: 1)
                            .padding(.leading, 60)
                    }
                }
            }
        }
    }

    private func expenseRow(expense: TripExpense, transaction: Transaction) -> some View {
        HStack(spacing: 12) {
            // Category Emoji or Default
            Text(transaction.category?.emoji ?? "📝")
                .font(.system(size: 24))
                .frame(width: 40, height: 40)
                .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 2) {
                // Category Name or Note
                Text(transaction.category?.name ?? transaction.note ?? "Expense")
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                    .foregroundStyle(.white)
                    .lineLimit(1)

                // Paid by (for group trips)
                if trip.isGroup, let paidBy = expense.paidByParticipant {
                    HStack(spacing: 4) {
                        Circle()
                            .fill(Color(hex: paidBy.colorHex ?? "FF6B6B") ?? .orange)
                            .frame(width: 8, height: 8)
                        Text(paidBy.isCurrentUser ? "You paid" : "\(paidBy.name) paid")
                            .font(.system(size: 11))
                            .foregroundStyle(.white.opacity(0.5))
                    }
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(formatCurrency(transaction.amount))
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                    .foregroundStyle(.white)

                // Split indicator for group trips
                if trip.isGroup {
                    Text(expense.splitType.displayName)
                        .font(.system(size: 10))
                        .foregroundStyle(.white.opacity(0.4))
                }
            }

            Image(systemName: "chevron.right")
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.3))
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
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
    TripExpensesTab(trip: Trip(name: "Test", emoji: "✈️"))
}
