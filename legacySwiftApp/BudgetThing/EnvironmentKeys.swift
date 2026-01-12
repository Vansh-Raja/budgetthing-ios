import SwiftUI

private struct SetPagerSwipeEnabledKey: EnvironmentKey {
    static let defaultValue: (Bool) -> Void = { _ in }
}

extension EnvironmentValues {
    var setPagerSwipeEnabled: (Bool) -> Void {
        get { self[SetPagerSwipeEnabledKey.self] }
        set { self[SetPagerSwipeEnabledKey.self] = newValue }
    }
}


