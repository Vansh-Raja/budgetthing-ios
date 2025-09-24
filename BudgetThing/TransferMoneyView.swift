import SwiftUI
import SwiftData

struct TransferMoneyView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @Query(sort: [SortDescriptor(\Account.sortIndex), SortDescriptor(\Account.name)]) private var accounts: [Account]
    @State private var from: Account?
    @State private var to: Account?
    @State private var amountText: String = ""
    @State private var errorToast: String? = nil

    var body: some View {
        ZStack { Color.black.ignoresSafeArea() }
            .overlay(
                VStack(alignment: .leading, spacing: 16) {
                    HStack {
                        Text("Transfer")
                            .font(Font.custom("AvenirNextCondensed-Heavy", size: 32))
                            .foregroundStyle(.white)
                        Spacer()
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("From")
                            .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16)).foregroundStyle(.white.opacity(0.7))
                        Picker("From", selection: Binding(get: { from?.id }, set: { id in from = accounts.first(where: { $0.id == id }) })) {
                            ForEach(accounts) { acc in Text(acc.name).tag(acc.id as UUID?) }
                        }
                        .pickerStyle(.navigationLink)
                        .tint(.orange)
                        .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("To")
                            .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16)).foregroundStyle(.white.opacity(0.7))
                        Picker("To", selection: Binding(get: { to?.id }, set: { id in to = accounts.first(where: { $0.id == id }) })) {
                            ForEach(accounts) { acc in Text(acc.name).tag(acc.id as UUID?) }
                        }
                        .pickerStyle(.navigationLink)
                        .tint(.orange)
                        .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Amount")
                            .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16)).foregroundStyle(.white.opacity(0.7))
                        TextField("0", text: $amountText)
                            .keyboardType(.decimalPad)
                            .padding(.horizontal, 12)
                            .frame(height: 48)
                            .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                            .foregroundStyle(.white)
                    }

                    HStack { Spacer()
                        Button(action: save) {
                            Text("Transfer")
                                .foregroundStyle(.white)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 10)
                                .background(.white.opacity(0.12), in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .disabled(!canSave)
                    }
                    Spacer()
                }
                .padding(24)
            )
            .overlay(alignment: .top) {
                if let msg = errorToast {
                    Text(msg)
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(.white.opacity(0.12), in: Capsule())
                        .transition(.move(edge: .top).combined(with: .opacity))
                        .padding(.top, 16)
                        .padding(.horizontal, 16)
                        }
            }
            .preferredColorScheme(.dark)
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button(action: { dismiss() }) { Image(systemName: "chevron.left") } } }
            .onAppear {
                if from == nil { from = accounts.first }
                if to == nil { to = accounts.dropFirst().first ?? accounts.first }
            }
    }

    private var canSave: Bool {
        guard let from, let to else { return false }
        if from.id == to.id { return false }
        return Decimal(string: amountText.trimmingCharacters(in: .whitespaces)) ?? 0 > 0
    }

    private func save() {
        guard let from, let to else { return }
        let trimmed = amountText.trimmingCharacters(in: .whitespaces)
        guard let amount = Decimal(string: trimmed), amount > 0 else {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.9)) { errorToast = "Amount must be greater than 0" }
            Haptics.error()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) { withAnimation(.easeOut(duration: 0.25)) { errorToast = nil } }
            return
        }
        if from.id == to.id {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.9)) { errorToast = "From and To accounts must be different" }
            Haptics.error()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) { withAnimation(.easeOut(duration: 0.25)) { errorToast = nil } }
            return
        }
        let note = "Transferred from \(from.name) to \(to.name)"
        let tx = Transaction(
            amount: amount,
            date: .now,
            note: note,
            category: nil,
            account: nil, // single row, not tied to one account
            type: nil,
            system: "transfer",
            transferFromAccountId: from.id,
            transferToAccountId: to.id
        )
        modelContext.insert(tx)
        Haptics.success()
        dismiss()
    }
}


