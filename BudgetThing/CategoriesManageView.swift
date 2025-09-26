//
//  CategoriesManageView.swift
//  BudgetThing
//

import SwiftUI
import SwiftData

struct CategoriesManageView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \Category.sortIndex) private var categories: [Category]
    @State private var selectedCategory: Category? = nil
    @State private var showingAdd: Bool = false

    var body: some View {
        ZStack {
            Color(.black).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 16) {
                Text("Manage Categories")
                    .font(Font.custom("AvenirNextCondensed-Heavy", size: 30))
                    .foregroundStyle(.white)

                // List of categories styled like transactions, tappable
                List {
                    ForEach(categories.filter { ($0.isSystem ?? false) == false }) { c in
                        Button(action: {
                            selectedCategory = c
                            Haptics.selection()
                        }) {
                            HStack(spacing: 12) {
                                Image(systemName: "line.3.horizontal")
                                    .foregroundStyle(.white.opacity(0.35))
                                    .padding(.trailing, 2)
                                Text(c.emoji)
                                    .font(.system(size: 22))
                                    .frame(width: 36, height: 36)
                                Text(c.name)
                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 22))
                                    .foregroundStyle(.white)
                                Spacer()
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
                    .onMove(perform: moveCategories)
                    // Trailing "Add +" row as a right-aligned full-width button
                    Button(action: { showingAdd = true; Haptics.selection() }) {
                        HStack {
                            Spacer()
                            Text("Add  +")
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 20))
                                .foregroundStyle(.white)
                        }
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
        .fullScreenCover(item: $selectedCategory) { c in
            NavigationStack { EditCategoryView(category: c) }
        }
        .fullScreenCover(isPresented: $showingAdd) {
            NavigationStack { AddCategoryView() }
        }
    }
}

private extension CategoriesManageView {
    func moveCategories(from source: IndexSet, to destination: Int) {
        var current = categories
        current.move(fromOffsets: source, toOffset: destination)
        for (index, cat) in current.enumerated() {
            cat.sortIndex = index
            cat.updatedAt = .now
        }
        do { try modelContext.save() } catch {}
    }
}

#Preview {
    CategoriesManageView()
}


