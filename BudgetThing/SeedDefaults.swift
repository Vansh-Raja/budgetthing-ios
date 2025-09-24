//
//  SeedDefaults.swift
//  BudgetThing
//

import Foundation
import SwiftData

func seedDefaultCategoriesIfNeeded(_ context: ModelContext) {
    var fd = FetchDescriptor<Category>()
    fd.fetchLimit = 1
    let haveAny = ((try? context.fetch(fd))?.isEmpty == false)
    guard !haveAny else { return }
    let defaults: [(String,String)] = [("🍔","Food"), ("🛒","Groceries"), ("🚕","Transport"), ("🏠","Rent"), ("🎉","Fun")]
    defaults.enumerated().forEach { index, pair in
        let (emoji, name) = pair
        context.insert(Category(name: name, emoji: emoji, sortIndex: index))
    }
}

func seedDefaultAccountIfNeeded(_ context: ModelContext) {
    do {
        let fetch = FetchDescriptor<Account>()
        let existing = try context.fetch(fetch)
        if existing.isEmpty {
            let cash = Account(name: "Cash", emoji: "💵", kind: .cash, sortIndex: 0)
            context.insert(cash)
            // Store as defaultAccountID
            UserDefaults.standard.set(cash.id.uuidString, forKey: "defaultAccountID")
        }
    } catch {
        print("Seed default account failed: \(error)")
    }
}


