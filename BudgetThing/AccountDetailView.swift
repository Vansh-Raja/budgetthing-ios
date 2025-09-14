import SwiftUI
import SwiftData

struct AccountDetailView: View {
    let account: Account
    @Query(sort: \Transaction.date, order: .reverse) private var allTxs: [Transaction]
    @Environment(\._currencyCode) private var currencyCode
    @Environment(\.navigationSource) private var navSource
    @Environment(\.dismiss) private var dismiss

    private var accountTxs: [Transaction] {
        allTxs.filter { $0.account?.id == account.id }
    }

    private var spentThisMonth: Decimal {
        allTxs.filter { $0.account?.id == account.id && Calendar.current.isDate($0.date, equalTo: Date(), toGranularity: .month) && (($0.typeRaw ?? "expense") != "income") }
            .reduce(0 as Decimal) { $0 + $1.amount }
    }
    private var addedThisMonth: Decimal {
        allTxs.filter { $0.account?.id == account.id && Calendar.current.isDate($0.date, equalTo: Date(), toGranularity: .month) && (($0.typeRaw ?? "expense") == "income") }
            .reduce(0 as Decimal) { $0 + $1.amount }
    }
    private var spentTotal: Decimal { accountTxs.filter { ($0.typeRaw ?? "expense") != "income" }.reduce(0 as Decimal) { $0 + $1.amount } }
    private var incomeTotal: Decimal { accountTxs.filter { ($0.typeRaw ?? "expense") == "income" }.reduce(0 as Decimal) { $0 + $1.amount } }
    private var available: Decimal? { (account.limitAmount ?? account.openingBalance).map { $0 + incomeTotal - spentTotal } }

    var body: some View {
        ZStack { Color(.black).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Button(action: { dismiss() }) { Image(systemName: "chevron.left") }
                    Spacer()
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
                                            if (tx.typeRaw ?? "expense") == "income" {
                                                Text("+")
                                                    .font(.system(size: 14, weight: .bold))
                                                    .foregroundStyle(.green)
                                                    .frame(width: 24, alignment: .center)
                                            } else if let emoji = tx.category?.emoji, !emoji.isEmpty {
                                                Text(emoji).frame(width: 24)
                                            } else {
                                                Text("")
                                                    .frame(width: 24)
                                            }
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(formattedAmount(tx.amount))
                                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 20))
                                                    .foregroundStyle(((tx.typeRaw ?? "expense") == "income") ? .green : .white)
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
            let total = items.reduce(0 as Decimal) { partial, tx in
                let sign: Decimal = (tx.typeRaw == "income") ? 1 : -1
                return partial + sign * tx.amount
            }
            return MonthSectionModel(id: key, title: title, total: total, items: items)
        }
    }

    @State private var selectedTx: Transaction? = nil
}


