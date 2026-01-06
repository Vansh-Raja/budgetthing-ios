//
//  TripCard.swift
//  BudgetThing
//

import SwiftUI

struct TripCard: View {
    let trip: Trip
    let currencyCode: String

    private var totalSpent: Decimal {
        let expenses = trip.expenses ?? []
        return expenses.compactMap { $0.transaction?.amount }.reduce(0, +)
    }

    private var participantCount: Int {
        trip.participants?.count ?? 0
    }

    private var budgetProgress: Double? {
        guard let budget = trip.budget, budget > 0 else { return nil }
        return Double(truncating: (totalSpent / budget) as NSDecimalNumber)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Top row: emoji, name, group indicator
            HStack(spacing: 12) {
                Text(trip.emoji)
                    .font(.system(size: 24))

                VStack(alignment: .leading, spacing: 2) {
                    Text(trip.name)
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 20))
                        .foregroundStyle(.white)
                        .lineLimit(1)

                    if let startDate = trip.startDate {
                        HStack(spacing: 4) {
                            Text(startDate, style: .date)
                            if let endDate = trip.endDate, endDate != startDate {
                                Text("–")
                                Text(endDate, style: .date)
                            }
                        }
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.5))
                    }
                }

                Spacer()

                if trip.isGroup {
                    HStack(spacing: 4) {
                        Image(systemName: "person.2.fill")
                            .font(.system(size: 12))
                        if participantCount > 0 {
                            Text("\(participantCount)")
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
                        }
                    }
                    .foregroundStyle(.white.opacity(0.5))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(.white.opacity(0.08), in: Capsule())
                }
            }

            // Bottom row: spent amount and budget progress
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Spent")
                        .font(.system(size: 11))
                        .foregroundStyle(.white.opacity(0.5))

                    Text(formatCurrency(totalSpent))
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                        .foregroundStyle(.white)
                }

                Spacer()

                if let progress = budgetProgress, let budget = trip.budget {
                    VStack(alignment: .trailing, spacing: 4) {
                        Text("of \(formatCurrency(budget))")
                            .font(.system(size: 11))
                            .foregroundStyle(.white.opacity(0.5))

                        // Progress bar
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(.white.opacity(0.1))

                                RoundedRectangle(cornerRadius: 2)
                                    .fill(progressColor(progress))
                                    .frame(width: geo.size.width * min(progress, 1.0))
                            }
                        }
                        .frame(width: 80, height: 4)
                    }
                }
            }
        }
        .padding(14)
        .background(.white.opacity(0.10), in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(.white.opacity(0.12), lineWidth: 1)
        )
    }

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
    VStack(spacing: 16) {
        TripCard(
            trip: {
                let trip = Trip(name: "Japan 2025", emoji: "🇯🇵", isGroup: true)
                return trip
            }(),
            currencyCode: "USD"
        )

        TripCard(
            trip: Trip(name: "Weekend Getaway", emoji: "🏖️", budget: 500),
            currencyCode: "USD"
        )
    }
    .padding()
    .background(Color.black)
}
