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
    @StateObject private var deepLinkRouter = DeepLinkRouter()
    @Environment(\.scenePhase) private var scenePhase
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
                .environmentObject(deepLinkRouter)
                .onOpenURL { url in
                    guard let route = DeepLinkParser.parse(url: url) else { return }
                    switch route {
                    case .calculator(let categoryId):
                        deepLinkRouter.openCalculator(categoryId: categoryId)
                    case .transaction(let id):
                        deepLinkRouter.openTransaction(id: id)
                    }
                }
                .onChange(of: scenePhase) { _, newPhase in
                    if newPhase == .background || newPhase == .inactive {
                        // Clear session-selected account when app soft-closes or backgrounds
                        UserDefaults.standard.removeObject(forKey: "sessionSelectedAccountID")
                    }
                }
        }
        .modelContainer(sharedModelContainer)
        .onChange(of: currencyCode) { _, newValue in
            WidgetBridge.syncCurrencyCode(newValue)
        }
    }
}
