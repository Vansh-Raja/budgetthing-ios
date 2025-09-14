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


