import SwiftUI
import SwiftData

struct AccountDetailView: View {
    let account: Account
    @Query(sort: \Transaction.date, order: .reverse) private var allTxs: [Transaction]
    @Environment(\._currencyCode) private var currencyCode
    @Environment(\.navigationSource) private var navSource
    @Environment(\.dismiss) private var dismiss
    @State private var showingEdit: Bool = false

    private var accountTxs: [Transaction] {
        allTxs.filter { tx in
            if (tx.systemRaw ?? "").contains("transfer") {
                return tx.transferFromAccountId == account.id || tx.transferToAccountId == account.id
            }
            return tx.account?.id == account.id
        }
    }

    private var spentThisMonth: Decimal {
        allTxs.filter { tx in
            let inMonth = Calendar.current.isDate(tx.date, equalTo: Date(), toGranularity: .month)
            guard inMonth else { return false }
            if (tx.systemRaw ?? "").contains("transfer") { return tx.transferFromAccountId == account.id }
            return tx.account?.id == account.id && ((tx.typeRaw ?? "expense") != "income")
        }.reduce(0 as Decimal) { $0 + $1.amount }
    }
    private var addedThisMonth: Decimal {
        allTxs.filter { tx in
            let inMonth = Calendar.current.isDate(tx.date, equalTo: Date(), toGranularity: .month)
            guard inMonth else { return false }
            if (tx.systemRaw ?? "").contains("transfer") { return tx.transferToAccountId == account.id }
            return tx.account?.id == account.id && ((tx.typeRaw ?? "expense") == "income")
        }.reduce(0 as Decimal) { $0 + $1.amount }
    }
    private var spentTotal: Decimal { accountTxs.filter { ($0.systemRaw ?? "").contains("transfer") ? ($0.transferFromAccountId == account.id) : (($0.typeRaw ?? "expense") != "income") }.reduce(0 as Decimal) { $0 + $1.amount } }
    private var incomeTotal: Decimal { accountTxs.filter { ($0.systemRaw ?? "").contains("transfer") ? ($0.transferToAccountId == account.id) : (($0.typeRaw ?? "expense") == "income") }.reduce(0 as Decimal) { $0 + $1.amount } }
    private var available: Decimal? { (account.limitAmount ?? account.openingBalance).map { $0 + incomeTotal - spentTotal } }

    var body: some View {
        ZStack { Color(.black).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Button(action: { dismiss() }) { Image(systemName: "chevron.left") }
                    Spacer()
                    Button(action: { Haptics.selection(); showingEdit = true }) { Image(systemName: "pencil") }
                }
                .foregroundStyle(.white)

                HStack(spacing: 12) {
                    Text(account.emoji.isEmpty ? "🧾" : account.emoji).font(.system(size: 30))
                    Text(account.name)
                        .font(Font.custom("AvenirNextCondensed-Heavy", size: 32))
                        .foregroundStyle(.white)
                }

                if let value = available {
                    Text(formattedAmount(value))
                        .font(Font.custom("AvenirNextCondensed-Heavy", size: 44))
                        .foregroundStyle(value < 0 ? .red : .white)
                }
                Text("This month · Added \(formattedAmount(addedThisMonth)) · Spent \(formattedAmount(spentThisMonth))")
                    .font(.system(size: 14))
                    .foregroundStyle(.white.opacity(0.7))

                if accountTxs.isEmpty {
                    Spacer()
                    Text("No transactions yet")
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 20))
                        .foregroundStyle(.white.opacity(0.8))
                    Spacer()
                } else {
                    List {
                        ForEach(monthSections(), id: \.id) { section in
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
                                    Button(action: { selectedTx = tx; Haptics.selection() }) {
                                        HStack(spacing: 8) {
                                            if (tx.systemRaw ?? "").contains("adjustment") {
                                                ZStack {
                                                    Circle()
                                                        .stroke(((tx.typeRaw ?? "expense") == "income") ? Color.green : Color.orange, lineWidth: 1.6)
                                                        .frame(width: 18, height: 18)
                                                    Image(systemName: "gearshape.fill")
                                                        .font(.system(size: 11, weight: .bold))
                                                        .foregroundStyle(.yellow)
                                                }
                                                .frame(width: 24, height: 18)
                                            } else if (tx.systemRaw ?? "").contains("transfer") {
                                                ZStack {
                                                    Circle().stroke(Color.blue, lineWidth: 1.6).frame(width: 18, height: 18)
                                                    Text("⇅").font(.system(size: 11, weight: .bold)).foregroundStyle(.blue)
                                                }
                                                .frame(width: 24, height: 18)
                                            } else if (tx.typeRaw ?? "expense") == "income" {
                                                Text("+")
                                                    .font(.system(size: 14, weight: .bold))
                                                    .foregroundStyle(.green)
                                                    .frame(width: 24, alignment: .center)
                                            } else if let emoji = tx.category?.emoji, !emoji.isEmpty {
                                                Text(emoji).frame(width: 24)
                                            } else {
                                                Text("").frame(width: 24)
                                            }
                                            VStack(alignment: .leading, spacing: 2) {
                                                HStack(spacing: 6) {
                                                    Text(formattedAmount(tx.amount))
                                                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 20))
                                                    .foregroundStyle((tx.systemRaw ?? "").contains("transfer") ? .blue : (tx.systemRaw ?? "").contains("adjustment") ? .yellow : ((tx.typeRaw ?? "expense") == "income") ? .green : .white)
                                                    if (tx.systemRaw ?? "").contains("adjustment") {
                                                        Text(((tx.typeRaw ?? "expense") == "income") ? "Adj +" : "Adj −")
                                                            .font(.system(size: 11, weight: .semibold))
                                                            .foregroundStyle(((tx.typeRaw ?? "expense") == "income") ? Color.green : Color.orange)
                                                            .padding(.horizontal, 6)
                                                            .padding(.vertical, 2)
                                                            .background(Color.white.opacity(0.08), in: Capsule())
                                                            .overlay(Capsule().stroke(Color.white.opacity(0.12), lineWidth: 1))
                                                    }
                                                }
                                                Text(tx.date, style: .date).font(.system(size: 12)).foregroundStyle(.white.opacity(0.6))
                                            }
                                            Spacer()
                                            Image(systemName: "chevron.right").foregroundStyle(.white.opacity(0.25))
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
                    .listRowSeparator(.hidden)
                    .scrollContentBackground(.hidden)
                }
                Spacer(minLength: 0)
            }
            .padding(24)
        }
        .preferredColorScheme(.dark)
        .environment(\.navigationSource, .account(account))
        .fullScreenCover(item: $selectedTx) { tx in
            NavigationStack { TransactionDetailView(item: tx) }
        }
        .fullScreenCover(isPresented: $showingEdit) {
            NavigationStack { EditAccountView(account: account) }
        }
    }

    private func formattedAmount(_ amount: Decimal) -> String {
        let symbol = CurrencyUtils.symbol(for: currencyCode)
        let n = NSDecimalNumber(decimal: amount)
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.minimumFractionDigits = 0
        f.maximumFractionDigits = 2
        f.usesGroupingSeparator = true
        let digits = f.string(from: n) ?? "0"
        return symbol + digits
    }

    private struct MonthSectionModel: Hashable {
        let id: String
        let title: String
        let total: Decimal
        let items: [Transaction]
    }

    private func monthSections() -> [MonthSectionModel] {
        guard !accountTxs.isEmpty else { return [] }
        let cal = Calendar.current
        let df = DateFormatter()
        df.calendar = cal
        df.locale = Locale.current
        df.dateFormat = "LLLL yyyy"

        var groups: [String: [Transaction]] = [:]
        for tx in accountTxs { // txs already sorted desc in query
            let comps = cal.dateComponents([.year, .month], from: tx.date)
            let key = String(format: "%04d-%02d", comps.year ?? 0, comps.month ?? 0)
            groups[key, default: []].append(tx)
        }

        let sortedKeys = groups.keys.sorted(by: >)
        return sortedKeys.compactMap { key in
            guard let first = groups[key]?.first else { return nil }
            let monthStart = cal.date(from: cal.dateComponents([.year, .month], from: first.date)) ?? first.date
            let title = df.string(from: monthStart)
            let items = groups[key] ?? []
                // Spent total (exclude income)
                let total = items.filter { ($0.typeRaw ?? "expense") != "income" }
                    .reduce(0 as Decimal) { $0 + $1.amount }
            return MonthSectionModel(id: key, title: title, total: total, items: items)
        }
    }

    @State private var selectedTx: Transaction? = nil
}


