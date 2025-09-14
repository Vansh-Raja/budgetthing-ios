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
    @State private var selectedMonthKey: String? = nil // "YYYY-MM" or nil for All
    // Account filtering removed per new Accounts detail flow

    var body: some View {
        ZStack {
            Color(.black).ignoresSafeArea()

            NavigationStack(path: $path) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Transactions")
                        .font(Font.custom("AvenirNextCondensed-Heavy", size: 36))
                        .foregroundStyle(.white)

                    // Month filter chips
                    if !txs.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                monthChip(title: "All", isSelected: selectedMonthKey == nil) {
                                    selectedMonthKey = nil; Haptics.selection()
                                }
                                ForEach(allMonthSections(), id: \.id) { m in
                                    monthChip(title: m.title, isSelected: selectedMonthKey == m.id) {
                                        selectedMonthKey = m.id; Haptics.selection()
                                    }
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }

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
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                    } else {
                        List {
                            ForEach(monthSectionsFiltered(), id: \.id) { section in
                                Section(
                                    header:
                                        HStack {
                                            Text(section.title)
                                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                                                .foregroundStyle(.white)
                                            Spacer()
                                            Text(formattedAmount(section.total))
                                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                                                .foregroundStyle(.white.opacity(0.8))
                                        }
                                        .padding(.vertical, 4)
                                        .textCase(nil)
                                ) {
                                    ForEach(section.items) { tx in
                                        Button(action: {
                                            selectedTx = tx
                                            showingDetail = true
                                            Haptics.selection()
                                        }) {
                                            HStack(spacing: 8) {
                                                if (tx.typeRaw ?? "expense") == "income" {
                                                    Text("+")
                                                        .font(.system(size: 14, weight: .bold))
                                                        .foregroundStyle(.green)
                                                        .frame(width: 24, alignment: .center)
                                                } else if let emoji = tx.category?.emoji, !emoji.isEmpty {
                                                    Text(emoji)
                                                        .font(.system(size: 16))
                                                        .frame(width: 24, alignment: .center)
                                                } else {
                                                    Circle()
                                                        .fill(Color.white.opacity(0.25))
                                                        .frame(width: 6, height: 6)
                                                        .frame(width: 24, alignment: .center)
                                                }
                                                VStack(alignment: .leading, spacing: 2) {
                                                    Text(formattedAmount(tx.amount))
                                                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 20))
                                                        .foregroundStyle(((tx.typeRaw ?? "expense") == "income") ? .green : .white)
                                                    Text(tx.date, style: .date)
                                                        .font(.system(size: 12))
                                                        .foregroundStyle(.white.opacity(0.6))
                                                }
                                                Spacer()
                                                Image(systemName: "chevron.right")
                                                    .foregroundStyle(.white.opacity(0.25))
                                            }
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                            .contentShape(Rectangle())
                                        }
                                        .buttonStyle(.plain)
                                        .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
                                        .listRowBackground(Color.clear)
                                    }
                                }
                            }
                        }
                        .listStyle(.plain)
                        .listSectionSpacing(.compact)
                        .listRowSeparator(.hidden)
                        .scrollContentBackground(.hidden)
                    }

                    Spacer(minLength: 0)
                }
                .padding(24)
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

    // MARK: - Grouping
    private struct MonthSectionModel: Hashable {
        let id: String
        let title: String
        let total: Decimal
        let items: [Transaction]
    }

    private func allMonthSections() -> [MonthSectionModel] {
        guard !txs.isEmpty else { return [] }
        let cal = Calendar.current
        let df = DateFormatter()
        df.calendar = cal
        df.locale = Locale.current
        df.dateFormat = "LLLL yyyy"

        var groups: [String: [Transaction]] = [:]
        for tx in txs { // txs already sorted desc by date
            let comps = cal.dateComponents([.year, .month], from: tx.date)
            let key = String(format: "%04d-%02d", comps.year ?? 0, comps.month ?? 0)
            groups[key, default: []].append(tx)
        }

        // Sort keys by date desc matching txs order
        let sortedKeys = groups.keys.sorted(by: >)
        return sortedKeys.compactMap { key in
            guard let first = groups[key]?.first else { return nil }
            let monthStart = cal.date(from: cal.dateComponents([.year, .month], from: first.date)) ?? first.date
            let title = df.string(from: monthStart)
            let items = groups[key] ?? []
            let total = items.reduce(0 as Decimal) { $0 + $1.amount }
            return MonthSectionModel(id: key, title: title, total: total, items: items)
        }
    }

    private func monthSectionsFiltered() -> [MonthSectionModel] {
        let all = allMonthSections()
        guard let key = selectedMonthKey else { return all }
        return all.filter { $0.id == key }
    }

    // MARK: - UI helpers
    private func monthChip(title: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isSelected ? Color.white.opacity(0.18) : Color.white.opacity(0.08), in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    TransactionsListView(tabSelection: .constant(1))
        .modelContainer(for: [Category.self, Transaction.self], inMemory: true)
}


