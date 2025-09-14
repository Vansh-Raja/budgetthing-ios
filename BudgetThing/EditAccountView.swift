import SwiftUI
import SwiftData

struct EditAccountView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    let account: Account

    @State private var name: String = ""
    @State private var emoji: String = ""
    @State private var kind: Account.Kind = .cash
    // For edit: we let users set the desired current balance (cash/bank only)
    @State private var openingBalance: String = "" // legacy; no longer edited here
    @State private var currentBalanceText: String = ""
    @State private var limitAmount: String = ""

    var body: some View {
        ZStack {
            Color(.black).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 16) {
                Text("Edit Account")
                    .font(Font.custom("AvenirNextCondensed-Heavy", size: 30))
                    .foregroundStyle(.white)

                HStack(spacing: 12) {
                    Text(emoji.isEmpty ? "🧾" : emoji).font(.system(size: 28))
                    TextField("Name", text: $name)
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 22))
                        .foregroundStyle(.white)
                }
                .padding(.vertical, 8)

                Picker("Type", selection: $kind) {
                    ForEach(Account.Kind.allCases, id: \.self) { k in
                        Text(k.rawValue.capitalized).tag(k)
                    }
                }
                .pickerStyle(.segmented)

                Group {
                    // Emoji choices (curated)
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Emoji")
                            .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                            .foregroundStyle(.white.opacity(0.7))
                        let cash = ["💵","💰","🪙","🧧","💶","💴"]
                        let bank = ["🏦","🏛️","🏧","🪪","🏦"]
                        let credit = ["💳","💸","🧾","🔁","💠"]
                        // Deterministic order and unique values
                        let raw = (cash + bank + credit)
                        let all = raw.reduce(into: [String]()) { acc, e in if !acc.contains(e) { acc.append(e) } }
                        LazyVGrid(columns: Array(repeating: GridItem(.fixed(36), spacing: 10), count: 8), spacing: 10) {
                            ForEach(Array(all.enumerated()), id: \.offset) { _, e in
                                Button(action: { emoji = e; Haptics.selection() }) {
                                    Text(e)
                                        .font(.system(size: 22))
                                        .frame(width: 36, height: 36)
                                        .background(emoji == e ? Color.white.opacity(0.15) : Color.clear)
                                        .clipShape(RoundedRectangle(cornerRadius: 8))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    if kind == .credit {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Limit:")
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                                .foregroundStyle(.white.opacity(0.7))
                            TextField("Limit (optional)", text: $limitAmount)
                                .keyboardType(.decimalPad)
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                                .foregroundStyle(.white)
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Current Balance:")
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                                .foregroundStyle(.white.opacity(0.7))
                            TextField("Enter current balance", text: $currentBalanceText)
                                .keyboardType(.decimalPad)
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                                .foregroundStyle(.white)
                            Text("Adjusts via an automatic balance adjustment entry.")
                                .font(.footnote)
                                .foregroundStyle(.white.opacity(0.6))
                        }
                    }
                }

                Spacer()

                HStack {
                    Button(role: .destructive) { deleteAccount() } label: {
                        Text("Delete")
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    Spacer()
                }
            }
            .padding(24)
        }
        .preferredColorScheme(.dark)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { Button(action: { dismiss() }) { Image(systemName: "chevron.left") } }
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: save) {
                    Text("Save")
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                }
            }
        }
        .onAppear { bootstrap() }
        .onChange(of: kind) { old, new in
            if new == .credit { currentBalanceText = "" } else { limitAmount = ""; currentBalanceText = deriveBalanceString() }
        }
    }

    private func dec(_ s: String) -> Decimal? { s.trimmingCharacters(in: .whitespaces).isEmpty ? nil : Decimal(string: s) }

    private func bootstrap() {
        name = account.name
        emoji = account.emoji
        kind = account.kindEnum
        openingBalance = account.openingBalance.map { NSDecimalNumber(decimal: $0).stringValue } ?? ""
        limitAmount = account.limitAmount.map { NSDecimalNumber(decimal: $0).stringValue } ?? ""
        if kind != .credit { currentBalanceText = deriveBalanceString() }
    }

    private func save() {
        account.name = name.trimmingCharacters(in: .whitespaces)
        account.emoji = emoji
        account.kind = kind.rawValue
        // For credit: keep limit editable; for cash/bank: openingBalance remains unchanged here
        account.openingBalance = (kind == .credit) ? nil : account.openingBalance
        account.limitAmount = (kind == .credit) ? dec(limitAmount) : nil
        account.updatedAt = .now

        // Handle balance adjustment for cash/bank
        if kind != .credit {
            if let target = dec(currentBalanceText) {
                let current = deriveBalance()
                let delta = target - current
                if delta != 0 {
                    let tx = Transaction(
                        amount: abs(delta),
                        date: .now,
                        note: "Balance adjustment · \(account.name)",
                        category: nil,
                        account: account,
                        type: delta > 0 ? "income" : "expense"
                    )
                    modelContext.insert(tx)
                } else {
                    // No-op change; keep but do not create a transaction
                    Haptics.warning()
                }
            }
        }
        Haptics.success()
        dismiss()
    }

    private func deleteAccount() {
        // MVP: disallow delete if any transactions reference it
        let targetId = account.id
        var fd = FetchDescriptor<Transaction>()
        fd.predicate = #Predicate { $0.account?.id == targetId }
        fd.fetchLimit = 1
        if let items = try? modelContext.fetch(fd), !items.isEmpty {
            // referenced by at least one transaction; block delete
            Haptics.warning()
            return
        }
        modelContext.delete(account)
        Haptics.success()
        dismiss()
    }

    // MARK: - Helpers
    private func deriveBalance() -> Decimal {
        let targetId = account.id
        var fd = FetchDescriptor<Transaction>()
        fd.predicate = #Predicate { $0.account?.id == targetId }
        let items = (try? modelContext.fetch(fd)) ?? []
        let expenses = items.filter { ($0.typeRaw ?? "expense") != "income" }
            .reduce(0 as Decimal) { $0 + $1.amount }
        let incomes = items.filter { ($0.typeRaw ?? "expense") == "income" }
            .reduce(0 as Decimal) { $0 + $1.amount }
        return (account.openingBalance ?? 0) + incomes - expenses
    }

    private func deriveBalanceString() -> String {
        let n = NSDecimalNumber(decimal: deriveBalance())
        return n.stringValue
    }
}


