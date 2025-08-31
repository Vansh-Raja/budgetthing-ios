import SwiftUI

/// A minimal, calculator-first expense entry UI for iOS (SwiftUI).
/// The view focuses on fast numeric input while staying simple and glanceable.
public struct ExpenseEntryView: View {
    @State private var viewModel: ExpenseEntryViewModel = ExpenseEntryViewModel()
    public var currencySymbol: String
    public var title: String
    public var onSave: (Double) -> Void

    public init(
        currencySymbol: String = "$",
        title: String = "Add Expense",
        onSave: @escaping (Double) -> Void
    ) {
        self.currencySymbol = currencySymbol
        self.title = title
        self.onSave = onSave
    }

    public var body: some View {
        ZStack {
            Color.black.edgesIgnoringSafeArea(.all)

            VStack(spacing: 16) {
                header
                amountArea
                keypad
                saveButton
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 20)
        }
    }

    private var header: some View {
        HStack {
            Text(title)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(.white.opacity(0.9))
            Spacer()
            Text(viewModel.expressionLine)
                .font(.system(size: 14, weight: .medium, design: .rounded))
                .foregroundStyle(.white.opacity(0.6))
                .lineLimit(1)
        }
    }

    private var amountArea: some View {
        VStack(spacing: 8) {
            Text("\(currencySymbol)")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(.white.opacity(0.8))

            // Large amount display inspired by the reference
            Text(viewModel.formattedAmount)
                .font(.system(size: 72, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
                .minimumScaleFactor(0.5)
                .lineLimit(1)
                .shadow(color: .black.opacity(0.6), radius: 6, x: 0, y: 4)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Color(red: 0.12, green: 0.12, blue: 0.12))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.white.opacity(0.06), lineWidth: 1)
        )
    }

    private var keypad: some View {
        let columns: [GridItem] = Array(repeating: GridItem(.flexible(), spacing: 12), count: 4)

        return LazyVGrid(columns: columns, spacing: 12) {
            KeypadButton(label: "C", role: .function, action: { viewModel.clearAll() })
            KeypadButton(label: "%", role: .function, action: { viewModel.applyPercent() })
            KeypadButton(systemName: "delete.left", role: .function, action: { viewModel.backspace() })
            KeypadButton(label: "÷", role: .operator, action: { viewModel.applyOperator(.divide) })

            KeypadButton(label: "7", action: { viewModel.appendDigit("7") })
            KeypadButton(label: "8", action: { viewModel.appendDigit("8") })
            KeypadButton(label: "9", action: { viewModel.appendDigit("9") })
            KeypadButton(label: "×", role: .operator, action: { viewModel.applyOperator(.multiply) })

            KeypadButton(label: "4", action: { viewModel.appendDigit("4") })
            KeypadButton(label: "5", action: { viewModel.appendDigit("5") })
            KeypadButton(label: "6", action: { viewModel.appendDigit("6") })
            KeypadButton(label: "−", role: .operator, action: { viewModel.applyOperator(.subtract) })

            KeypadButton(label: "1", action: { viewModel.appendDigit("1") })
            KeypadButton(label: "2", action: { viewModel.appendDigit("2") })
            KeypadButton(label: "3", action: { viewModel.appendDigit("3") })
            KeypadButton(label: "+", role: .operator, action: { viewModel.applyOperator(.add) })

            KeypadButton(label: "+/−", role: .function, action: { viewModel.toggleSign() })
            KeypadButton(label: "0", action: { viewModel.appendDigit("0") })
            KeypadButton(label: ".", action: { viewModel.appendDecimal() })
            KeypadButton(label: "=", role: .operator, isAccent: true, action: { viewModel.evaluate() })
        }
    }

    private var saveButton: some View {
        Button(action: {
            onSave(viewModel.currentAmount)
        }) {
            HStack {
                Image(systemName: "tray.and.arrow.down.fill")
                Text("Save Expense")
                    .fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .foregroundStyle(.black)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color.yellow)
            )
        }
        .padding(.top, 4)
        .disabled(viewModel.currentAmount == 0)
        .opacity(viewModel.currentAmount == 0 ? 0.6 : 1)
    }
}

// MARK: - View Model

public final class ExpenseEntryViewModel: ObservableObject {
    public enum PendingOperator {
        case add
        case subtract
        case multiply
        case divide
    }

    @Published public private(set) var displayString: String = "0"
    @Published public private(set) var expressionLine: String = ""

    public private(set) var currentAmount: Double = 0
    private var accumulator: Double? = nil
    private var pendingOperator: PendingOperator? = nil
    private var isEnteringDecimal: Bool = false
    private var hasTypedSinceOperator: Bool = false

    public init() {}

    public var formattedAmount: String {
        return displayString
    }

    // MARK: - Input Handlers

    public func appendDigit(_ digit: String) {
        guard digit.count == 1, digit.first!.isNumber else { return }
        if displayString == "0" || (!hasTypedSinceOperator && pendingOperator != nil && !isEnteringDecimal) {
            displayString = digit
        } else {
            displayString.append(digit)
        }
        hasTypedSinceOperator = true
        syncCurrentAmountFromDisplay()
    }

    public func appendDecimal() {
        guard isEnteringDecimal == false else { return }
        if hasTypedSinceOperator == false {
            displayString = "0"
        }
        displayString.append(".")
        isEnteringDecimal = true
    }

    public func backspace() {
        if displayString.count <= 1 {
            displayString = "0"
            isEnteringDecimal = false
            syncCurrentAmountFromDisplay()
            return
        }
        if displayString.last == "." {
            isEnteringDecimal = false
        }
        displayString.removeLast()
        syncCurrentAmountFromDisplay()
    }

    public func toggleSign() {
        if displayString == "0" { return }
        if displayString.hasPrefix("-") {
            displayString.removeFirst()
        } else {
            displayString = "-" + displayString
        }
        syncCurrentAmountFromDisplay()
    }

    public func clearAll() {
        displayString = "0"
        expressionLine = ""
        currentAmount = 0
        accumulator = nil
        pendingOperator = nil
        isEnteringDecimal = false
        hasTypedSinceOperator = false
    }

    public func applyPercent() {
        let value = (Double(displayString) ?? 0) / 100.0
        displayString = sanitizedString(for: value)
        syncCurrentAmountFromDisplay()
    }

    public func applyOperator(_ op: PendingOperator) {
        if let existing = pendingOperator, let acc = accumulator, hasTypedSinceOperator {
            let combined = evaluateBinary(acc, existing, currentAmount)
            accumulator = combined
            displayString = sanitizedString(for: combined)
            currentAmount = combined
        } else if accumulator == nil {
            accumulator = currentAmount
        }
        pendingOperator = op
        hasTypedSinceOperator = false
        isEnteringDecimal = false
        expressionLine = buildExpressionLine()
    }

    public func evaluate() {
        guard let op = pendingOperator, let acc = accumulator else { return }
        let result = evaluateBinary(acc, op, currentAmount)
        displayString = sanitizedString(for: result)
        currentAmount = result
        accumulator = nil
        pendingOperator = nil
        hasTypedSinceOperator = false
        isEnteringDecimal = false
        expressionLine = ""
    }

    // MARK: - Helpers

    private func evaluateBinary(_ lhs: Double, _ op: PendingOperator, _ rhs: Double) -> Double {
        switch op {
        case .add:
            return lhs + rhs
        case .subtract:
            return lhs - rhs
        case .multiply:
            return lhs * rhs
        case .divide:
            if rhs == 0 { return lhs }
            return lhs / rhs
        }
    }

    private func syncCurrentAmountFromDisplay() {
        currentAmount = Double(displayString) ?? 0
    }

    private func sanitizedString(for value: Double) -> String {
        if value.rounded() == value {
            return String(Int(value))
        }
        let formatter = NumberFormatter()
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 6
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }

    private func buildExpressionLine() -> String {
        guard let op = pendingOperator else { return "" }
        let opSymbol: String
        switch op {
        case .add: opSymbol = "+"
        case .subtract: opSymbol = "−"
        case .multiply: opSymbol = "×"
        case .divide: opSymbol = "÷"
        }
        let base = accumulator ?? currentAmount
        return "\(sanitizedString(for: base)) \(opSymbol)"
    }
}

// MARK: - Keypad Button

private enum KeyRole {
    case digit
    case `operator`
    case function
}

private struct KeypadButton: View {
    var label: String?
    var systemName: String?
    var role: KeyRole = .digit
    var isAccent: Bool = false
    var action: () -> Void

    init(label: String, role: KeyRole = .digit, isAccent: Bool = false, action: @escaping () -> Void) {
        self.label = label
        self.systemName = nil
        self.role = role
        self.isAccent = isAccent
        self.action = action
    }

    init(systemName: String, role: KeyRole = .function, isAccent: Bool = false, action: @escaping () -> Void) {
        self.label = nil
        self.systemName = systemName
        self.role = role
        self.isAccent = isAccent
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(backgroundColor)
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(.white.opacity(0.06), lineWidth: 1)

                if let systemName = systemName {
                    Image(systemName: systemName)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(foregroundColor)
                } else {
                    Text(label ?? "")
                        .font(.system(size: 22, weight: .semibold, design: .rounded))
                        .foregroundStyle(foregroundColor)
                }
            }
            .frame(height: 56)
        }
        .buttonStyle(.plain)
    }

    private var backgroundColor: Color {
        if isAccent { return Color.yellow }
        switch role {
        case .digit: return Color(red: 0.18, green: 0.18, blue: 0.18)
        case .operator: return Color(red: 0.27, green: 0.20, blue: 0.03)
        case .function: return Color(red: 0.14, green: 0.14, blue: 0.14)
        }
    }

    private var foregroundColor: Color {
        if isAccent { return .black }
        switch role {
        case .digit: return .white
        case .operator: return Color.yellow
        case .function: return .white.opacity(0.9)
        }
    }
}

// MARK: - Preview

#if DEBUG
struct ExpenseEntryView_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            ExpenseEntryView(onSave: { _ in })
                .preferredColorScheme(.dark)
            ExpenseEntryView(currencySymbol: "₹", title: "New Expense", onSave: { _ in })
                .preferredColorScheme(.dark)
        }
    }
}
#endif


