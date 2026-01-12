import SwiftUI

enum NavigationSource: Equatable {
    case transactions
    case account(Account)
}

private struct NavigationSourceKey: EnvironmentKey {
    static let defaultValue: NavigationSource? = nil
}

extension EnvironmentValues {
    var navigationSource: NavigationSource? {
        get { self[NavigationSourceKey.self] }
        set { self[NavigationSourceKey.self] = newValue }
    }
}

// MARK: - Deep link helpers

private struct PrefillCategoryIdKey: EnvironmentKey {
    static let defaultValue: UUID? = nil
}

extension EnvironmentValues {
    var prefillCategoryId: UUID? {
        get { self[PrefillCategoryIdKey.self] }
        set { self[PrefillCategoryIdKey.self] = newValue }
    }
}


