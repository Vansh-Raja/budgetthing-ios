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
    @State private var showDeleteDialog: Bool = false
    @State private var pendingDeleteCount: Int = 0
    @State private var actionToast: String? = nil
    @State private var showEmojiSheet: Bool = false

    var body: some View {
        ZStack {
            Color(.black).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 16) {
                Text("Edit Account")
                    .font(Font.custom("AvenirNextCondensed-Heavy", size: 30))
                    .foregroundStyle(.white)

                HStack(spacing: 12) {
                    Button(action: { showEmojiSheet = true }) {
                        Text(emoji.isEmpty ? "🧾" : emoji).font(.system(size: 28))
                    }
                    .buttonStyle(.plain)
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
                    Button {
                        // Set as default account
                        UserDefaults.standard.set(account.id.uuidString, forKey: "defaultAccountID")
                        Haptics.success()
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.9)) { actionToast = "Default set" }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                            withAnimation(.easeOut(duration: 0.25)) { actionToast = nil }
                        }
                    } label: {
                        Text("Set as Default Account")
                            .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.15), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
                
                HStack {
                    Button(role: .destructive) {
                        Haptics.selection()
                        let n = DeletionCoordinator.countTransactions(for: account, in: modelContext)
                        pendingDeleteCount = n
                        showDeleteDialog = true
                    } label: {
                        Text("Delete Account")
                            .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.15), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(24)
        }
        .preferredColorScheme(.dark)
        .overlay(alignment: .top) {
            if let msg = actionToast {
                Text(msg)
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(.white.opacity(0.08), in: Capsule())
                    .padding(.top, 16)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .confirmationDialog("Delete Account?", isPresented: $showDeleteDialog, titleVisibility: .visible) {
            Button("Delete account and all related transactions (\(pendingDeleteCount))", role: .destructive) {
                do {
                    _ = try DeletionCoordinator.deleteAccount(account, mode: .deleteAll, in: modelContext)
                    Haptics.success()
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.9)) { actionToast = "Deleted" }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { dismiss() }
                } catch {
                    Haptics.error()
                }
            }
            Button("Keep transactions; remove account (\(pendingDeleteCount))") {
                do {
                    _ = try DeletionCoordinator.deleteAccount(account, mode: .detach, in: modelContext)
                    Haptics.success()
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.9)) { actionToast = "Deleted" }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { dismiss() }
                } catch {
                    Haptics.error()
                }
            }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("This cannot be undone.")
        }
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
        .sheet(isPresented: $showEmojiSheet) {
            AccountEmojiPickerSheetView(selection: $emoji, kind: kind)
                .presentationDetents([.large])
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


