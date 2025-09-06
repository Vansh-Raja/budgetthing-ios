//
//  TransactionDetailView.swift
//  BudgetThing
//

import SwiftUI
import SwiftData

struct TransactionDetailView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Environment(\._currencyCode) private var currencyCode
    let item: Transaction
    @State private var showDeletedToast: Bool = false
    @State private var isEditing: Bool = false
    @State private var editableNote: String = ""
    @State private var editableDate: Date = .now
    @State private var selectedCategory: Category? = nil
    @State private var editableAmount: String = ""
    @FocusState private var amountFieldFocused: Bool
    @Query(sort: \Category.name) private var categories: [Category]

    var body: some View {
        ZStack {
            Color(.black).ignoresSafeArea()
            VStack(spacing: 24) {
                let displayEmoji: String? = {
                    if isEditing { return selectedCategory?.emoji ?? item.category?.emoji }
                    return item.category?.emoji
                }()
                let currencySymbol = CurrencyUtils.symbol(for: currencyCode)
                if let emoji = displayEmoji, !emoji.isEmpty {
                    Text(emoji)
                        .font(.system(size: 48))
                }
                if isEditing {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(currencySymbol)
                            .font(Font.custom("AvenirNextCondensed-Heavy", size: 64))
                            .foregroundStyle(.white)
                        TextField("0", text: $editableAmount)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.center)
                            .font(Font.custom("AvenirNextCondensed-Heavy", size: 64))
                            .foregroundStyle(.white)
                            .focused($amountFieldFocused)
                            .onChange(of: editableAmount) { _, newVal in
                                var s = sanitizeAmount(newVal)
                                if s.isEmpty { s = "0" }
                                if s == "." { s = "0." }
                                editableAmount = s
                            }
                        Text(currencySymbol)
                            .font(Font.custom("AvenirNextCondensed-Heavy", size: 64))
                            .opacity(0)
                    }
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                    .onTapGesture { amountFieldFocused = true }
                } else {
                    Text(formattedAmount(item.amount))
                        .font(Font.custom("AvenirNextCondensed-Heavy", size: 64))
                        .foregroundStyle(.white)
                }
                if isEditing {
                    DatePicker("Date", selection: $editableDate, displayedComponents: [.date, .hourAndMinute])
                        .labelsHidden()
                        .datePickerStyle(.compact)
                        .tint(.orange)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .foregroundStyle(.white)
                    // Category chips
                    if !categories.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Category")
                                .foregroundStyle(.white.opacity(0.7))
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 10) {
                                    ForEach(categories) { cat in
                                        let isSel = selectedCategory?.id == cat.id
                                        Button(action: { selectedCategory = cat }) {
                                            Text(cat.emoji)
                                                .font(.system(size: 22))
                                                .frame(width: 40, height: 34)
                                                .background(
                                                    RoundedRectangle(cornerRadius: 9)
                                                        .fill(isSel ? Color.white.opacity(0.18) : Color.white.opacity(0.08))
                                                )
                                        }
                                        .buttonStyle(.plain)
                                        .accessibilityLabel(cat.name)
                                    }
                                }
                            }
                        }
                    }
                } else {
                    Text(item.date.formatted(date: .abbreviated, time: .shortened))
                        .foregroundStyle(.white.opacity(0.7))
                }

                // Editable notes box
                VStack(alignment: .leading, spacing: 8) {
                    Text("Notes")
                        .foregroundStyle(.white.opacity(0.7))
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                    TextEditor(text: $editableNote)
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 120)
                        .padding(12)
                        .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
                        .foregroundStyle(.white)
                        .disabled(!isEditing)
                }

                Spacer()

                // Delete at bottom
                Button(role: .destructive) {
                    modelContext.delete(item)
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.9)) { showDeletedToast = true }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { dismiss() }
                } label: {
                    Text("Delete")
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity)
                }
                .simultaneousGesture(TapGesture().onEnded { Haptics.warning() })
                Spacer()
            }
            .padding(24)
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.black, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button(action: { dismiss() }) { Image(systemName: "chevron.left") }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: toggleEditSave) { Text(isEditing ? "Save" : "Edit") }
                    .simultaneousGesture(TapGesture().onEnded { Haptics.selection() })
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
        .preferredColorScheme(.dark)
        .onAppear {
            editableNote = item.note ?? ""
            editableDate = item.date
            selectedCategory = item.category
            editableAmount = decimalString(item.amount)
        }
    }

    private func toggleEditSave() {
        if isEditing {
            item.note = editableNote.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : editableNote
            item.date = editableDate
            item.category = selectedCategory
            if let dec = Decimal(string: editableAmount) { item.amount = dec }
        }
        withAnimation { isEditing.toggle() }
    }

    private func sanitizeAmount(_ input: String) -> String {
        let filtered = input.filter { "0123456789.".contains($0) }
        let parts = filtered.split(separator: ".", maxSplits: 1, omittingEmptySubsequences: false)
        if parts.count > 1 {
            let fractional = parts[1].prefix(2)
            return String(parts[0]) + "." + String(fractional)
        }
        return filtered
    }

    private func decimalString(_ decimal: Decimal) -> String {
        let n = NSDecimalNumber(decimal: decimal)
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.minimumFractionDigits = 0
        f.maximumFractionDigits = 2
        f.usesGroupingSeparator = false
        f.decimalSeparator = "."
        return f.string(from: n) ?? "0"
    }

    private func formattedAmount(_ amount: Decimal) -> String {
        let symbol = CurrencyUtils.symbol(for: currencyCode)
        let n = NSDecimalNumber(decimal: amount)
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.minimumFractionDigits = 0
        f.maximumFractionDigits = 2
        f.usesGroupingSeparator = true
        let digits = f.string(from: n) ?? "0"
        return symbol + digits
    }
}

#Preview {
    TransactionDetailView(item: Transaction(amount: 12.34))
}


