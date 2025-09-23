//
//  RootPagerView.swift
//  BudgetThing
//

import SwiftUI
import SwiftData

struct RootPagerView: View {
    @Environment(\.modelContext) private var modelContext
    @State private var selection: Int = 0
    @AppStorage("hasSeenOnboarding") private var hasSeenOnboarding: Bool = false
    @State private var showOnboarding: Bool = false
    @EnvironmentObject private var deepLinkRouter: DeepLinkRouter
    @State private var expensePrefillCategoryId: UUID? = nil
    @State private var openTransactionId: UUID? = nil
    @State private var widgetRefreshDebounce: DispatchWorkItem? = nil

    var body: some View {
        TabView(selection: $selection) {
            ExpenseEntryView { amount, type, categoryEmoji, selectedAccountId in
                var foundCategory: Category? = nil
                var foundAccount: Account? = nil
                // Resolve category by emoji
                if let emoji = categoryEmoji, type != "income" {
                    var fd = FetchDescriptor<Category>()
                    fd.fetchLimit = 1
                    fd.predicate = #Predicate { $0.emoji == emoji }
                    if let match = try? modelContext.fetch(fd).first { foundCategory = match }
                }
                // Resolve chosen account if provided; otherwise fall back to default → first
                if let aid = selectedAccountId {
                    var af = FetchDescriptor<Account>()
                    af.fetchLimit = 1
                    af.predicate = #Predicate { $0.id == aid }
                    if let acc = try? modelContext.fetch(af).first { foundAccount = acc }
                } else if let defaultId = UserDefaults.standard.string(forKey: "defaultAccountID"), let uuid = UUID(uuidString: defaultId) {
                    var af = FetchDescriptor<Account>()
                    af.fetchLimit = 1
                    af.predicate = #Predicate { $0.id == uuid }
                    if let acc = try? modelContext.fetch(af).first { foundAccount = acc }
                } else {
                    // Fallback to first account
                    var af = FetchDescriptor<Account>()
                    af.fetchLimit = 1
                    if let acc = try? modelContext.fetch(af).first { foundAccount = acc }
                }
                let tx = Transaction(amount: amount, date: .now, note: nil, category: foundCategory, account: foundAccount, type: type)
                modelContext.insert(tx)
                // Do NOT overwrite user's default account here; default is set from Manage Accounts.
                // Update widgets snapshot after save
                WidgetBridge.publishSnapshots(context: modelContext)
            }
            .environment(\.prefillCategoryId, expensePrefillCategoryId)
            .tag(0)
            .onChange(of: deepLinkRouter.calculatorTrigger) { _, _ in
                // Preselect category on ExpenseEntryView via environment value
                expensePrefillCategoryId = deepLinkRouter.calculatorCategoryId
            }

            TransactionsListView(tabSelection: $selection)
                .tag(1)

            AccountsView(tabSelection: $selection)
                .tag(2)

            SettingsView(tabSelection: $selection)
                .tag(3)
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .background(Color.black)
        .ignoresSafeArea()
        .onAppear {
            seedDefaultCategoriesIfNeeded(modelContext)
            seedDefaultAccountIfNeeded(modelContext)
            if !hasSeenOnboarding { showOnboarding = true }
            // Publish initial snapshots for widgets
            WidgetBridge.publishSnapshots(context: modelContext)
            // Move periodic refresh to coordinator to avoid state mutation during updates
            WidgetRefreshCoordinator.shared.start(context: modelContext)
        }
        .onDisappear { WidgetRefreshCoordinator.shared.stop() }
        .onChange(of: deepLinkRouter.transactionTrigger) { _, _ in
            openTransactionId = deepLinkRouter.openTransactionId
            // Switch to transactions tab and present detail
            selection = 1
        }
        .fullScreenCover(isPresented: $showOnboarding) {
            OnboardingView {
                hasSeenOnboarding = true
                showOnboarding = false
            }
        }
    }
}
private extension RootPagerView { }

#Preview {
    RootPagerView()
        .modelContainer(for: [Category.self, Transaction.self], inMemory: true)
}

// MARK: - Floating Page Switcher

struct FloatingPageSwitcher: View {
    @Binding var selection: Int

    var body: some View {
        HStack(spacing: 18) {
            switchButton(icon: "dollarsign.circle", tag: 0)
            dividerDot()
            switchButton(icon: "list.bullet", tag: 1)
            dividerDot()
            switchButton(icon: "creditcard", tag: 2)
            dividerDot()
            switchButton(icon: "gearshape", tag: 3)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(
            ZStack {
                Capsule().fill(.ultraThinMaterial)
                Capsule().fill(Color.black.opacity(0.55))
            }
        )
        .overlay(
            Capsule().stroke(.white.opacity(0.15), lineWidth: 1)
        )
    }

    private func switchButton(icon: String, tag: Int) -> some View {
        Button(action: { selection = tag }) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(selection == tag ? Color.orange : Color.white)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(icon)
    }

    private func dividerDot() -> some View {
        Circle().fill(Color.white.opacity(0.25)).frame(width: 3, height: 3)
    }
}


