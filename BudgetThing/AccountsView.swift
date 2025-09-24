import SwiftUI
import SwiftData

struct AccountsView: View {
    @Binding var tabSelection: Int
    @Query(sort: [SortDescriptor(\Account.sortIndex), SortDescriptor(\Account.name)]) private var accounts: [Account]
    @Query(sort: \Transaction.date, order: .reverse) private var txs: [Transaction]
    @Environment(\._currencyCode) private var currencyCode
    @State private var showingManage: Bool = false

    var body: some View {
        ZStack {
            Color(.black).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .center) {
                    Text("Accounts")
                        .font(Font.custom("AvenirNextCondensed-Heavy", size: 36))
                        .foregroundStyle(.white)
                    Spacer()
                    Button(action: { Haptics.selection(); showingTransfer = true }) {
                        Text("Transfer")
                            .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(.white.opacity(0.08), in: Capsule())
                    }
                    .buttonStyle(.plain)
                    Button(action: { Haptics.selection(); selectedAccount = nil; showingManage = true }) {
                        Text("Manage")
                            .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(.white.opacity(0.08), in: Capsule())
                    }
                    .buttonStyle(.plain)
                }

                if accounts.isEmpty {
                    VStack(spacing: 10) {
                        Text("No accounts yet")
                            .font(Font.custom("AvenirNextCondensed-Heavy", size: 28))
                            .foregroundStyle(.white)
                        Button(action: { Haptics.selection(); showingManage = true }) {
                            Text("Add in Settings")
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(.white.opacity(0.08), in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                } else {
                    ScrollView {
                        VStack(spacing: 12) {
                            ForEach(accounts) { acc in
                                Button(action: { Haptics.selection(); selectedAccount = acc }) {
                                    accountCard(acc)
                                }
                                .buttonStyle(.plain)
                                .disabled(showingManage)
                                .contextMenu {
                                    Button("Set as default") {
                                        UserDefaults.standard.set(acc.id.uuidString, forKey: "defaultAccountID")
                                        Haptics.success()
                                    }
                                }
                            }
                        }
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(24)
        }
        .preferredColorScheme(.dark)
        .overlay(alignment: .bottom) {
            if selectedAccount == nil && !showingManage {
                FloatingPageSwitcher(selection: $tabSelection)
                    .padding(.bottom, 18)
            }
        }
        // iOS 18+ has .homeIndicatorAutoHidden; for broader support skip hiding here
        .fullScreenCover(isPresented: $showingManage) {
            NavigationStack { AccountsManageView() }
        }
        .fullScreenCover(isPresented: $showingTransfer) {
            NavigationStack { TransferMoneyView() }
        }
        .fullScreenCover(item: $selectedAccount) { acc in
            NavigationStack { AccountDetailView(account: acc) }
        }
    }

    @State private var selectedAccount: Account? = nil
    @State private var showDetail: Bool = false
    @State private var showingTransfer: Bool = false

    private func accountCard(_ acc: Account) -> some View {
        // Expenses and incomes for this account, include transfer single-row logic
        let expensesAll = txs.filter { ($0.account?.id == acc.id) || (($0.systemRaw ?? "").contains("transfer") && $0.transferFromAccountId == acc.id) }
            .filter { ($0.typeRaw ?? "expense") != "income" || ($0.systemRaw ?? "").contains("transfer") }
            .reduce(0 as Decimal) { $0 + $1.amount }
        let incomesAll = txs.filter { ($0.account?.id == acc.id) || (($0.systemRaw ?? "").contains("transfer") && $0.transferToAccountId == acc.id) }
            .filter { ($0.typeRaw ?? "expense") == "income" || ($0.systemRaw ?? "").contains("transfer") }
            .reduce(0 as Decimal) { $0 + $1.amount }

        // Display value depends on kind
        let displayValue: Decimal? = {
            switch acc.kindEnum {
            case .cash, .bank:
                // Balance = opening + incomes − expenses
                return (acc.openingBalance ?? 0) + incomesAll - expensesAll
            case .credit:
                // Available = limit − expenses + refunds (incomes)
                guard let limit = acc.limitAmount else { return nil }
                return limit - expensesAll + incomesAll
            }
        }()

        // Spent in current window: for credit, current billing cycle; else calendar month
        let cal = Calendar.current
        let now = Date()
        let inWindow: (Transaction) -> Bool = { tx in
            if acc.kindEnum == .credit, let day = acc.billingCycleDay, (1...28).contains(day) {
                let start = AccountsView.billingCycleStart(from: now, day: day)
                let end = AccountsView.billingCycleEnd(from: now, day: day)
                return (tx.date >= start && tx.date < end)
            } else {
                return cal.isDate(tx.date, equalTo: now, toGranularity: .month)
            }
        }
        let spentThisMonth = txs.filter { ( ($0.account?.id == acc.id) || (($0.systemRaw ?? "").contains("transfer") && $0.transferFromAccountId == acc.id) ) && inWindow($0) && ( (($0.typeRaw ?? "expense") != "income") || ($0.systemRaw ?? "").contains("transfer") ) }
            .reduce(0 as Decimal) { $0 + $1.amount }

        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                Text(acc.emoji.isEmpty ? "🧾" : acc.emoji)
                    .font(.system(size: 22))
                    .frame(width: 36, height: 36)
                Text(acc.name)
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 22))
                    .foregroundStyle(.white)
                Spacer()
                if let displayValue {
                    Text(formattedAmount(displayValue))
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                        .foregroundStyle(displayValue < 0 ? .red : .white.opacity(0.85))
                }
            }
            Text(acc.kindEnum == .credit && acc.billingCycleDay != nil ? "Spent \(formattedAmount(spentThisMonth)) this billing cycle" : "Spent \(formattedAmount(spentThisMonth)) this month")
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.6))
        }
        .padding(14)
        .background(.white.opacity(0.10), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.12), lineWidth: 1))
    }

    private func formattedAmount(_ amount: Decimal) -> String {
        let symbol = CurrencyUtils.symbol(for: currencyCode)
        let n = NSDecimalNumber(decimal: amount)
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.minimumFractionDigits = 0
        f.maximumFractionDigits = 2
        f.usesGroupingSeparator = true
        let digits = f.string(from: n) ?? "0"
        return symbol + digits
    }

    // MARK: - Billing cycle helpers
    static func billingCycleStart(from reference: Date, day: Int) -> Date {
        let cal = Calendar.current
        var comps = cal.dateComponents([.year, .month], from: reference)
        // If today is before the billing day, cycle started last month
        let todayDay = cal.component(.day, from: reference)
        if todayDay < day {
            if let prev = cal.date(byAdding: .month, value: -1, to: reference) {
                comps = cal.dateComponents([.year, .month], from: prev)
            }
        }
        comps.day = day
        comps.hour = 0; comps.minute = 0; comps.second = 0
        return cal.date(from: comps) ?? reference
    }

    static func billingCycleEnd(from reference: Date, day: Int) -> Date {
        let cal = Calendar.current
        let start = billingCycleStart(from: reference, day: day)
        return cal.date(byAdding: .month, value: 1, to: start) ?? reference
    }
}


