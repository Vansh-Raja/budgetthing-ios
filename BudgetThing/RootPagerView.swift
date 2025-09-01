//
//  RootPagerView.swift
//  BudgetThing
//

import SwiftUI

struct RootPagerView: View {
    @Environment(\.modelContext) private var modelContext
    @State private var selection: Int = 0

    var body: some View {
        TabView(selection: $selection) {
            ExpenseEntryView { amount, note, category in
                let newItem = Item(timestamp: Date(), amount: amount, note: note, categoryEmoji: category)
                modelContext.insert(newItem)
            }
            .tag(0)

            TransactionsListView()
                .tag(1)

            SettingsView()
                .tag(2)
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .background(Color.black)
        .ignoresSafeArea()
        .overlay(alignment: .bottom) {
            if selection != 0 {
                FloatingPageSwitcher(selection: $selection)
                    .padding(.bottom, 18)
            }
        }
    }
}

#Preview {
    RootPagerView()
        .modelContainer(for: Item.self, inMemory: true)
}

// MARK: - Floating Page Switcher

private struct FloatingPageSwitcher: View {
    @Binding var selection: Int

    var body: some View {
        HStack(spacing: 18) {
            switchButton(icon: "dollarsign.circle", tag: 0)
            dividerDot()
            switchButton(icon: "list.bullet", tag: 1)
            dividerDot()
            switchButton(icon: "gearshape", tag: 2)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.white.opacity(0.12), in: Capsule())
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


