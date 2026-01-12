import Foundation
import SwiftData

enum SharedModelContainerProvider {
    static func make() throws -> ModelContext {
        let schema = Schema([Item.self, Category.self, Transaction.self, Account.self])
        guard let groupURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.Vansh.BudgetThing") else {
            throw NSError(domain: "SharedModelContainer", code: 1, userInfo: [NSLocalizedDescriptionKey: "Missing App Group container"])
        }
        let storeURL = groupURL.appendingPathComponent("default.store")
        let configuration = ModelConfiguration(schema: schema, url: storeURL)
        let container = try ModelContainer(for: schema, configurations: [configuration])
        return ModelContext(container)
    }
}



