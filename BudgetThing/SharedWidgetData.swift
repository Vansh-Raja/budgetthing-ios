//
//  SharedWidgetData.swift
//  BudgetThing
//

import Foundation
import WidgetKit
import SwiftData

enum WidgetShared {
    static let appGroupId: String = "group.com.Vansh.BudgetThing"

    enum Keys {
        static let categories = "widget.categories"
        static let latestTransactions = "widget.latest5"
        static let accountSpends = "widget.accountSpends"
        static let quickAddSelectedCategoryId = "widget.quickAdd.selectedCategoryId"
        static let currencyCode = "widget.currencyCode"
    }

    static func groupDefaults() -> UserDefaults? {
        UserDefaults(suiteName: appGroupId)
    }
}

struct CategorySnapshot: Codable, Hashable, Identifiable {
    let id: UUID
    let name: String
    let emoji: String
}

struct TransactionSnapshot: Codable, Hashable, Identifiable {
    let id: UUID
    let amount: Decimal
    let date: Date
    let type: String // "expense" or "income"
    let categoryEmoji: String?
}

struct AccountSpendSnapshot: Codable, Hashable, Identifiable {
    let id: UUID
    let name: String
    let emoji: String
    let monthSpent: Decimal
}

enum WidgetBridge {
    static func publishSnapshots(context: ModelContext) {
        guard let defaults = WidgetShared.groupDefaults() else { return }

        // Categories
        do {
            var cf = FetchDescriptor<Category>()
            cf.fetchLimit = 20
            let cats = (try? context.fetch(cf)) ?? []
            let catSnaps = cats.map { CategorySnapshot(id: $0.id, name: $0.name, emoji: $0.emoji) }
            let data = try JSONEncoder().encode(catSnaps)
            defaults.set(data, forKey: WidgetShared.Keys.categories)
        } catch {}

        // Latest 5 transactions
        do {
            var tf = FetchDescriptor<Transaction>(sortBy: [SortDescriptor(\Transaction.date, order: .reverse)])
            tf.fetchLimit = 5
            let txs = (try? context.fetch(tf)) ?? []
            let snaps = txs.map { t in
                TransactionSnapshot(
                    id: t.id,
                    amount: t.amount,
                    date: t.date,
                    type: (t.typeRaw ?? "expense"),
                    categoryEmoji: t.category?.emoji
                )
            }
            let data = try JSONEncoder().encode(snaps)
            defaults.set(data, forKey: WidgetShared.Keys.latestTransactions)
        } catch {}

        // Account balances (amount left) — opening balance + incomes − expenses
        do {
            let af = FetchDescriptor<Account>()
            let accounts = (try? context.fetch(af)) ?? []

            var snaps: [AccountSpendSnapshot] = []
            for acc in accounts {
                let targetId = acc.id
                var tf = FetchDescriptor<Transaction>()
                tf.predicate = #Predicate { tx in tx.account?.id == targetId }
                let txs = (try? context.fetch(tf)) ?? []
                let expenses = txs.filter { ($0.typeRaw ?? "expense") != "income" }
                    .reduce(0 as Decimal) { $0 + $1.amount }
                let incomes = txs.filter { ($0.typeRaw ?? "expense") == "income" }
                    .reduce(0 as Decimal) { $0 + $1.amount }
                let balance = (acc.openingBalance ?? 0) + incomes - expenses
                snaps.append(AccountSpendSnapshot(id: acc.id, name: acc.name, emoji: acc.emoji, monthSpent: balance))
            }
            let data = try JSONEncoder().encode(snaps)
            defaults.set(data, forKey: WidgetShared.Keys.accountSpends)
        } catch {}

        defaults.set(UserDefaults.standard.string(forKey: "currencyCode") ?? "USD", forKey: WidgetShared.Keys.currencyCode)
        WidgetCenter.shared.reloadAllTimelines()
    }

    static func syncCurrencyCode(_ code: String) {
        guard let defaults = WidgetShared.groupDefaults() else { return }
        defaults.set(code, forKey: WidgetShared.Keys.currencyCode)
        WidgetCenter.shared.reloadAllTimelines()
    }
}

// MARK: - WidgetRefreshCoordinator

final class WidgetRefreshCoordinator {
    static let shared = WidgetRefreshCoordinator()

    private var timer: Timer?
    private var pendingWork: DispatchWorkItem?
    private weak var contextRef: ModelContext?

    private init() {}

    func start(context: ModelContext) {
        contextRef = context
        stop()
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.debouncedRefresh()
        }
        RunLoop.main.add(timer!, forMode: .common)
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        pendingWork?.cancel()
        pendingWork = nil
    }

    private func debouncedRefresh() {
        pendingWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let context = self?.contextRef else { return }
            WidgetBridge.publishSnapshots(context: context)
        }
        pendingWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6, execute: work)
    }
}


