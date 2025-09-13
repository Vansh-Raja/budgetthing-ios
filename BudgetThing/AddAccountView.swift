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
                    TextField("Opening balance (optional)", text: $openingBalance)
                        .keyboardType(.decimalPad)
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                        .foregroundStyle(.white)
                    TextField("Limit (optional)", text: $limitAmount)
                        .keyboardType(.decimalPad)
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                        .foregroundStyle(.white)
                    Text("Leave empty for no cap / no balance tracking.")
                        .font(.footnote)
                        .foregroundStyle(.white.opacity(0.6))
                }

                Spacer()

                Button(action: save) {
                    Text("Save")
                        .foregroundStyle(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(.white.opacity(0.12), in: Capsule())
                }
                .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding(24)
        }
        .preferredColorScheme(.dark)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { Button(action: { dismiss() }) { Image(systemName: "chevron.left") } }
        }
    }

    private func dec(from s: String) -> Decimal? {
        guard !s.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        return Decimal(string: s)
    }

    private func save() {
        let acc = Account(name: name.trimmingCharacters(in: .whitespaces), emoji: emoji, kind: kind, openingBalance: dec(from: openingBalance), limitAmount: dec(from: limitAmount))
        modelContext.insert(acc)
        if UserDefaults.standard.string(forKey: "defaultAccountID") == nil {
            UserDefaults.standard.set(acc.id.uuidString, forKey: "defaultAccountID")
        }
        Haptics.success()
        dismiss()
    }
}


