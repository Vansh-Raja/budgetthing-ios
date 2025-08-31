//
//  ExpenseEntryView.swift
//  BudgetThing
//
//  A minimal, calculator-like expense entry mock.
//

import SwiftUI

struct ExpenseEntryView: View {
    enum Key: Hashable {
        case digit(Int)
        case dot
        case clear
        case backspace
        case plusMinus
        case op(String) // visual operator (non-interactive)
        case percent    // visual percent (non-interactive)
        case save       // acts as "="
    }

    @Environment(\.dismiss) private var dismiss

    // Displayed numeric string (e.g., 123.45). Keeps at most two decimals.
    @State private var amountString: String = "0"
    // Note field removed per updated minimalist design

    var onSave: ((Decimal, String) -> Void)? = nil

    private let columns: [GridItem] = Array(repeating: GridItem(.flexible(), spacing: 12), count: 4)
    @State private var showSavedToast: Bool = false

    var body: some View {
        ZStack {
            Color(.black)
                .ignoresSafeArea()

            GeometryReader { proxy in
                let topHeight = proxy.size.height * 0.45

                VStack(spacing: 0) {
                    // Top half – centered amount
                    VStack(spacing: 12) {
                        ZStack {
                            Text(formattedAmount())
                                .foregroundStyle(.white.opacity(0.16))
                                .offset(y: 8)
                            Text(formattedAmount())
                                .foregroundStyle(.white)
                        }
                        .font(Font.custom("AvenirNextCondensed-Heavy", size: 120))
                        .monospacedDigit()
                        .minimumScaleFactor(0.4)
                        .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: topHeight)
                    .padding(.horizontal, 20)

                    // Bottom half – keypad
                    VStack(spacing: 12) {
                        LazyVGrid(columns: columns, spacing: 16) {
                            key(.clear, label: "C")
                            key(.percent, label: "%")
                            keyIcon(.backspace, systemImage: "delete.left")
                            key(.save, label: "=")

                            key(.digit(7), label: "7")
                            key(.digit(8), label: "8")
                            key(.digit(9), label: "9")
                            key(.op("×"), label: "×")

                            key(.digit(4), label: "4")
                            key(.digit(5), label: "5")
                            key(.digit(6), label: "6")
                            key(.op("−"), label: "−")

                            key(.digit(1), label: "1")
                            key(.digit(2), label: "2")
                            key(.digit(3), label: "3")
                            key(.op("+"), label: "+")

                            key(.digit(0), label: "0")
                            key(.dot, label: ".")
                            key(.plusMinus, label: "+/−")
                            key(.op("="), label: "=")
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 28)
                }
            }
        }
        .preferredColorScheme(.dark)
        .overlay(alignment: .top) {
            if showSavedToast {
                Text("Saved")
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(.white.opacity(0.08), in: Capsule())
                    .padding(.top, 16)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
    }

    // MARK: - Key Builder

    private func key(_ key: Key, label: String, isEnabled: Bool = true) -> some View {
        Button(action: { if isEnabled { handleKey(key) } }) {
            Text(label)
                .font(Font.custom(isOperator(key) ? "AvenirNextCondensed-DemiBold" : "AvenirNextCondensed-Medium", size: 24))
                .frame(maxWidth: .infinity, minHeight: 72)
                .foregroundStyle(foregroundColor(for: key, isEnabled: isEnabled))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .accessibilityLabel(label)
    }

    private func keyIcon(_ key: Key, systemImage: String, isEnabled: Bool = true) -> some View {
        Button(action: { if isEnabled { handleKey(key) } }) {
            Image(systemName: systemImage)
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                .frame(maxWidth: .infinity, minHeight: 72)
                .foregroundStyle(foregroundColor(for: key, isEnabled: isEnabled))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(.white.opacity(0.18), lineWidth: 1)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .accessibilityLabel(systemImage)
    }

    private func isOperator(_ key: Key) -> Bool {
        if case .op(_) = key { return true }
        if case .percent = key { return true }
        return key == .save
    }

    private func foregroundColor(for key: Key, isEnabled: Bool) -> Color {
        if !isEnabled { return .white.opacity(0.3) }
        if isOperator(key) { return .orange }
        return .white
    }
    
    // MARK: - Logic

    private func formattedAmount() -> String {
        let prefix = amountString.hasPrefix("-") ? "-" : ""
        let bare = amountString.replacingOccurrences(of: "-", with: "")
        let display = bare.isEmpty ? "0" : bare
        return "$" + prefix + display
    }

    private func handleKey(_ key: Key) {
        switch key {
        case .digit(let n):
            appendDigit(n)
        case .dot:
            appendDot()
        case .clear:
            amountString = "0"
        case .backspace:
            backspace()
        case .plusMinus:
            toggleSign()
        case .save:
            let decimal = Decimal(string: amountString) ?? 0
            onSave?(decimal, "")
            amountString = "0"
            withAnimation(.spring(response: 0.35, dampingFraction: 0.9)) {
                showSavedToast = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                withAnimation(.easeOut(duration: 0.25)) {
                    showSavedToast = false
                }
            }
        case .op, .percent:
            break // visual only for now
        }
    }

    private func appendDigit(_ n: Int) {
        guard n >= 0 && n <= 9 else { return }

        if amountString == "0" {
            amountString = String(n)
            return
        }

        if let dotRange = amountString.range(of: ".") {
            let fractional = amountString[dotRange.upperBound...]
            if fractional.count >= 2 { return } // limit to 2 decimals
        }

        amountString.append(String(n))
    }

    private func appendDot() {
        if !amountString.contains(".") {
            amountString.append(".")
        }
    }

    private func backspace() {
        if amountString.count <= 1 || (amountString.count == 2 && amountString.hasPrefix("-")) {
            amountString = "0"
            return
        }
        amountString.removeLast()
        if amountString == "-" { amountString = "0" }
    }

    private func toggleSign() {
        if amountString.hasPrefix("-") {
            amountString.removeFirst()
        } else if amountString != "0" {
            amountString = "-" + amountString
        }
    }
}

// MARK: - Mock-only variants

private extension ExpenseEntryView.Key {
    // Non-interactive placeholders to echo inspiration layout
    static let percentMock = ExpenseEntryView.Key.digit(0) // unused sentinel for wiring
    static let opMock = ExpenseEntryView.Key.digit(0)      // unused sentinel for wiring
}

#Preview {
    ExpenseEntryView()
}


