//
//  AddCategoryView.swift
//  BudgetThing
//

import SwiftUI
import SwiftData
//

struct AddCategoryView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @State private var emoji: String = "🍎"
    @State private var name: String = ""
    @State private var budget: String = "" // string input; parsed to Decimal
    @State private var showEmojiSheet: Bool = false
    private let quickEmojis: [String] = ["🍔","🛒","🚕","🏠","🎉","☕️","💊","🎮","📚","💳"]

    var body: some View {
        ZStack { Color(.black).ignoresSafeArea() }
            .overlay(
                VStack(alignment: .leading, spacing: 16) {
                    Text("New Category")
                        .font(Font.custom("AvenirNextCondensed-Heavy", size: 30))
                        .foregroundStyle(.white)

                    // Keep page minimal; open full emoji sheet from emoji box

                    HStack(spacing: 12) {
                        Button(action: { showEmojiSheet = true }) {
                            Text(emoji)
                                .font(.system(size: 24))
                                .frame(width: 64, height: 44)
                                .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                        }
                        .buttonStyle(.plain)
                        TextField("Name", text: $name)
                            .textInputAutocapitalization(.words)
                            .autocorrectionDisabled(true)
                            .padding(.horizontal, 12)
                            .frame(height: 44)
                            .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                            .foregroundStyle(.white)
                    }

                    TextField("Monthly Budget (optional)", text: $budget)
                        .padding(.horizontal, 12)
                        .frame(height: 44)
                        .keyboardType(.decimalPad)
                        .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                        .foregroundStyle(.white)
                        .onChange(of: budget) { _, newValue in
                            // Sanitize to digits and at most one dot
                            let filtered = newValue.filter { "0123456789.".contains($0) }
                            let parts = filtered.split(separator: ".", maxSplits: 1, omittingEmptySubsequences: false)
                            budget = parts.count > 1 ? parts[0] + "." + parts[1].replacingOccurrences(of: ".", with: "") : filtered
                        }

                    HStack {
                        Spacer()
                        Button(action: saveCategory) {
                            Text("Save")
                                .foregroundStyle(.white)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 10)
                                .background(.white.opacity(0.12), in: Capsule())
                        }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                    Spacer()
                }
                .padding(24)
            )
            .preferredColorScheme(.dark)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.black, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .navigationBarBackButtonHidden(true)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: { dismiss() }) { Image(systemName: "chevron.left") }
                }
            }
            .sheet(isPresented: $showEmojiSheet) {
                EmojiPickerSheetView(selection: $emoji)
                    .presentationDetents([.large])
            }
    }

    private func saveCategory() {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let budgetDecimal: Decimal? = {
            let cleaned = budget.trimmingCharacters(in: .whitespaces)
            guard !cleaned.isEmpty else { return nil }
            return Decimal(string: cleaned)
        }()
        let category = Category(name: trimmed, emoji: emoji, monthlyBudget: budgetDecimal)
        modelContext.insert(category)
        dismiss()
    }

}

#Preview {
    AddCategoryView()
}


