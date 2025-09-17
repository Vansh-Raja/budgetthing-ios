import Foundation
import SwiftUI
import SwiftData

enum DeletionMode {
    case deleteAll
    case detach
}

struct DeletionCoordinator {
    static func countTransactions(for category: Category, in context: ModelContext) -> Int {
        let targetId = category.id
        var fd = FetchDescriptor<Transaction>()
        fd.predicate = #Predicate { $0.category?.id == targetId }
        if let items = try? context.fetch(fd) { return items.count }
        return 0
    }

    static func deleteCategory(_ category: Category, mode: DeletionMode, in context: ModelContext) throws -> Int {
        let targetId = category.id
        var fd = FetchDescriptor<Transaction>()
        fd.predicate = #Predicate { $0.category?.id == targetId }
        let txs = try context.fetch(fd)
        switch mode {
        case .deleteAll:
            for t in txs { context.delete(t) }
        case .detach:
            for t in txs { t.category = nil }
        }
        context.delete(category)
        try context.save()
        return txs.count
    }

    static func countTransactions(for account: Account, in context: ModelContext) -> Int {
        let targetId = account.id
        var fd = FetchDescriptor<Transaction>()
        fd.predicate = #Predicate { $0.account?.id == targetId }
        if let items = try? context.fetch(fd) { return items.count }
        return 0
    }

    static func deleteAccount(_ account: Account, mode: DeletionMode, in context: ModelContext) throws -> Int {
        let targetId = account.id
        var fd = FetchDescriptor<Transaction>()
        fd.predicate = #Predicate { $0.account?.id == targetId }
        let txs = try context.fetch(fd)
        switch mode {
        case .deleteAll:
            for t in txs { context.delete(t) }
        case .detach:
            for t in txs { t.account = nil }
        }
        context.delete(account)
        try context.save()
        // Maintain default account if needed
        if let def = UserDefaults.standard.string(forKey: "defaultAccountID"), def == account.id.uuidString {
            // Choose first remaining account by name, else clear
            let af = FetchDescriptor<Account>()
            let remaining = (try? context.fetch(af)) ?? []
            if let next = remaining.sorted(by: { $0.name < $1.name }).first {
                UserDefaults.standard.set(next.id.uuidString, forKey: "defaultAccountID")
            } else {
                UserDefaults.standard.removeObject(forKey: "defaultAccountID")
            }
        }
        return txs.count
    }
}


