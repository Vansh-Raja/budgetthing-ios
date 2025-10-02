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

        // Resolve App Group container URL
        guard let groupURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.Vansh.BudgetThing") else {
            fatalError("Missing App Group container. Enable App Groups for main app.")
        }
        let storeURL = groupURL.appendingPathComponent("default.store")

        // Ensure parent directory exists, then migrate from old location if needed
        do { try FileManager.default.createDirectory(at: storeURL.deletingLastPathComponent(), withIntermediateDirectories: true) } catch { }
        migrateIfNeeded(to: storeURL)

        let configuration = ModelConfiguration(schema: schema, url: storeURL)
        do {
            return try ModelContainer(for: schema, configurations: [configuration])
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

// MARK: - One-time migration

private func migrateIfNeeded(to newURL: URL) {
    let fm = FileManager.default
    if fm.fileExists(atPath: newURL.path) { return }

    // Legacy default store location in Application Support
    let appSupport = (try? fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true))
    let oldURL = appSupport?.appendingPathComponent("default.store")
    guard let oldURL, fm.fileExists(atPath: oldURL.path) else { return }

    // Copy trio if exists (-wal, -shm)
    do {
        let oldWal = URL(fileURLWithPath: oldURL.path + "-wal")
        let oldShm = URL(fileURLWithPath: oldURL.path + "-shm")
        let newWal = URL(fileURLWithPath: newURL.path + "-wal")
        let newShm = URL(fileURLWithPath: newURL.path + "-shm")

        try fm.createDirectory(at: newURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try fm.copyItem(at: oldURL, to: newURL)
        if fm.fileExists(atPath: oldWal.path) { try? fm.copyItem(at: oldWal, to: newWal) }
        if fm.fileExists(atPath: oldShm.path) { try? fm.copyItem(at: oldShm, to: newShm) }
    } catch {
        // If copy fails, fall through; a fresh store will be created at newURL
    }
}
