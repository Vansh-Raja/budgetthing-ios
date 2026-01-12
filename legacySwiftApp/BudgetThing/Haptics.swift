//
//  Haptics.swift
//  BudgetThing
//

import UIKit

enum Haptics {
    private static var isOn: Bool { UserDefaults.standard.bool(forKey: "hapticsOn") }

    static func light() {
        guard isOn else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    static func selection() {
        guard isOn else { return }
        UISelectionFeedbackGenerator().selectionChanged()
    }

    static func success() { notify(.success) }
    static func warning() { notify(.warning) }
    static func error()   { notify(.error) }

    private static func notify(_ t: UINotificationFeedbackGenerator.FeedbackType) {
        guard isOn else { return }
        UINotificationFeedbackGenerator().notificationOccurred(t)
    }
}


