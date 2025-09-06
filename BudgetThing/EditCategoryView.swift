import SwiftUI
import SwiftData

struct EditCategoryView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @State private var emoji: String
    @State private var name: String
    @State private var budget: String
    let category: Category
    @State private var showSavedToast: Bool = false

    init(category: Category) {
        self.category = category
        _emoji = State(initialValue: category.emoji)
        _name = State(initialValue: category.name)
        if let b = category.monthlyBudget {
            _budget = State(initialValue: NSDecimalNumber(decimal: b).stringValue)
        } else {
            _budget = State(initialValue: "")
        }
    }

    private let quickEmojis: [String] = ["🍔","🛒","🚕","🏠","🎉","☕️","💊","🎮","📚","💳"]

    var body: some View {
        ZStack { Color(.black).ignoresSafeArea() }
            .overlay(
                VStack(alignment: .leading, spacing: 16) {
                    Text("Edit Category")
                        .font(Font.custom("AvenirNextCondensed-Heavy", size: 30))
                        .foregroundStyle(.white)

                    let columns: [GridItem] = [GridItem(.adaptive(minimum: 40), spacing: 10)]
                    ScrollView(.vertical, showsIndicators: false) {
                        LazyVGrid(columns: columns, spacing: 10) {
                            ForEach(quickEmojis, id: \.self) { e in
                                Button(action: { emoji = e; Haptics.selection() }) {
                                    Text(e)
                                        .font(.system(size: 20))
                                        .frame(width: 40, height: 34)
                                        .background(
                                            RoundedRectangle(cornerRadius: 9)
                                                .fill(emoji == e ? Color.white.opacity(0.18) : Color.white.opacity(0.08))
                                        )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                    .frame(maxHeight: 120)

                    HStack(spacing: 12) {
                        Text(emoji)
                            .font(.system(size: 24))
                            .frame(width: 64, height: 44)
                            .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
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

                    HStack {
                        Spacer()
                        Button(action: save) {
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
            .overlay(alignment: .top) {
                if showSavedToast {
                    Text("Changes saved")
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

    private func save() {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        category.name = trimmed
        category.emoji = emoji
        let cleaned = budget.trimmingCharacters(in: .whitespaces)
        category.monthlyBudget = cleaned.isEmpty ? nil : Decimal(string: cleaned)
        withAnimation(.spring(response: 0.35, dampingFraction: 0.9)) { showSavedToast = true }
        Haptics.success()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            withAnimation(.easeOut(duration: 0.25)) { showSavedToast = false }
            dismiss()
        }
    }
}


