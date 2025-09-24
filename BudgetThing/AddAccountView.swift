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
    @State private var showEmojiSheet: Bool = false

    var body: some View {
        ZStack {
            Color(.black).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 16) {
                Text("Add Account")
                    .font(Font.custom("AvenirNextCondensed-Heavy", size: 30))
                    .foregroundStyle(.white)

                HStack(spacing: 12) {
                    Button(action: { showEmojiSheet = true }) {
                        Text(emoji).font(.system(size: 28))
                    }
                    .buttonStyle(.plain)
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
                    // Emoji grid removed; use sheet for consistency

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
        .sheet(isPresented: $showEmojiSheet) {
            AccountEmojiPickerSheetView(selection: $emoji, kind: kind)
                .presentationDetents([.large])
        }
        .onChange(of: kind) { old, new in
            if new == .credit { openingBalance = "" } else { limitAmount = "" }
            // Reset default emoji to first available for the type if current isn't valid
            let valid: [String] = AccountEmojiCatalog.list(for: new)
            if !valid.contains(emoji), let first = valid.first { emoji = first }
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


