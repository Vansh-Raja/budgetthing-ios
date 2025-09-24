import WidgetKit
import SwiftUI

struct AccountsChartEntry: TimelineEntry { let date: Date; let items: [AccountSpendSnapshot]; let currency: String }

struct AccountsChartProvider: TimelineProvider {
    func placeholder(in context: Context) -> AccountsChartEntry { AccountsChartEntry(date: .now, items: [], currency: "USD") }
    func getSnapshot(in context: Context, completion: @escaping (AccountsChartEntry) -> Void) { completion(load()) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<AccountsChartEntry>) -> Void) { completion(Timeline(entries: [load()], policy: .after(.now.addingTimeInterval(60 * 30)))) }
    private func load() -> AccountsChartEntry {
        let defaults = UserDefaults(suiteName: WidgetShared.appGroupId)
        let currency = defaults?.string(forKey: WidgetShared.Keys.currencyCode) ?? "USD"
        let data = defaults?.data(forKey: WidgetShared.Keys.accountSpends)
        let items = (data.flatMap { try? JSONDecoder().decode([AccountSpendSnapshot].self, from: $0) }) ?? []
        // Preserve the user-defined order coming from sortIndex; trim to first 3
        let top3 = Array(items.prefix(3))
        return AccountsChartEntry(date: .now, items: top3, currency: currency)
    }
}

struct AccountsChartCompactView: View {
    var entry: AccountsChartEntry
    var body: some View {
        ZStack { Color.black }
            .overlay(
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(entry.items.prefix(3)) { a in
                        HStack(spacing: 8) {
                            Capsule().fill(Color.white.opacity(0.35)).frame(width: 2, height: 14)
                            Text(a.emoji.isEmpty ? "🧾" : a.emoji).frame(width: 18)
                            Text(a.name)
                                .font(.system(size: 15, weight: .semibold, design: .rounded))
                                .foregroundStyle(.white)
                                .lineLimit(1)
                            Spacer()
                            VStack(alignment: .trailing, spacing: 0) {
                                Text(formattedAmount(a.monthSpent, currency: entry.currency))
                                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                                    .monospacedDigit()
                                    .foregroundStyle(a.monthSpent >= 0 ? Color.white : Color.orange)
                                Text("Left")
                                    .font(.system(size: 10, weight: .regular, design: .rounded))
                                    .foregroundStyle(.white.opacity(0.55))
                            }
                        }
                        Rectangle().fill(Color.white.opacity(0.08)).frame(height: 1)
                    }
                    Spacer(minLength: 0)
                }
                .padding(16)
            )
            .containerBackground(for: .widget) { Color.clear }
    }
    private func formattedAmount(_ amount: Decimal, currency: String) -> String {
        let sym = WidgetCurrency.symbol(for: currency)
        let num = NSDecimalNumber(decimal: amount)
        let f = NumberFormatter(); f.numberStyle = .decimal; f.minimumFractionDigits = 0; f.maximumFractionDigits = 2
        return sym + (f.string(from: num) ?? "0")
    }
}

struct AccountsChartWidget: Widget {
    let kind: String = "AccountsChartWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: AccountsChartProvider()) { entry in
            AccountsChartCompactView(entry: entry)
        }
        .contentMarginsDisabled()
        .supportedFamilies([.systemMedium])
        .configurationDisplayName("Accounts Chart")
        .description("Accounts and spend this month.")
    }
}


