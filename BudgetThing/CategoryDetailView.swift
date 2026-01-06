//
//  CategoryDetailView.swift
//  BudgetThing
//

import SwiftUI
import SwiftData

struct CategoryDetailView: View {
    let category: Category
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @State private var showDeletedToast: Bool = false

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
                        Text(category.monthlyBudget.map { "\(NumberFormatter.localizedString(from: NSDecimalNumber(decimal: $0), number: .currency))" } ?? "None")
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
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(role: .destructive) {
                    modelContext.delete(category)
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.9)) {
                        showDeletedToast = true
                    }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) {
                        dismiss()
                    }
                } label: {
                    Text("Delete")
                        .foregroundStyle(.red)
                }
            }
        }
        .overlay(alignment: .top) {
            if showDeletedToast {
                Text("Deleted")
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(.white.opacity(0.08), in: Capsule())
                    .padding(.top, 16)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
    }
}

#Preview {
    CategoryDetailView(category: Category(name: "Food", emoji: "🍔"))
}


