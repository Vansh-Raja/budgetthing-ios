//
//  CategoriesManageView.swift
//  BudgetThing
//

import SwiftUI

struct CategoriesManageView: View {
    @State private var categories: [(emoji: String, name: String)] = [
        ("🍔", "Food"), ("🛒", "Groceries"), ("🚕", "Transport"), ("🏠", "Rent"), ("🎉", "Fun")
    ]
    @State private var newEmoji: String = "🍎"
    @State private var newName: String = "Category"

    var body: some View {
        ZStack {
            Color(.black).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 16) {
                Text("Manage Categories")
                    .font(Font.custom("AvenirNextCondensed-Heavy", size: 30))
                    .foregroundStyle(.white)

                // List of categories styled like transactions, tappable
                List {
                    ForEach(categories.indices, id: \.self) { idx in
                        let c = categories[idx]
                        NavigationLink {
                            CategoryDetailView(category: CategoryDetailView.Model(emoji: c.emoji, name: c.name, budget: nil))
                        } label: {
                            HStack(spacing: 12) {
                                Text(c.emoji)
                                    .font(.system(size: 22))
                                    .frame(width: 36, height: 36)
                                    .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                                Text(c.name)
                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 22))
                                    .foregroundStyle(.white)
                                Spacer()
                            }
                            .listRowBackground(Color.clear)
                        }
                    }
                }
                .listStyle(.plain)
                .listRowSeparator(.hidden)
                .scrollContentBackground(.hidden)

                Spacer()
            }
            .padding(24)
        }
        .preferredColorScheme(.dark)
    }
}

#Preview {
    CategoriesManageView()
}


