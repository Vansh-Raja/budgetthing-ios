import Foundation
import AppIntents
import SwiftData

struct CategoryEntity: AppEntity, Identifiable, Hashable {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Category"

    static var defaultQuery = CategoryQuery()

    let id: UUID
    let name: String
    let emoji: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(emoji) \(name)")
    }
}

struct CategoryQuery: EntityQuery {
    func suggestedEntities() async throws -> [CategoryEntity] {
        return try await entities(matching: .init())
    }

    func entities(for identifiers: [CategoryEntity.ID]) async throws -> [CategoryEntity] {
        let context = try SharedModelContainerProvider.make()
        var fd = FetchDescriptor<Category>()
        fd.predicate = #Predicate<Category> { cat in
            identifiers.contains(cat.id) && (cat.isSystem ?? false) == false && (cat.isDeleted ?? false) == false
        }
        fd.sortBy = [SortDescriptor(\.sortIndex)]
        let cats = (try? context.fetch(fd)) ?? []
        return cats.map { CategoryEntity(id: $0.id, name: $0.name, emoji: $0.emoji) }
    }

    func entities(matching string: String) async throws -> [CategoryEntity] {
        let context = try SharedModelContainerProvider.make()
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return try await entities(matching: .init()) }
        var fd = FetchDescriptor<Category>()
        fd.predicate = #Predicate<Category> { cat in
            (cat.isSystem ?? false) == false && (cat.isDeleted ?? false) == false &&
            cat.name.localizedStandardContains(trimmed)
        }
        fd.sortBy = [SortDescriptor(\.sortIndex)]
        let cats = (try? context.fetch(fd)) ?? []
        return cats.map { CategoryEntity(id: $0.id, name: $0.name, emoji: $0.emoji) }
    }

    // Intentionally not implementing additional query overloads; suggestedEntities covers default listing.
}



