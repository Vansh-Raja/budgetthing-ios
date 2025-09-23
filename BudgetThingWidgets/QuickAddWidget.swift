import WidgetKit
import SwiftUI

struct QuickAddEntry: TimelineEntry {
    let date: Date
    let categories: [CategorySnapshot]
}

struct QuickAddProvider: TimelineProvider {
    func placeholder(in context: Context) -> QuickAddEntry {
        QuickAddEntry(date: .now, categories: [])
    }

    func getSnapshot(in context: Context, completion: @escaping (QuickAddEntry) -> Void) {
        completion(QuickAddEntry(date: .now, categories: loadCategories()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<QuickAddEntry>) -> Void) {
        let entry = QuickAddEntry(date: .now, categories: loadCategories())
        let timeline = Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(60 * 30)))
        completion(timeline)
    }

    private func loadCategories() -> [CategorySnapshot] {
        guard let defaults = UserDefaults(suiteName: WidgetShared.appGroupId), let data = defaults.data(forKey: WidgetShared.Keys.categories) else { return [] }
        return (try? JSONDecoder().decode([CategorySnapshot].self, from: data)) ?? []
    }
}

struct QuickAddWidgetSmallView: View {
    var entry: QuickAddEntry
    var body: some View {
        ZStack { Color.black }
            .overlay(
                HStack {
                    Spacer(minLength: 0)
                    HStack(spacing: 6) {
                        Image(systemName: "plus")
                            .font(.system(size: 12, weight: .bold))
                        Text("Add")
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .foregroundStyle(.orange)
                    .padding(.horizontal, 10)
                    .frame(height: 28)
                    .background(Color.white.opacity(0.12), in: Capsule())
                    .overlay(Capsule().stroke(Color.white.opacity(0.15), lineWidth: 1))
                    Spacer(minLength: 0)
                }
                .padding(10)
            )
            .containerBackground(for: .widget) { Color.clear }
        .widgetURL(URL(string: "budgetthing://calculator"))
    }
}

struct QuickAddWidgetLargeView: View {
    var entry: QuickAddEntry
    var body: some View {
        ZStack { Color.black }
            .overlay(content: {
                VStack(alignment: .leading, spacing: 10) {
                    let cats = Array(entry.categories.prefix(8))
                    HStack(spacing: 10) {
                        ForEach(cats) { c in
                            Link(destination: URL(string: "budgetthing://calculator?categoryId=\(c.id.uuidString)")!) {
                                Text(c.emoji)
                                    .font(.system(size: 18))
                                    .frame(width: 28, height: 28)
                                    .background(Color.white.opacity(0.1), in: Capsule())
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    Spacer(minLength: 0)
                    HStack {
                        Spacer()
                        Link(destination: URL(string: "budgetthing://calculator")!) {
                            Text("Open Calculator")
                                .font(.system(.caption, weight: .semibold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(Color.white.opacity(0.1), in: Capsule())
                                .overlay(Capsule().stroke(Color.white.opacity(0.12), lineWidth: 1))
                        }
                    }
                }
                .padding(14)
            })
    }
}

struct QuickAddWidget: Widget {
    let kind: String = "QuickAddWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: QuickAddProvider()) { entry in
            QuickAddWidgetSmallView(entry: entry)
        }
        .contentMarginsDisabled()
        .supportedFamilies([.systemSmall, .systemLarge])
        .configurationDisplayName("Quick Add")
        .description("Add an expense quickly or pick a category then open calculator.")
    }
}


