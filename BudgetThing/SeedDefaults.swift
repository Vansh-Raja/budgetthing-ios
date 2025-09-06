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
    defaults.forEach { emoji, name in
        context.insert(Category(name: name, emoji: emoji))
    }
}


