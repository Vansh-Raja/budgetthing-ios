import SwiftUI
import SwiftData

struct AccountsManageView: View {
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \Account.name) private var accounts: [Account]
    @Query(sort: \Transaction.date) private var txs: [Transaction]
    @State private var selectedAccount: Account? = nil
    @State private var showingAdd: Bool = false

    var body: some View {
        ZStack {
            Color(.black).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 16) {
                Text("Manage Accounts")
                    .font(Font.custom("AvenirNextCondensed-Heavy", size: 30))
                    .foregroundStyle(.white)

                List {
                    ForEach(accounts) { acc in
                        Button(action: { selectedAccount = acc; Haptics.selection() }) {
                            HStack(spacing: 12) {
                                Text(acc.emoji.isEmpty ? "🧾" : acc.emoji)
                                    .font(.system(size: 22))
                                    .frame(width: 36, height: 36)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(acc.name)
                                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 22))
                                        .foregroundStyle(.white)
                                    Text(acc.kindEnum.rawValue.capitalized)
                                        .font(.system(size: 12))
                                        .foregroundStyle(.white.opacity(0.6))
                                }
                                Spacer()
                                if let available = availableFor(acc) {
                                    Text(formattedAvailable(available))
                                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                                        .foregroundStyle(available < 0 ? .red : .white.opacity(0.8))
                                }
                                Button(action: {
                                    UserDefaults.standard.set(acc.id.uuidString, forKey: "defaultAccountID")
                                    Haptics.success()
                                }) {
                                    Text("Default")
                                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
                                        .foregroundStyle(.white)
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 4)
                                        .background(.white.opacity(0.10), in: Capsule())
                                }
                                .buttonStyle(.plain)
                                Image(systemName: "chevron.right")
                                    .foregroundStyle(.white.opacity(0.25))
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                        .listRowBackground(Color.clear)
                    }
                    Button(action: { showingAdd = true; Haptics.selection() }) {
                        HStack { Spacer(); Text("Add  +").font(Font.custom("AvenirNextCondensed-DemiBold", size: 20)).foregroundStyle(.white) }
                            .frame(maxWidth: .infinity, alignment: .trailing)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(Color.clear)
                }
                .listStyle(.plain)
                .listRowSeparator(.hidden)
                .scrollContentBackground(.hidden)

                Spacer()
            }
            .padding(24)
        }
        .preferredColorScheme(.dark)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.black, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button(action: { dismiss() }) { Image(systemName: "chevron.left") }
            }
        }
        .fullScreenCover(item: $selectedAccount) { acc in
            NavigationStack { EditAccountView(account: acc) }
        }
        .fullScreenCover(isPresented: $showingAdd) {
            NavigationStack { AddAccountView() }
        }
    }

    private func availableFor(_ acc: Account) -> Decimal? {
        let expensesAll = txs.filter { $0.account?.id == acc.id && (($0.typeRaw ?? "expense") != "income") }
            .reduce(0 as Decimal) { $0 + $1.amount }
        let incomesAll = txs.filter { $0.account?.id == acc.id && (($0.typeRaw ?? "expense") == "income") }
            .reduce(0 as Decimal) { $0 + $1.amount }
        switch acc.kindEnum {
        case .cash, .bank:
            return (acc.openingBalance ?? 0) + incomesAll - expensesAll
        case .credit:
            guard let limit = acc.limitAmount else { return nil }
            return limit - expensesAll + incomesAll
        }
    }

    private func formattedAvailable(_ value: Decimal) -> String {
        let n = NSDecimalNumber(decimal: value)
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.minimumFractionDigits = 0
        f.maximumFractionDigits = 2
        f.usesGroupingSeparator = true
        return f.string(from: n) ?? "0"
    }
}


