//
//  BudgetThingApp.swift
//  BudgetThing
//
//  Created by Vansh Raja on 01/09/25.
//

import SwiftUI
import SwiftData

@main
struct BudgetThingApp: App {
    @AppStorage("currencyCode") private var currencyCode: String = "USD"
    var sharedModelContainer: ModelContainer = {
        let schema = Schema([
            Item.self,
            Category.self,
            Transaction.self,
            Account.self,
        ])
        let modelConfiguration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)

        do {
            return try ModelContainer(for: schema, configurations: [modelConfiguration])
        } catch {
            fatalError("Could not create ModelContainer: \(error)")
        }
    }()

    var body: some Scene {
        WindowGroup {
            RootPagerView()
                .environment(\._currencyCode, currencyCode)
        }
        .modelContainer(sharedModelContainer)
    }
}
