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
            ExpenseEntryView { amount, note in
                let newItem = Item(timestamp: Date(), amount: amount, note: note)
                modelContext.insert(newItem)
            }
            .tag(0)

            TransactionsListView()
                .tag(1)
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .background(Color.black)
        .ignoresSafeArea()
    }
}

#Preview {
    RootPagerView()
        .modelContainer(for: Item.self, inMemory: true)
}


