import SwiftUI
import SwiftData

struct AddAccountView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    @State private var name: String = ""
    @State private var emoji: String = "💵"
    @State private var kind: Account.Kind = .cash
    @State private var openingBalance: String = ""
    @State private var limitAmount: String = ""

    var body: some View {
        ZStack {
            Color(.black).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 16) {
                Text("Add Account")
                    .font(Font.custom("AvenirNextCondensed-Heavy", size: 30))
                    .foregroundStyle(.white)

                HStack(spacing: 12) {
                    Text(emoji).font(.system(size: 28))
                    TextField("Name", text: $name)
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 22))
                        .foregroundStyle(.white)
                        .textInputAutocapitalization(.words)
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
                            Text("Leave empty for unlimited credit.")
                                .font(.footnote)
                                .foregroundStyle(.white.opacity(0.6))
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Starting Balance:")
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                                .foregroundStyle(.white.opacity(0.7))
                            TextField("Opening balance (optional)", text: $openingBalance)
                                .keyboardType(.decimalPad)
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                                .foregroundStyle(.white)
                            Text("Leave empty to start from 0.")
                                .font(.footnote)
                                .foregroundStyle(.white.opacity(0.6))
                        }
                    }
                }

                Spacer()
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
                .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .onChange(of: kind) { old, new in
            if new == .credit { openingBalance = "" } else { limitAmount = "" }
        }
    }

    private func dec(from s: String) -> Decimal? {
        guard !s.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        return Decimal(string: s)
    }

    private func save() {
        let opening = (kind == .credit) ? nil : dec(from: openingBalance)
        let limit = (kind == .credit) ? dec(from: limitAmount) : nil
        let acc = Account(name: name.trimmingCharacters(in: .whitespaces), emoji: emoji, kind: kind, openingBalance: opening, limitAmount: limit)
        modelContext.insert(acc)
        if UserDefaults.standard.string(forKey: "defaultAccountID") == nil {
            UserDefaults.standard.set(acc.id.uuidString, forKey: "defaultAccountID")
        }
        Haptics.success()
        dismiss()
    }
}


