//
//  TripDetailView.swift
//  BudgetThing
//

import SwiftUI
import SwiftData

struct TripDetailView: View {
    @Bindable var trip: Trip
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Environment(\._currencyCode) private var currencyCode

    @State private var selectedTab: TripTab = .expenses
    @State private var showingEditTrip: Bool = false
    @State private var showingArchiveConfirm: Bool = false
    @State private var showingDeleteConfirm: Bool = false

    enum TripTab: String, CaseIterable {
        case expenses = "Expenses"
        case balances = "Balances"
        case settleUp = "Settle Up"

        var icon: String {
            switch self {
            case .expenses: return "list.bullet"
            case .balances: return "chart.pie"
            case .settleUp: return "checkmark.circle"
            }
        }
    }

    private var summary: TripSummary {
        TripSummaryCalculator.calculate(trip: trip)
    }

    private var availableTabs: [TripTab] {
        trip.isGroup ? TripTab.allCases : [.expenses]
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                // Header Card
                headerCard

                // Tab Pills (for group trips)
                if trip.isGroup {
                    tabPills
                }

                // Tab Content
                TabView(selection: $selectedTab) {
                    TripExpensesTab(trip: trip)
                        .tag(TripTab.expenses)

                    if trip.isGroup {
                        TripBalancesTab(trip: trip)
                            .tag(TripTab.balances)

                        TripSettleUpTab(trip: trip)
                            .tag(TripTab.settleUp)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button(action: { dismiss() }) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                }
            }

            ToolbarItem(placement: .principal) {
                HStack(spacing: 8) {
                    Text(trip.emoji)
                        .font(.system(size: 18))
                    Text(trip.name)
                        .font(Font.custom("AvenirNextCondensed-Heavy", size: 20))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                }
            }

            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button(action: { showingEditTrip = true }) {
                        Label("Edit Trip", systemImage: "pencil")
                    }

                    Button(action: { showingArchiveConfirm = true }) {
                        Label(trip.isArchived ? "Unarchive" : "Archive", systemImage: trip.isArchived ? "tray.and.arrow.up" : "archivebox")
                    }

                    Divider()

                    Button(role: .destructive, action: { showingDeleteConfirm = true }) {
                        Label("Delete Trip", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .font(.system(size: 18))
                        .foregroundStyle(.white)
                }
            }
        }
        .sheet(isPresented: $showingEditTrip) {
            NavigationStack {
                EditTripView(trip: trip)
            }
            .presentationDetents([.large])
        }
        .confirmationDialog(
            trip.isArchived ? "Unarchive this trip?" : "Archive this trip?",
            isPresented: $showingArchiveConfirm,
            titleVisibility: .visible
        ) {
            Button(trip.isArchived ? "Unarchive" : "Archive") {
                trip.isArchived.toggle()
                trip.updatedAt = .now
                Haptics.success()
            }
            Button("Cancel", role: .cancel) { }
        }
        .confirmationDialog(
            "Delete Trip?",
            isPresented: $showingDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                modelContext.delete(trip)
                try? modelContext.save()
                Haptics.success()
                dismiss()
            }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("This will permanently delete the trip and all its expenses.")
        }
        .preferredColorScheme(.dark)
    }

    // MARK: - Header Card

    private var headerCard: some View {
        VStack(spacing: 16) {
            // Stats Row
            HStack(spacing: 0) {
                statItem(
                    title: "Total Spent",
                    value: formatCurrency(summary.totalSpent),
                    color: .white
                )

                if trip.budget != nil {
                    Divider()
                        .frame(height: 40)
                        .background(.white.opacity(0.2))
                        .padding(.horizontal, 16)

                    statItem(
                        title: "Remaining",
                        value: formatCurrency(summary.budgetRemaining ?? 0),
                        color: (summary.budgetRemaining ?? 0) >= 0 ? .green : .red
                    )
                }

                if summary.daysCount > 1 {
                    Divider()
                        .frame(height: 40)
                        .background(.white.opacity(0.2))
                        .padding(.horizontal, 16)

                    statItem(
                        title: "Daily Avg",
                        value: formatCurrency(summary.dailyAverage),
                        color: .white.opacity(0.8)
                    )
                }

                Spacer()
            }

            // Budget Progress Bar
            if let budget = trip.budget, let percentUsed = summary.budgetPercentUsed {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("\(Int(min(percentUsed, 100)))% of budget used")
                            .font(.system(size: 12))
                            .foregroundStyle(.white.opacity(0.6))
                        Spacer()
                        Text(formatCurrency(budget))
                            .font(.system(size: 12))
                            .foregroundStyle(.white.opacity(0.6))
                    }

                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 4)
                                .fill(.white.opacity(0.1))

                            RoundedRectangle(cornerRadius: 4)
                                .fill(progressColor(percentUsed / 100))
                                .frame(width: geo.size.width * min(CGFloat(percentUsed / 100), 1.0))
                        }
                    }
                    .frame(height: 8)
                }
            }

            // Date Range
            if let startDate = trip.startDate {
                HStack(spacing: 4) {
                    Image(systemName: "calendar")
                        .font(.system(size: 12))
                    Text(startDate, style: .date)
                    if let endDate = trip.endDate, endDate != startDate {
                        Text("–")
                        Text(endDate, style: .date)
                    }
                    Text("·")
                    Text("\(summary.daysCount) days")
                }
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.5))
            }
        }
        .padding(20)
        .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }

    private func statItem(title: String, value: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 11))
                .foregroundStyle(.white.opacity(0.5))

            Text(value)
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 22))
                .foregroundStyle(color)
        }
    }

    // MARK: - Tab Pills

    private var tabPills: some View {
        HStack(spacing: 8) {
            ForEach(availableTabs, id: \.rawValue) { tab in
                Button(action: {
                    Haptics.selection()
                    withAnimation(.easeInOut(duration: 0.2)) {
                        selectedTab = tab
                    }
                }) {
                    HStack(spacing: 6) {
                        Image(systemName: tab.icon)
                            .font(.system(size: 12))
                        Text(tab.rawValue)
                            .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
                    }
                    .foregroundStyle(selectedTab == tab ? .white : .white.opacity(0.5))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(
                        selectedTab == tab ? Color.orange : Color.white.opacity(0.08),
                        in: Capsule()
                    )
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    // MARK: - Helpers

    private func formatCurrency(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        formatter.maximumFractionDigits = 2
        return formatter.string(from: value as NSDecimalNumber) ?? "\(value)"
    }

    private func progressColor(_ progress: Double) -> Color {
        if progress >= 1.0 {
            return .red
        } else if progress >= 0.8 {
            return .orange
        } else {
            return .green
        }
    }
}

#Preview {
    NavigationStack {
        TripDetailView(trip: Trip(name: "Japan 2025", emoji: "🇯🇵", budget: 3000, isGroup: true))
    }
}
