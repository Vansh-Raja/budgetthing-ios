import WidgetKit
import SwiftUI

struct LatestEntry: TimelineEntry { let date: Date; let txs: [TransactionSnapshot]; let currency: String }

struct LatestProvider: TimelineProvider {
    func placeholder(in context: Context) -> LatestEntry { LatestEntry(date: .now, txs: [], currency: "USD") }
    func getSnapshot(in context: Context, completion: @escaping (LatestEntry) -> Void) { completion(load()) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<LatestEntry>) -> Void) {
        let entry = load()
        completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(60 * 15))))
    }
    private func load() -> LatestEntry {
        let defaults = UserDefaults(suiteName: WidgetShared.appGroupId)
        let currency = defaults?.string(forKey: WidgetShared.Keys.currencyCode) ?? "USD"
        let data = defaults?.data(forKey: WidgetShared.Keys.latestTransactions)
        let txs = (data.flatMap { try? JSONDecoder().decode([TransactionSnapshot].self, from: $0) }) ?? []
        return LatestEntry(date: .now, txs: txs, currency: currency)
    }
}

struct LatestCompactView: View {
    var entry: LatestEntry
    @Environment(\.widgetFamily) private var family
    var body: some View {
        ZStack { Color.black }
            .overlay(
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(entry.txs.prefix(5)).enumerated().map({ $0 }), id: \.offset) { index, t in
                        Link(destination: URL(string: "budgetthing://transaction/\(t.id.uuidString)")!) {
                            HStack(spacing: 6) {
                                if (t.type == "income") {
                                    Text("+")
                                        .font(.system(size: 10, weight: .bold))
                                        .foregroundStyle(.green)
                                        .frame(width: 16)
                                } else if let e = t.categoryEmoji, !e.isEmpty {
                                    Text(e).font(.system(size: 12)).frame(width: 16)
                                } else {
                                    Circle().fill(Color.white.opacity(0.28)).frame(width: 4, height: 4).frame(width: 16)
                                }
                                Text(formattedAmount(t.amount, currency: entry.currency))
                                    .font(.system(size: 13, weight: .semibold, design: .rounded))
                                    .monospacedDigit()
                                    .foregroundStyle(t.type == "income" ? .green : .white)
                                Spacer()
                                Text(dateShort(t.date))
                                    .font(.system(size: 9))
                                    .foregroundStyle(.white.opacity(0.6))
                                    .frame(width: 40, alignment: .trailing)
                            }
                            .padding(.vertical, 1)
                        }
                        .buttonStyle(.plain)
                        if index < min(entry.txs.count, 5) - 1 {
                            Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1).padding(.leading, 16 + 6)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 12)
            )
            .containerBackground(.clear, for: .widget)
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .inset(by: 0.5)
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )
    }
    private func formattedAmount(_ amount: Decimal, currency: String) -> String {
        let sym = WidgetCurrency.symbol(for: currency)
        let num = NSDecimalNumber(decimal: amount)
        let f = NumberFormatter(); f.numberStyle = .decimal; f.minimumFractionDigits = 0; f.maximumFractionDigits = 2
        return sym + (f.string(from: num) ?? "0")
    }
    private func dateShort(_ date: Date) -> String {
        let f = DateFormatter(); f.dateFormat = "d MMM"
        return f.string(from: date)
    }
}

struct LatestTransactionsWidget: Widget {
    let kind: String = "LatestTransactionsWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: LatestProvider()) { entry in
            LatestCompactView(entry: entry)
        }
        .contentMarginsDisabled()
        .supportedFamilies([.systemSmall])
        .configurationDisplayName("Latest Transactions")
        .description("See your last 5 transactions and tap to open details.")
    }
}


