//
//  TransactionsListView.swift
//  BudgetThing
//

import SwiftUI
import SwiftData

struct TransactionsListView: View {
    @Query(sort: \Item.timestamp, order: .reverse) private var items: [Item]

    var body: some View {
        ZStack {
            Color(.black).ignoresSafeArea()

            NavigationStack {
                List {
                    ForEach(items) { item in
                        NavigationLink(value: item) {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(formattedAmount(item.amount))
                                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 24))
                                        .foregroundStyle(.white)
                                    Text(item.timestamp, style: .date)
                                        .font(.caption)
                                        .foregroundStyle(.white.opacity(0.6))
                                }
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .foregroundStyle(.white.opacity(0.25))
                            }
                            .listRowBackground(Color.clear)
                        }
                    }
                }
                .listStyle(.plain)
                .listRowSeparator(.hidden)
                .navigationDestination(for: Item.self) { item in
                    TransactionDetailView(item: item)
                }
                .scrollContentBackground(.hidden)
            }
        }
        .preferredColorScheme(.dark)
    }

    private func formattedAmount(_ amount: Decimal?) -> String {
        let number = NSDecimalNumber(decimal: amount ?? 0)
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        return formatter.string(from: number) ?? "$0"
    }
}

#Preview {
    TransactionsListView()
        .modelContainer(for: Item.self, inMemory: true)
}


