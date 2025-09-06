//
//  CategoriesManageView.swift
//  BudgetThing
//

import SwiftUI
import SwiftData

struct CategoriesManageView: View {
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \Category.name) private var categories: [Category]

    var body: some View {
        ZStack {
            Color(.black).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 16) {
                Text("Manage Categories")
                    .font(Font.custom("AvenirNextCondensed-Heavy", size: 30))
                    .foregroundStyle(.white)

                // List of categories styled like transactions, tappable
                List {
                    ForEach(categories) { c in
                        NavigationLink {
                            EditCategoryView(category: c)
                        } label: {
                            HStack(spacing: 12) {
                                Text(c.emoji)
                                    .font(.system(size: 22))
                                    .frame(width: 36, height: 36)
                                Text(c.name)
                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 22))
                                    .foregroundStyle(.white)
                                Spacer()
                            }
                        }
                        .simultaneousGesture(TapGesture().onEnded { Haptics.selection() })
                        .listRowBackground(Color.clear)
                    }
                    // Trailing "Add +" row as a right-aligned footer-like cell
                    HStack {
                        Spacer()
                        NavigationLink {
                            AddCategoryView()
                        } label: {
                            Text("Add  +")
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 20))
                                .foregroundStyle(.white)
                        }
                    }
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
    }
}

#Preview {
    CategoriesManageView()
}


