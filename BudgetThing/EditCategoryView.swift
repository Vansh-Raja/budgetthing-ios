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
    @State private var showDeleteDialog: Bool = false
    @State private var impactedCount: Int = 0
    @State private var actionToast: String? = nil

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

    @State private var showEmojiSheet: Bool = false
    private let quickEmojis: [String] = ["🍔","🛒","🚕","🏠","🎉","☕️","💊","🎮","📚","💳"]

    var body: some View {
        ZStack { Color(.black).ignoresSafeArea() }
            .overlay(
                VStack(alignment: .leading, spacing: 16) {
                    Text("Edit Category")
                        .font(Font.custom("AvenirNextCondensed-Heavy", size: 30))
                        .foregroundStyle(.white)

                    // Replaced inline picker with sheet opened from emoji box below

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
            .sheet(isPresented: $showEmojiSheet) {
                EmojiPickerSheetView(selection: $emoji)
                    .presentationDetents([.large])
            }
            .overlay(alignment: .top) {
                if showSavedToast {
                    Text("Changes saved")
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(Color.black.opacity(0.8), in: Capsule())
                        .padding(.top, 16)
                        .transition(.move(edge: .top).combined(with: .opacity))
                } else if let msg = actionToast {
                    Text(msg)
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(Color.black.opacity(0.8), in: Capsule())
                        .padding(.top, 16)
                        .transition(.move(edge: .top).combined(with: .opacity))
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
            .safeAreaInset(edge: .bottom) {
                HStack {
                    Button(role: .destructive) {
                        Haptics.selection()
                        impactedCount = DeletionCoordinator.countTransactions(for: category, in: modelContext)
                        showDeleteDialog = true
                    } label: {
                        Text("Delete Category")
                            .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.15), lineWidth: 1))
                            .padding(.horizontal, 16)
                            .padding(.bottom, 8)
                    }
                    .buttonStyle(.plain)
                }
                .background(Color.black.opacity(0.001))
            }
            .confirmationDialog("Delete Category?", isPresented: $showDeleteDialog, titleVisibility: .visible) {
                Button("Delete category and all related transactions (\(impactedCount))", role: .destructive) {
                    do {
                        _ = try DeletionCoordinator.deleteCategory(category, mode: .deleteAll, in: modelContext)
                        Haptics.success()
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.9)) { actionToast = "Deleted" }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { dismiss() }
                    } catch {
                        Haptics.error()
                    }
                }
                Button("Keep transactions; remove category (\(impactedCount))") {
                    do {
                        _ = try DeletionCoordinator.deleteCategory(category, mode: .detach, in: modelContext)
                        Haptics.success()
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.9)) { actionToast = "Deleted" }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { dismiss() }
                    } catch {
                        Haptics.error()
                    }
                }
                Button("Cancel", role: .cancel) { }
            } message: {
                Text("This cannot be undone.")
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


