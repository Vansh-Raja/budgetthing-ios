//
//  TransactionsListView.swift
//  BudgetThing
//

import SwiftUI
import SwiftData

struct TransactionsListView: View {
    @Binding var tabSelection: Int
    @Query(sort: \Transaction.date, order: .reverse) private var txs: [Transaction]
    @State private var path = NavigationPath()
    @Environment(\._currencyCode) private var currencyCode

    var body: some View {
        ZStack {
            Color(.black).ignoresSafeArea()

            NavigationStack(path: $path) {
                List {
                    ForEach(txs) { tx in
                        NavigationLink(value: tx) {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(formattedAmount(tx.amount))
                                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 24))
                                        .foregroundStyle(.white)
                                    Text(tx.date, style: .date)
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
                .navigationDestination(for: Transaction.self) { tx in
                    TransactionDetailView(item: tx)
                }
                .scrollContentBackground(.hidden)
            }
        }
        .preferredColorScheme(.dark)
        .overlay(alignment: .bottom) {
            if path.isEmpty {
                FloatingPageSwitcher(selection: $tabSelection)
                    .padding(.bottom, 18)
            }
        }
    }

    private func formattedAmount(_ amount: Decimal) -> String {
        let symbol = CurrencyUtils.symbol(for: currencyCode)
        let number = NSDecimalNumber(decimal: amount)
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.minimumFractionDigits = 0
        f.maximumFractionDigits = 2
        f.usesGroupingSeparator = true
        let digits = f.string(from: number) ?? "0"
        return symbol + digits
    }
}

#Preview {
    TransactionsListView(tabSelection: .constant(1))
        .modelContainer(for: [Category.self, Transaction.self], inMemory: true)
}


