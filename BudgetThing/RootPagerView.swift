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

    var body: some View {
        TabView(selection: $selection) {
            ExpenseEntryView { amount, type, categoryEmoji in
                var foundCategory: Category? = nil
                var foundAccount: Account? = nil
                // Resolve category by emoji
                if let emoji = categoryEmoji, type != "income" {
                    var fd = FetchDescriptor<Category>()
                    fd.fetchLimit = 1
                    fd.predicate = #Predicate { $0.emoji == emoji }
                    if let match = try? modelContext.fetch(fd).first { foundCategory = match }
                }
                // Resolve default account if stored
                if let defaultId = UserDefaults.standard.string(forKey: "defaultAccountID"), let uuid = UUID(uuidString: defaultId) {
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
                if let acc = foundAccount {
                    UserDefaults.standard.set(acc.id.uuidString, forKey: "defaultAccountID")
                }
            }
            .tag(0)

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
        }
        .fullScreenCover(isPresented: $showOnboarding) {
            OnboardingView {
                hasSeenOnboarding = true
                showOnboarding = false
            }
        }
    }
}

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


