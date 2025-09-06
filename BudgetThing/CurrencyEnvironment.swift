import SwiftUI

private struct CurrencyCodeKey: EnvironmentKey {
    static let defaultValue: String = "USD"
}

extension EnvironmentValues {
    var _currencyCode: String {
        get { self[CurrencyCodeKey.self] }
        set { self[CurrencyCodeKey.self] = newValue }
    }
}




