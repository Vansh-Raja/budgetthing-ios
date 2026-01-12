//
//  TransactionsListView.swift
//  BudgetThing
//

import SwiftUI
import SwiftData

struct TransactionsListView: View {
    @Binding var tabSelection: Int
    @Query(sort: \Transaction.date, order: .reverse) private var txs: [Transaction]
    @Query(sort: \Account.sortIndex) private var accounts: [Account]
    @Query(sort: \Category.sortIndex) private var categories: [Category]
    @State private var path = NavigationPath()
    @Environment(\._currencyCode) private var currencyCode
    @EnvironmentObject private var deepLinkRouter: DeepLinkRouter
    @Environment(\.modelContext) private var modelContext
    @State private var showingDetail: Bool = false
    @State private var selectedTx: Transaction? = nil
    @State private var selectedMonthKey: String? = nil // "YYYY-MM" or nil for All
    // Account filtering removed per new Accounts detail flow
    @State private var isSelecting: Bool = false
    @State private var selectedIds: Set<UUID> = []
    @State private var confirmDelete: Bool = false
    @State private var showMoveAccount: Bool = false
    @State private var showChangeCategory: Bool = false
    @State private var errorToast: String? = nil

    var body: some View {
        ZStack {
            Color(.black).ignoresSafeArea()

            NavigationStack(path: $path) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 12) {
                        Text("Transactions")
                            .font(Font.custom("AvenirNextCondensed-Heavy", size: 36))
                            .foregroundStyle(.white)
                        Spacer()
                        Button(action: {
                            withAnimation(.easeInOut(duration: 0.15)) {
                                isSelecting.toggle()
                                if !isSelecting { selectedIds.removeAll() }
                            }
                            Haptics.selection()
                        }) {
                            Text(isSelecting ? "Cancel" : "Select")
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                                .foregroundStyle(.white.opacity(0.9))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(Color.white.opacity(0.10), in: Capsule())
                                .overlay(Capsule().stroke(Color.white.opacity(0.15), lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }

                    // Month filter chips
                    if !txs.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                monthChip(title: "All", isSelected: selectedMonthKey == nil) {
                                    selectedMonthKey = nil; Haptics.selection()
                                }
                                ForEach(allMonthSections(), id: \.id) { m in
                                    monthChip(title: m.title, isSelected: selectedMonthKey == m.id) {
                                        selectedMonthKey = m.id; Haptics.selection()
                                    }
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }

                    if txs.isEmpty {
                        VStack(spacing: 12) {
                            Text("No transactions yet")
                                .font(Font.custom("AvenirNextCondensed-Heavy", size: 28))
                                .foregroundStyle(.white)
                            Text("Add an amount on the calculator and tap the checkmark to save.")
                                .font(.callout)
                                .multilineTextAlignment(.center)
                                .foregroundStyle(.white.opacity(0.7))
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                    } else {
                        List {
                            ForEach(monthSectionsFiltered(), id: \.id) { section in
                                Section(
                                    header:
                                        HStack {
                                            Text(section.title)
                                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                                                .foregroundStyle(.white)
                                            Spacer()
                                            Text(formattedAmount(section.total))
                                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                                                .foregroundStyle(.white.opacity(0.8))
                                        }
                                        .padding(.vertical, 4)
                                        .textCase(nil)
                                ) {
                                    ForEach(section.items) { tx in
                                        Button(action: {
                                            if isSelecting {
                                                toggleSelection(tx.id)
                                            } else {
                                                selectedTx = tx
                                                showingDetail = true
                                                Haptics.selection()
                                            }
                                        }) {
                                            HStack(spacing: 8) {
                                                if isSelecting {
                                                    selectionIndicator(for: tx)
                                                        .frame(width: 24, alignment: .center)
                                                }
                                                if (tx.systemRaw ?? "").contains("adjustment") {
                                                    // System adjustment: yellow gear with colored ring (green income / orange expense)
                                                    ZStack {
                                                        Circle()
                                                            .stroke(((tx.typeRaw ?? "expense") == "income") ? Color.green : Color.orange, lineWidth: 1.6)
                                                            .frame(width: 18, height: 18)
                                                        Image(systemName: "gearshape.fill")
                                                            .font(.system(size: 11, weight: .bold))
                                                            .foregroundStyle(.yellow)
                                                    }
                                                    .frame(width: 24, height: 18, alignment: .center)
                                                } else if (tx.systemRaw ?? "").contains("transfer") {
                                                    ZStack {
                                                        Circle().stroke(Color.blue, lineWidth: 1.6).frame(width: 18, height: 18)
                                                        Text("⇅").font(.system(size: 11, weight: .bold)).foregroundStyle(.blue)
                                                    }
                                                    .frame(width: 24, height: 18)
                                                } else if tx.effectiveDisplayInfo().isIncome {
                                                    // Income (including trip expenses where user gets money back)
                                                    Text("+")
                                                        .font(.system(size: 14, weight: .bold))
                                                        .foregroundStyle(.green)
                                                        .frame(width: 24, alignment: .center)
                                                } else if let emoji = tx.category?.emoji, !emoji.isEmpty {
                                                    Text(emoji)
                                                        .font(.system(size: 16))
                                                        .frame(width: 24, alignment: .center)
                                                } else {
                                                    Circle()
                                                        .fill(Color.white.opacity(0.25))
                                                        .frame(width: 6, height: 6)
                                                        .frame(width: 24, alignment: .center)
                                                }
                                                VStack(alignment: .leading, spacing: 2) {
                                                    let displayInfo = tx.effectiveDisplayInfo()
                                                    Text(formattedAmount(displayInfo.amount))
                                                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 20))
                                                        .foregroundStyle((tx.systemRaw ?? "").contains("transfer") ? .blue : (tx.systemRaw ?? "").contains("adjustment") ? .yellow : displayInfo.isIncome ? .green : .white)
                                                    Text(tx.date, style: .date)
                                                        .font(.system(size: 12))
                                                        .foregroundStyle(.white.opacity(0.6))
                                                }
                                                Spacer()
                                                if !isSelecting {
                                                    Image(systemName: "chevron.right")
                                                        .foregroundStyle(.white.opacity(0.25))
                                                }
                                            }
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                            .contentShape(Rectangle())
                                        }
                                        .buttonStyle(.plain)
                                        .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
                                        .listRowBackground(Color.clear)
                                        .overlay(
                                            Group {
                                                if isSelecting && selectedIds.contains(tx.id) {
                                                    RoundedRectangle(cornerRadius: 8)
                                                        .stroke(Color.orange.opacity(0.5), lineWidth: 1)
                                                }
                                            }
                                        )
                                    }
                                }
                            }
                        }
                        .listStyle(.plain)
                        .listSectionSpacing(.compact)
                        .listRowSeparator(.hidden)
                        .scrollContentBackground(.hidden)
                    }

                    Spacer(minLength: 0)
                }
                .padding(24)
                .background(Color.black)
            }
            .scrollContentBackground(.hidden)
            .fullScreenCover(isPresented: $showingDetail) {
                if let tx = selectedTx {
                    NavigationStack { TransactionDetailView(item: tx) }
                        .background(
                            Color.clear
                                .contentShape(Rectangle())
                                .gesture(
                                    DragGesture(minimumDistance: 20)
                                        .onEnded { value in
                                            // Only dismiss if primarily vertical downward drag
                                            let isVertical = abs(value.translation.height) > abs(value.translation.width)
                                            if isVertical && value.translation.height > 80 { showingDetail = false }
                                        }
                                )
                        )
                }
            }
        }
        .preferredColorScheme(.dark)
        .overlay(alignment: .top) {
            if let msg = errorToast {
                Text(msg)
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Color.black.opacity(0.8), in: Capsule())
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .padding(.top, 14)
            }
        }
        .overlay(alignment: .bottom) {
            if isSelecting {
                let selectedTxs = txs.filter { selectedIds.contains($0.id) }
                let hasIncome = selectedTxs.contains { ($0.typeRaw ?? "expense") == "income" }
                let hasTransfer = selectedTxs.contains { ($0.systemRaw ?? "").contains("transfer") }
                let hasAdjustment = selectedTxs.contains { ($0.systemRaw ?? "").contains("adjustment") }
                let canChangeCategory = !hasIncome && !hasTransfer && !hasAdjustment && !selectedTxs.isEmpty
                let canMoveAccount = !hasTransfer && !selectedTxs.isEmpty

                SelectionActionsPill(
                    selectedCount: selectedIds.count,
                    deleteAction: { confirmDelete = true },
                    moveToAccountAction: {
                        if canMoveAccount { showMoveAccount = true }
                        else {
                            showDisabledToast("Cannot change account for transfer transactions.")
                        }
                    },
                    changeCategoryAction: {
                        if canChangeCategory { showChangeCategory = true }
                        else {
                            showDisabledToast("Cannot change category for income, transfer, or adjustment transactions.")
                        }
                    },
                    canMoveToAccount: canMoveAccount,
                    canChangeCategory: canChangeCategory
                )
                .padding(.bottom, 18)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            } else if path.isEmpty && !showingDetail {
                FloatingPageSwitcher(selection: $tabSelection)
                    .padding(.bottom, 18)
            }
        }
        .onChange(of: deepLinkRouter.transactionTrigger) { _, _ in
            if let id = deepLinkRouter.openTransactionId, let tx = txs.first(where: { $0.id == id }) {
                selectedTx = tx
                showingDetail = true
            }
        }
        .confirmationDialog("Delete \(selectedIds.count) item(s)?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { performDelete() }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("This action cannot be undone.")
        }
        .sheet(isPresented: $showMoveAccount) {
            moveToAccountSheet()
                .presentationDetents([.medium])
        }
        .sheet(isPresented: $showChangeCategory) {
            changeCategorySheet()
                .presentationDetents([.medium])
        }
        // Keep default home indicator; cannot style its appearance
    }

    private func formattedAmount(_ amount: Decimal) -> String {
        let symbol = CurrencyUtils.symbol(for: currencyCode)
        let number = NSDecimalNumber(decimal: amount)
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.minimumFractionDigits = 0
        f.maximumFractionDigits = 2
        f.usesGroupingSeparator = true
        let digits = f.string(from: number) ?? "0"
        return symbol + digits
    }

    // MARK: - Grouping
    private struct MonthSectionModel: Hashable {
        let id: String
        let title: String
        let total: Decimal
        let items: [Transaction]
    }

    private func allMonthSections() -> [MonthSectionModel] {
        guard !txs.isEmpty else { return [] }
        let cal = Calendar.current
        let df = DateFormatter()
        df.calendar = cal
        df.locale = Locale.current
        df.dateFormat = "LLLL yyyy"

        // Filter out transactions that should be hidden (not included in trip splits)
        let visibleTxs = txs.filter { !$0.effectiveDisplayInfo().shouldHide }

        var groups: [String: [Transaction]] = [:]
        for tx in visibleTxs { // visibleTxs already sorted desc by date
            let comps = cal.dateComponents([.year, .month], from: tx.date)
            let key = String(format: "%04d-%02d", comps.year ?? 0, comps.month ?? 0)
            groups[key, default: []].append(tx)
        }

        // Sort keys by date desc matching txs order
        let sortedKeys = groups.keys.sorted(by: >)
        return sortedKeys.compactMap { key in
            guard let first = groups[key]?.first else { return nil }
            let monthStart = cal.date(from: cal.dateComponents([.year, .month], from: first.date)) ?? first.date
            let title = df.string(from: monthStart)
            let items = groups[key] ?? []
            // Total uses effectiveAmount (user's share for trip expenses)
            // Excludes income-type transactions (including trip expenses where user gets money back)
            let total = items
                .filter { tx in
                    let info = tx.effectiveDisplayInfo()
                    // Exclude income and transfers from spending total
                    return !info.isIncome && !(tx.systemRaw ?? "").contains("transfer")
                }
                .reduce(0 as Decimal) { $0 + $1.effectiveAmount }
            return MonthSectionModel(id: key, title: title, total: total, items: items)
        }
    }

    private func monthSectionsFiltered() -> [MonthSectionModel] {
        let all = allMonthSections()
        guard let key = selectedMonthKey else { return all }
        return all.filter { $0.id == key }
    }

    // MARK: - UI helpers
    private func monthChip(title: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isSelected ? Color.white.opacity(0.18) : Color.white.opacity(0.08), in: Capsule())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Selection helpers
    private func toggleSelection(_ id: UUID) {
        if selectedIds.contains(id) {
            selectedIds.remove(id)
        } else {
            selectedIds.insert(id)
        }
    }

    @ViewBuilder private func selectionIndicator(for tx: Transaction) -> some View {
        let isOn: Bool = selectedIds.contains(tx.id)
        ZStack {
            Circle()
                .stroke(isOn ? Color.orange : Color.white.opacity(0.3), lineWidth: 1.5)
                .frame(width: 16, height: 16)
            if isOn {
                Circle()
                    .fill(Color.orange)
                    .frame(width: 10, height: 10)
            }
        }
    }

    private func performDelete() {
        guard !selectedIds.isEmpty else { return }
        let targets = txs.filter { tx in selectedIds.contains(tx.id) }
        for t in targets { modelContext.delete(t) }
        try? modelContext.save()
        selectedIds.removeAll()
        withAnimation(.easeInOut(duration: 0.2)) { isSelecting = false }
        Haptics.success()
    }

    private func showDisabledToast(_ message: String) {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.9)) {
            errorToast = message
        }
        Haptics.error()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
            withAnimation(.easeOut(duration: 0.25)) { errorToast = nil }
        }
    }

    // MARK: - Bulk edit sheets
    @ViewBuilder private func moveToAccountSheet() -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Move to account")
                .font(Font.custom("AvenirNextCondensed-Heavy", size: 22))
                .foregroundStyle(.white)
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(accounts) { account in
                        Button(action: {
                            applyMoveToAccount(account)
                        }) {
                            HStack(spacing: 10) {
                                Text(account.emoji.isEmpty ? "🧾" : account.emoji)
                                Text(account.name)
                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                                Spacer()
                            }
                            .foregroundStyle(.white)
                            .padding(.vertical, 8)
                        }
                        .buttonStyle(.plain)
                        Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1)
                    }
                }
            }
        }
        .padding(16)
        .background(Color.black.ignoresSafeArea())
    }

    private func applyMoveToAccount(_ account: Account) {
        guard !selectedIds.isEmpty else { return }
        let targets = txs.filter { selectedIds.contains($0.id) }
        for t in targets {
            t.account = account
        }
        try? modelContext.save()
        Haptics.success()
        showMoveAccount = false
        selectedIds.removeAll()
        withAnimation(.easeInOut(duration: 0.2)) { isSelecting = false }
    }

    @ViewBuilder private func changeCategorySheet() -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Change category")
                .font(Font.custom("AvenirNextCondensed-Heavy", size: 22))
                .foregroundStyle(.white)
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(categories) { category in
                        Button(action: {
                            applyChangeCategory(category)
                        }) {
                            HStack(spacing: 10) {
                                Text(category.emoji)
                                Text(category.name)
                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                                Spacer()
                            }
                            .foregroundStyle(.white)
                            .padding(.vertical, 8)
                        }
                        .buttonStyle(.plain)
                        Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1)
                    }
                }
            }
        }
        .padding(16)
        .background(Color.black.ignoresSafeArea())
    }

    private func applyChangeCategory(_ category: Category) {
        guard !selectedIds.isEmpty else { return }
        let targets = txs.filter { selectedIds.contains($0.id) }
        for t in targets {
            // Avoid changing system transfer rows
            if (t.systemRaw ?? "").contains("transfer") { continue }
            t.category = category
        }
        try? modelContext.save()
        Haptics.success()
        showChangeCategory = false
        selectedIds.removeAll()
        withAnimation(.easeInOut(duration: 0.2)) { isSelecting = false }
    }
}

// MARK: - Selection Actions Pill
private struct SelectionActionsPill: View {
    let selectedCount: Int
    let deleteAction: () -> Void
    let moveToAccountAction: () -> Void
    let changeCategoryAction: () -> Void
    let canMoveToAccount: Bool
    let canChangeCategory: Bool

    var body: some View {
        HStack(spacing: 14) {
            Text("\(selectedCount)")
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                .foregroundStyle(.white)
                .padding(.horizontal, 10)
                .frame(height: 34)
                .background(Color.white.opacity(0.10), in: Capsule())
                .overlay(Capsule().stroke(Color.white.opacity(0.15), lineWidth: 1))
            Spacer(minLength: 6)
            // Move to Account
            Button(action: moveToAccountAction) {
                Image(systemName: "arrow.left.arrow.right")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 34, height: 34)
                    .background(Color.white.opacity(0.10), in: Capsule())
                    .overlay(Capsule().stroke(Color.white.opacity(0.15), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .opacity((selectedCount == 0 || !canMoveToAccount) ? 0.35 : 1)
            // Change Category
            Button(action: changeCategoryAction) {
                Image(systemName: "tag")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 34, height: 34)
                    .background(Color.white.opacity(0.10), in: Capsule())
                    .overlay(Capsule().stroke(Color.white.opacity(0.15), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .opacity((selectedCount == 0 || !canChangeCategory) ? 0.35 : 1)
            // Delete
            Button(action: deleteAction) {
                Image(systemName: "trash")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.red)
                    .frame(width: 34, height: 34)
                    .background(Color.white.opacity(0.10), in: Capsule())
                    .overlay(Capsule().stroke(Color.white.opacity(0.15), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .disabled(selectedCount == 0)
            .opacity(selectedCount == 0 ? 0.5 : 1)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(
            ZStack {
                Capsule().fill(.ultraThinMaterial)
                Capsule().fill(Color.black.opacity(0.55))
            }
        )
        .overlay(Capsule().stroke(.white.opacity(0.15), lineWidth: 1))
        .padding(.horizontal, 20)
    }
}

#Preview {
    TransactionsListView(tabSelection: .constant(1))
        .modelContainer(for: [Category.self, Transaction.self], inMemory: true)
}



