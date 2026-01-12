import Foundation
import AppIntents
import SwiftData

struct AccountEntity: AppEntity, Identifiable, Hashable {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Account"

    static var defaultQuery = AccountQuery()

    let id: UUID
    let name: String
    let emoji: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(emoji) \(name)")
    }
}

struct AccountQuery: EntityQuery {
    func suggestedEntities() async throws -> [AccountEntity] {
        try await entities(matching: .init())
    }

    func entities(for identifiers: [AccountEntity.ID]) async throws -> [AccountEntity] {
        let context = try SharedModelContainerProvider.make()
        var fd = FetchDescriptor<Account>()
        fd.predicate = #Predicate<Account> { acc in identifiers.contains(acc.id) }
        fd.sortBy = [SortDescriptor(\.sortIndex)]
        let accs = (try? context.fetch(fd)) ?? []
        return accs.map { AccountEntity(id: $0.id, name: $0.name, emoji: $0.emoji) }
    }

    func entities(matching string: String) async throws -> [AccountEntity] {
        let context = try SharedModelContainerProvider.make()
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        var fd = FetchDescriptor<Account>()
        if trimmed.isEmpty {
            fd.sortBy = [SortDescriptor(\.sortIndex)]
        } else {
            fd.predicate = #Predicate<Account> { acc in acc.name.localizedStandardContains(trimmed) }
            fd.sortBy = [SortDescriptor(\.sortIndex)]
        }
        let accs = (try? context.fetch(fd)) ?? []
        return accs.map { AccountEntity(id: $0.id, name: $0.name, emoji: $0.emoji) }
    }

    // Intentionally not implementing additional query overloads; suggestedEntities covers default listing.
}



