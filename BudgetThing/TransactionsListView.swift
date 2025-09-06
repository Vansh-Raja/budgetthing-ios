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
    @State private var showingDetail: Bool = false
    @State private var selectedTx: Transaction? = nil

    var body: some View {
        ZStack {
            Color(.black).ignoresSafeArea()

            NavigationStack(path: $path) {
                if txs.isEmpty {
                    VStack(spacing: 12) {
                        Text("No transactions yet")
                            .font(Font.custom("AvenirNextCondensed-Heavy", size: 28))
                            .foregroundStyle(.white)
                        Text("Add an amount on the calculator and tap the checkmark to save.")
                            .font(.callout)
                            .multilineTextAlignment(.center)
                            .foregroundStyle(.white.opacity(0.7))
                    }
                    .padding(24)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                } else {
                    List {
                        ForEach(txs) { tx in
                            Button(action: {
                                selectedTx = tx
                                showingDetail = true
                                Haptics.selection()
                            }) {
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
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .listRowBackground(Color.clear)
                        }
                    }
                    .listStyle(.plain)
                    .listRowSeparator(.hidden)
                    .scrollContentBackground(.hidden)
                }
            }
            .fullScreenCover(isPresented: $showingDetail) {
                if let tx = selectedTx {
                    NavigationStack { TransactionDetailView(item: tx) }
                        .background(
                            Color.clear
                                .contentShape(Rectangle())
                                .gesture(
                                    DragGesture(minimumDistance: 20)
                                        .onEnded { value in
                                            if value.translation.height > 80 { showingDetail = false }
                                        }
                                )
                        )
                }
            }
        }
        .preferredColorScheme(.dark)
        .overlay(alignment: .bottom) {
            if path.isEmpty && !showingDetail {
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


