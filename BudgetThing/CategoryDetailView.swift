//
//  CategoryDetailView.swift
//  BudgetThing
//

import SwiftUI

struct CategoryDetailView: View {
    struct Model {
        var emoji: String
        var name: String
        var budget: Decimal?
    }
    let category: Model

    var body: some View {
        ZStack {
            Color(.black).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 20) {
                HStack(spacing: 12) {
                    Text(category.emoji)
                        .font(.system(size: 36))
                        .frame(width: 56, height: 48)
                        .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                    Text(category.name)
                        .font(Font.custom("AvenirNextCondensed-Heavy", size: 32))
                        .foregroundStyle(.white)
                }

                Text("Budget & Options (mock)")
                    .foregroundStyle(.white.opacity(0.7))

                VStack(spacing: 12) {
                    HStack {
                        Text("Monthly Budget")
                            .foregroundStyle(.white)
                        Spacer()
                        Text(category.budget != nil ? "$\(category.budget!)" : "None")
                            .foregroundStyle(.white.opacity(0.7))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(.white.opacity(0.08), in: Capsule())
                    }
                    Divider().background(.white.opacity(0.1))
                    HStack {
                        Text("Color Accent")
                            .foregroundStyle(.white)
                        Spacer()
                        Circle()
                            .fill(Color.orange)
                            .frame(width: 20, height: 20)
                    }
                }

                Spacer()
            }
            .padding(24)
        }
        .preferredColorScheme(.dark)
        .navigationTitle("Category")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    CategoryDetailView(category: .init(emoji: "🍔", name: "Food", budget: nil))
}


