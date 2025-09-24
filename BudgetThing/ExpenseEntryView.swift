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

    var onSave: ((Decimal, String, String?, UUID?, String?) -> Void)? = nil

    private let columns: [GridItem] = Array(repeating: GridItem(.flexible(), spacing: 12), count: 4)
    @State private var showSavedToast: Bool = false
    @State private var showNoteField: Bool = false
    @State private var noteText: String = ""
    @FocusState private var noteFieldFocused: Bool

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
    @Query(sort: \Category.sortIndex) private var categories: [Category]
    @Query(sort: \Account.sortIndex) private var accounts: [Account]
    @State private var selectedEmoji: String? = nil
    @Environment(\._currencyCode) private var currencyCode
    @Environment(\.prefillCategoryId) private var prefillCategoryId
    @State private var errorToast: String? = nil
    @AppStorage("defaultAccountID") private var defaultAccountIDStr: String?
    @AppStorage("sessionSelectedAccountID") private var sessionSelectedAccountIDStr: String?
    @State private var selectedAccountID: UUID? = nil
    @State private var showAccountDropdown: Bool = false
    private enum EntryMode { case expense, income }
    @State private var mode: EntryMode = .expense
    // Unified pill sizing for the top controls
    private let pillHeight: CGFloat = 36
    private let pillHorizontalPadding: CGFloat = 12

    private var displayedEmojis: [String] {
        let fromDB = categories.map { $0.emoji }.filter { !$0.isEmpty }
        if !fromDB.isEmpty { return Array(fromDB.prefix(10)) }
        return ["🍔","🛒","🚕","🏠","🎉"]
    }

    var body: some View {
        ZStack {
            Color(.black)
                .ignoresSafeArea()

            GeometryReader { proxy in
                let topHeight = proxy.size.height * 0.42
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
                    .padding(.top,75)
                    .frame(height: topHeight)
                    .padding(.horizontal, 20)

                    // Bottom half – keypad
                    VStack(spacing: 12) {
                        // Note affordance button (overlay popup)
                        HStack { Spacer(minLength: 0)
                            Button(action: {
                                withAnimation(.easeInOut(duration: 0.15)) { showNoteField.toggle() }
                                Haptics.selection()
                            }) {
                                HStack(spacing: 6) {
                                    Image(systemName: "note.text")
                                        .font(.system(size: 12, weight: .semibold))
                                    Image(systemName: "chevron.right")
                                        .font(.system(size: 10, weight: .semibold))
                                }
                                .padding(.horizontal, 10)
                                .frame(height: 24)
                                .foregroundStyle(noteText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .white.opacity(0.55) : .orange)
                                .background(Color.white.opacity(0.10), in: Capsule())
                                .overlay(Capsule().stroke(Color.white.opacity(0.15), lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                            Spacer(minLength: 0) }
                        .overlay(alignment: .center) {
                            if showNoteField {
                                HStack(spacing: 8) {
                                    Image(systemName: "note.text")
                                        .foregroundStyle(.white.opacity(0.8))
                                    TextField("Add note", text: $noteText)
                                        .textInputAutocapitalization(.sentences)
                                        .disableAutocorrection(false)
                                        .focused($noteFieldFocused)
                                        .foregroundStyle(.white)
                                        .onAppear { noteFieldFocused = true }
                                        .onSubmit { withAnimation(.easeOut(duration: 0.15)) { showNoteField = false } }
                                    if !noteText.isEmpty {
                                        Button(action: { noteText = ""; Haptics.selection() }) {
                                            Image(systemName: "xmark.circle.fill")
                                                .foregroundStyle(.white.opacity(0.7))
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                                .padding(.horizontal, 12)
                                .frame(height: 40)
                                .background(Color.black.opacity(0.9), in: RoundedRectangle(cornerRadius: 12))
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.12), lineWidth: 1))
                                .shadow(color: .black.opacity(0.6), radius: 12, x: 0, y: 8)
                                .transition(.scale.combined(with: .opacity))
                                .zIndex(2)
                            }
                        }
                        .zIndex(1)
                        // Emoji quick row (auto-fit up to 10, centered)
                        emojiRow(availableWidth: proxy.size.width - 40)
                        .padding(.top, 5)
                        .padding(.bottom, 4)
                        .opacity(mode == .income ? 0.4 : 1.0)

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
            // Tap outside to dismiss note overlay
            if showNoteField {
                Color.black.opacity(0.0001)
                    .ignoresSafeArea()
                    .contentShape(Rectangle())
                    .onTapGesture {
                        withAnimation(.easeOut(duration: 0.15)) { showNoteField = false }
                        noteFieldFocused = false
                    }
            }
        }
        .preferredColorScheme(.dark)
        .ignoresSafeArea(.keyboard)
        .onAppear {
            if let sid = sessionSelectedAccountIDStr, let uuid = UUID(uuidString: sid) {
                selectedAccountID = uuid
            } else if let s = defaultAccountIDStr, let uuid = UUID(uuidString: s) {
                selectedAccountID = uuid
            } else if selectedAccountID == nil {
                selectedAccountID = accounts.first?.id
            }
            // Prefill category selection for deep link
            if let targetId = prefillCategoryId, let match = categories.first(where: { $0.id == targetId }) {
                selectedEmoji = match.emoji
            }
        }
        .overlay(alignment: .top) {
            VStack(alignment: .center, spacing: 6) {
                ZStack(alignment: .trailing) {
                    HStack(spacing: 10) {
                        modeToggle()
                        Spacer(minLength: 0)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    // Centered pill across full width
                    accountPill()
                        .frame(maxWidth: .infinity, alignment: .center)
                    // Trailing save button
                    Button(action: { handleKey(.save) }) {
                        Image(systemName: "checkmark")
                            .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                            .foregroundStyle(.white)
                            .padding(.horizontal, pillHorizontalPadding)
                            .frame(height: pillHeight)
                            .background(.white.opacity(0.1), in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
                .frame(height: pillHeight)
                if showAccountDropdown { accountDropdown().padding(.top, 2) }
                if showSavedToast {
                    Text(mode == .income ? "Added" : "Saved")
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(.white.opacity(0.08), in: Capsule())
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
                if let msg = errorToast {
                    Text(msg)
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(.white.opacity(0.12), in: Capsule())
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .padding(.top, 16)
            .padding(.horizontal, 16)
        }
        .contentShape(Rectangle())
        .onTapGesture {
            if showAccountDropdown { withAnimation(.easeOut(duration: 0.2)) { showAccountDropdown = false } }
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
            // Also clear note and dismiss the note field
            noteText = ""
            showNoteField = false
            noteFieldFocused = false
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
            if decimal == 0 {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.9)) {
                    errorToast = "Enter an amount greater than 0 to save."
                }
                Haptics.error()
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
                    withAnimation(.easeOut(duration: 0.25)) { errorToast = nil }
                }
                return
            }
            let txType = (mode == .income) ? "income" : "expense"
            let cat = (mode == .income) ? nil : selectedEmoji
            let note = noteText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : noteText.trimmingCharacters(in: .whitespacesAndNewlines)
            onSave?(decimal, txType, cat, selectedAccountID, note)
            amountString = "0"
            equationTokens.removeAll()
            noteText = ""
            showNoteField = false
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

    // MARK: - Accounts UI
    private func accountPill() -> some View {
        let current: Account? = accounts.first(where: { $0.id == selectedAccountID }) ?? accounts.first
        let title = current.map { ($0.emoji.isEmpty ? "🧾" : $0.emoji) + " " + $0.name } ?? "Select Account"
        let isInteractive = accounts.count > 1
        return Button(action: {
            guard isInteractive else { return }
            withAnimation(.spring(response: 0.3, dampingFraction: 0.9)) { showAccountDropdown.toggle() }
            Haptics.selection()
        }) {
            Text(title)
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                .foregroundStyle(.white.opacity(isInteractive ? 1.0 : 0.8))
                .padding(.horizontal, pillHorizontalPadding)
                .frame(height: pillHeight)
                .background(.white.opacity(0.12), in: Capsule())
                .overlay(
                    Capsule().stroke(.white.opacity(0.15), lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .disabled(!isInteractive)
    }

    private func accountDropdown() -> some View {
        VStack(spacing: 0) {
            ForEach(accounts) { acc in
                Button(action: {
                    selectedAccountID = acc.id
                    sessionSelectedAccountIDStr = acc.id.uuidString
                    withAnimation(.easeOut(duration: 0.2)) { showAccountDropdown = false }
                    Haptics.selection()
                }) {
                    HStack {
                        Text(acc.emoji.isEmpty ? "🧾" : acc.emoji)
                            .font(.system(size: 18))
                        Text(acc.name)
                            .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                        Spacer()
                        if acc.id == selectedAccountID {
                            Capsule()
                                .fill(Color.orange)
                                .frame(width: 16, height: 2)
                        }
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if acc.id != accounts.last?.id {
                    Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1)
                }
            }
        }
        .frame(maxWidth: 260)
        // Less transparency to avoid conflicting with the amount display behind
        .background(Color.black.opacity(0.9), in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.12), lineWidth: 1)
        )
    }

    // MARK: - Emoji Row
    @ViewBuilder private func emojiRow(availableWidth: CGFloat) -> some View {
        let emojis = Array(displayedEmojis.prefix(10))
        let count = emojis.count
        let baseItem: CGFloat = 36
        let baseFont: CGFloat = 24
        let baseSpacing: CGFloat = 14
        let needed = CGFloat(max(0, count)) * baseItem + CGFloat(max(0, count - 1)) * baseSpacing
        let scale: CGFloat = count > 0 ? min(1.0, availableWidth / needed) : 1.0

        HStack(spacing: baseSpacing * scale) {
            ForEach(emojis, id: \.self) { emoji in
                Button(action: { selectedEmoji = emoji; Haptics.selection() }) {
                    VStack(spacing: 4 * scale) {
                        Text(emoji)
                            .font(.system(size: baseFont * scale))
                        if selectedEmoji == emoji {
                            Capsule()
                                .fill(Color.orange)
                                .frame(width: 16 * scale, height: 2 * scale)
                        }
                    }
                    .frame(width: baseItem * scale, height: baseItem * scale)
                }
                .buttonStyle(.plain)
                .disabled(mode == .income)
            }
        }
        .frame(maxWidth: .infinity, alignment: .center)
    }

    // MARK: - Mode Toggle
    private func modeToggle() -> some View {
        HStack(spacing: 0) {
            Button(action: { withAnimation(.easeInOut(duration: 0.15)) { mode = .expense }; Haptics.selection() }) {
                Text("−")
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                    .foregroundStyle(mode == .expense ? .orange : .white.opacity(0.8))
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Button(action: { withAnimation(.easeInOut(duration: 0.15)) { mode = .income }; Haptics.selection() }) {
                Text("+")
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                    .foregroundStyle(mode == .income ? .green : .white.opacity(0.8))
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 8)
        .frame(height: pillHeight)
        .background(.white.opacity(0.12), in: Capsule())
        .overlay(Capsule().stroke(.white.opacity(0.15), lineWidth: 1))
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


