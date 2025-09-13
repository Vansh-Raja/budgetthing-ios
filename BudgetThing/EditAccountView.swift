import SwiftUI
import SwiftData

struct EditAccountView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    let account: Account

    @State private var name: String = ""
    @State private var emoji: String = ""
    @State private var kind: Account.Kind = .cash
    @State private var openingBalance: String = ""
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
                    TextField("Opening balance (optional)", text: $openingBalance)
                        .keyboardType(.decimalPad)
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                        .foregroundStyle(.white)
                    TextField("Limit (optional)", text: $limitAmount)
                        .keyboardType(.decimalPad)
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                        .foregroundStyle(.white)
                }

                Spacer()

                HStack {
                    Button(role: .destructive) { deleteAccount() } label: {
                        Text("Delete")
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity)
                    }
                    Button(action: save) {
                        Text("Save")
                            .foregroundStyle(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(.white.opacity(0.12), in: Capsule())
                    }
                }
            }
            .padding(24)
        }
        .preferredColorScheme(.dark)
        .toolbar { ToolbarItem(placement: .topBarLeading) { Button(action: { dismiss() }) { Image(systemName: "chevron.left") } } }
        .onAppear { bootstrap() }
    }

    private func dec(_ s: String) -> Decimal? { s.trimmingCharacters(in: .whitespaces).isEmpty ? nil : Decimal(string: s) }

    private func bootstrap() {
        name = account.name
        emoji = account.emoji
        kind = account.kindEnum
        openingBalance = account.openingBalance.map { NSDecimalNumber(decimal: $0).stringValue } ?? ""
        limitAmount = account.limitAmount.map { NSDecimalNumber(decimal: $0).stringValue } ?? ""
    }

    private func save() {
        account.name = name.trimmingCharacters(in: .whitespaces)
        account.emoji = emoji
        account.kind = kind.rawValue
        account.openingBalance = dec(openingBalance)
        account.limitAmount = dec(limitAmount)
        account.updatedAt = .now
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
}


