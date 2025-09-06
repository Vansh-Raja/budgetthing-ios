//
//  ExpenseEntryView.swift
//  BudgetThing
//
//  A minimal, calculator-like expense entry mock.
//

import SwiftUI
import SwiftData

struct ExpenseEntryView: View {
    enum Key: Hashable {
        case digit(Int)
        case dot
        case clear
        case backspace
        case plusMinus
        case op(String) // +, −, ×, =
        case percent
        case save
    }

    @Environment(\.dismiss) private var dismiss

    // Displayed numeric string (e.g., 123.45). Keeps at most two decimals.
    @State private var amountString: String = "0"
    // Note field removed per updated minimalist design

    var onSave: ((Decimal, String, String?) -> Void)? = nil

    private let columns: [GridItem] = Array(repeating: GridItem(.flexible(), spacing: 12), count: 4)
    @State private var showSavedToast: Bool = false

    // Calculator engine state
    private enum Operation { case add, subtract, multiply, divide }
    @State private var currentValue: Decimal? = nil
    @State private var pendingOperation: Operation? = nil
    @State private var lastOperand: Decimal? = nil
    @State private var lastInputWasOperation: Bool = false
    @State private var lastEquation: String? = nil
    private enum EquationToken { case number(String), op(Operation), equals }
    @State private var equationTokens: [EquationToken] = []

    // Quick categories (fetched)
    @Query(sort: \Category.name) private var categories: [Category]
    @State private var selectedEmoji: String? = nil
    @Environment(\._currencyCode) private var currencyCode

    private var displayedEmojis: [String] {
        let fromDB = categories.prefix(5).map { $0.emoji }
        if !fromDB.isEmpty { return Array(fromDB) }
        return ["🍔","🛒","🚕","🏠","🎉"]
    }

    var body: some View {
        ZStack {
            Color(.black)
                .ignoresSafeArea()

            GeometryReader { proxy in
                let topHeight = proxy.size.height * 0.45
                let amountFontSize = min(proxy.size.width * 0.22, 120)
                let keyHeight = max(56, proxy.size.height * 0.064)

                VStack(spacing: 0) {
                    // Top half – centered amount
                    VStack(spacing: 8) {
                        equationTextView()
                        ZStack {
                            Text(formattedAmount())
                                .foregroundStyle(.white.opacity(0.16))
                                .offset(y: 8)
                            Text(formattedAmount())
                                .foregroundStyle(.white)
                        }
                        .font(Font.custom("AvenirNextCondensed-Heavy", size: amountFontSize))
                        .monospacedDigit()
                        .minimumScaleFactor(0.4)
                        .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: topHeight)
                    .padding(.horizontal, 20)

                    // Bottom half – keypad
                    VStack(spacing: 12) {
                        // Emoji quick row
                        HStack(spacing: 14) {
                            ForEach(displayedEmojis, id: \.self) { emoji in
                                Button(action: { selectedEmoji = emoji; Haptics.selection() }) {
                                    VStack(spacing: 4) {
                                        Text(emoji)
                                            .font(.system(size: 24))
                                        if selectedEmoji == emoji {
                                            Capsule()
                                                .fill(Color.orange)
                                                .frame(width: 16, height: 2)
                                        }
                                    }
                                    .frame(width: 36, height: 36)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.bottom, 4)

                        LazyVGrid(columns: columns, spacing: 16) {
                            key(.clear, label: "C", height: keyHeight)
                            key(.percent, label: "%", height: keyHeight)
                            keyIcon(.backspace, systemImage: "delete.left", height: keyHeight)
                            key(.op("÷"), label: "÷", height: keyHeight)

                            key(.digit(7), label: "7", height: keyHeight)
                            key(.digit(8), label: "8", height: keyHeight)
                            key(.digit(9), label: "9", height: keyHeight)
                            key(.op("×"), label: "×", height: keyHeight)

                            key(.digit(4), label: "4", height: keyHeight)
                            key(.digit(5), label: "5", height: keyHeight)
                            key(.digit(6), label: "6", height: keyHeight)
                            key(.op("−"), label: "−", height: keyHeight)

                            key(.digit(1), label: "1", height: keyHeight)
                            key(.digit(2), label: "2", height: keyHeight)
                            key(.digit(3), label: "3", height: keyHeight)
                            key(.op("+"), label: "+", height: keyHeight)

                            key(.digit(0), label: "0", height: keyHeight)
                            key(.dot, label: ".", height: keyHeight)
                            key(.plusMinus, label: "+/−", height: keyHeight)
                            key(.op("="), label: "=", height: keyHeight)
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
        .overlay(alignment: .topTrailing) {
            Button(action: { handleKey(.save) }) {
                Image(systemName: "checkmark")
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(.white.opacity(0.1), in: Capsule())
            }
            .padding(.top, 12)
            .padding(.trailing, 16)
        }
    }

    // MARK: - Key Builder

    private func key(_ key: Key, label: String, isEnabled: Bool = true, height: CGFloat = 72) -> some View {
        Button(action: { if isEnabled { handleKey(key) } }) {
            Text(label)
                .font(Font.custom(isOperator(key) ? "AvenirNextCondensed-DemiBold" : "AvenirNextCondensed-Medium", size: 24))
                .frame(maxWidth: .infinity, minHeight: height)
                .foregroundStyle(foregroundColor(for: key, isEnabled: isEnabled))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .accessibilityLabel(label)
    }

    private func keyIcon(_ key: Key, systemImage: String, isEnabled: Bool = true, height: CGFloat = 72) -> some View {
        Button(action: { if isEnabled { handleKey(key) } }) {
            Image(systemName: systemImage)
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                .frame(maxWidth: .infinity, minHeight: height)
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
        let symbol = CurrencyUtils.symbol(for: currencyCode)
        return symbol + prefix + display
    }

    private func handleKey(_ key: Key) {
        switch key {
        case .digit(let n):
            lastEquation = nil
            if lastInputWasOperation { amountString = "0"; lastInputWasOperation = false }
            appendDigit(n)
            syncCurrentNumberTokenWithAmountString()
            Haptics.light()
        case .dot:
            lastEquation = nil
            if lastInputWasOperation { amountString = "0"; lastInputWasOperation = false }
            appendDot()
            syncCurrentNumberTokenWithAmountString()
            Haptics.light()
        case .clear:
            clearAll()
            lastEquation = nil
            equationTokens.removeAll()
            Haptics.selection()
        case .backspace:
            lastEquation = nil
            backspace()
            // As requested, clear history when editing by backspace
            equationTokens.removeAll()
            syncCurrentNumberTokenWithAmountString()
            Haptics.light()
        case .plusMinus:
            lastEquation = nil
            toggleSign()
            syncCurrentNumberTokenWithAmountString()
            Haptics.selection()
        case .save:
            let decimal = Decimal(string: amountString) ?? 0
            onSave?(decimal, "", selectedEmoji)
            amountString = "0"
            equationTokens.removeAll()
            withAnimation(.spring(response: 0.35, dampingFraction: 0.9)) {
                showSavedToast = true
            }
            Haptics.success()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                withAnimation(.easeOut(duration: 0.25)) {
                    showSavedToast = false
                }
            }
        case .percent:
            lastEquation = nil
            applyPercent()
            syncCurrentNumberTokenWithAmountString()
            Haptics.light()
        case .op(let symbol):
            handleOperationSymbol(symbol)
            Haptics.selection()
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

    // MARK: - Calculator operations

    private func clearAll() {
        amountString = "0"
        currentValue = nil
        pendingOperation = nil
        lastOperand = nil
        lastInputWasOperation = false
        equationTokens.removeAll()
    }

    private func applyPercent() {
        let value = Decimal(string: amountString) ?? 0
        let result = value / 100
        amountString = string(from: result)
    }

    private func handleOperationSymbol(_ symbol: String) {
        if symbol == "=" {
            evaluateEquals()
            return
        }
        guard let op = operation(for: symbol) else { return }
        let operand = Decimal(string: amountString) ?? 0
        lastOperand = operand
        let newValue = applyPendingOperation(with: operand, operation: pendingOperation)
        currentValue = newValue
        pendingOperation = op
        amountString = string(from: newValue)
        lastInputWasOperation = true
        if equationTokens.isEmpty {
            equationTokens.append(.number(string(from: operand)))
        }
        if let last = equationTokens.last, case .op(_) = last {
            equationTokens.removeLast()
        }
        equationTokens.append(.op(op))
    }

    private func evaluateEquals() {
        let operand: Decimal
        if lastInputWasOperation, let last = lastOperand {
            operand = last
        } else {
            operand = Decimal(string: amountString) ?? 0
            lastOperand = operand
        }
        let opBefore = pendingOperation
        let lhsForEq = currentValue
        let result = applyPendingOperation(with: operand, operation: opBefore)
        currentValue = result
        pendingOperation = nil
        amountString = string(from: result)
        lastInputWasOperation = true
        if let opBefore, let lhs = lhsForEq {
            lastEquation = "\(string(from: lhs)) \(symbol(for: opBefore)) \(string(from: operand))"
            equationTokens.append(.equals)
            equationTokens.append(.number(string(from: result)))
        }
    }

    private func operation(for symbol: String) -> Operation? {
        switch symbol {
        case "+": return .add
        case "−": return .subtract
        case "×": return .multiply
        case "÷": return .divide
        default: return nil
        }
    }

    private func applyPendingOperation(with operand: Decimal, operation: Operation?) -> Decimal {
        let lhs = currentValue ?? operand
        guard let operation else { return operand }
        switch operation {
        case .add:
            return lhs + operand
        case .subtract:
            return lhs - operand
        case .multiply:
            return lhs * operand
        case .divide:
            if operand == 0 { return 0 }
            return lhs / operand
        }
    }

    private func string(from decimal: Decimal) -> String {
        let number = NSDecimalNumber(decimal: decimal)
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 2
        formatter.usesGroupingSeparator = false
        formatter.decimalSeparator = "."
        return formatter.string(from: number) ?? "0"
    }

    private func symbol(for op: Operation) -> String {
        switch op {
        case .add: return "+"
        case .subtract: return "−"
        case .multiply: return "×"
        case .divide: return "÷"
        }
    }

    private func topEquationText() -> String? {
        if let op = pendingOperation, let lhs = currentValue {
            if lastInputWasOperation {
                return "\(string(from: lhs)) \(symbol(for: op))"
            } else {
                return "\(string(from: lhs)) \(symbol(for: op)) \(amountString)"
            }
        }
        return lastEquation
    }

    // Build styled equation line
    @ViewBuilder private func equationTextView() -> some View {
        if !equationTokens.isEmpty {
            let text: Text = equationTokens.reduce(Text("") as Text) { partial, token in
                partial + tokenText(token)
            }
            text
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                .lineLimit(1)
                .minimumScaleFactor(0.5)
        } else if let eq = topEquationText() {
            Text(eq)
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                .foregroundStyle(.white.opacity(0.7))
                .lineLimit(1)
                .minimumScaleFactor(0.5)
        }
    }

    private func tokenText(_ token: EquationToken) -> Text {
        switch token {
        case .number(let s):
            return Text(s).foregroundStyle(.white.opacity(0.7)) + Text(" ")
        case .op(let op):
            return Text(symbol(for: op)).foregroundStyle(.orange) + Text(" ")
        case .equals:
            return Text("=").foregroundStyle(.orange) + Text(" ")
        }
    }

    private func syncCurrentNumberTokenWithAmountString() {
        if equationTokens.isEmpty {
            equationTokens.append(.number(amountString))
        } else {
            if case .number(_) = equationTokens.last {
                equationTokens.removeLast()
                equationTokens.append(.number(amountString))
            } else if case .equals = equationTokens.last {
                equationTokens.removeAll()
                equationTokens.append(.number(amountString))
            } else {
                equationTokens.append(.number(amountString))
            }
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


