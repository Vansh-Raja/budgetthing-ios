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
    @Query(sort: \Account.name) private var accounts: [Account]
    @State private var selectedAccount: Account? = nil
    @FocusState private var amountFieldFocused: Bool
    @Query(sort: \Category.name) private var categories: [Category]
    @Query(sort: \Trip.updatedAt, order: .reverse)
    private var allTrips: [Trip]
    @State private var showDeleteDialog: Bool = false
    @State private var showTripPicker: Bool = false

    // Filter for active, non-deleted trips
    private var activeTrips: [Trip] {
        allTrips.filter { trip in
            let notArchived = !trip.isArchived
            let notDeleted = !(trip.isDeleted ?? false)
            return notArchived && notDeleted
        }
    }

    // Open trips = today is within startDate...endDate, or legacy trips without dates
    private var openTrips: [Trip] {
        let today = Calendar.current.startOfDay(for: Date())
        return activeTrips.filter { trip in
            // Legacy trips without dates are always shown
            guard let start = trip.startDate, let end = trip.endDate else { return true }
            let startDay = Calendar.current.startOfDay(for: start)
            let endDay = Calendar.current.startOfDay(for: end)
            return today >= startDay && today <= endDay
        }
    }

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
                    HStack(alignment: .center, spacing: 6) {
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
                    // Account pill row
                    if !accounts.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Account")
                                .foregroundStyle(.white.opacity(0.7))
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 10) {
                                    ForEach(accounts) { acc in
                                        let isSel = selectedAccount?.id == acc.id
                                        Button(action: { selectedAccount = acc }) {
                                            HStack(spacing: 6) {
                                                Text(acc.emoji.isEmpty ? "🧾" : acc.emoji).font(.system(size: 18))
                                                Text(acc.name).font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                                            }
                                            .padding(.horizontal, 10)
                                            .padding(.vertical, 6)
                                            .background(isSel ? Color.white.opacity(0.18) : Color.white.opacity(0.08), in: Capsule())
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                        }
                    }
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
                    let dateStr = item.date.formatted(date: .abbreviated, time: .shortened)
                    if let acc = item.account {
                        let emoji = acc.emoji.isEmpty ? "🧾" : acc.emoji
                        Text("\(dateStr) · \(emoji) \(acc.name)")
                            .foregroundStyle(.white.opacity(0.7))
                    } else {
                        Text(dateStr)
                            .foregroundStyle(.white.opacity(0.7))
                    }
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
                        .onChange(of: editableNote) { _, newVal in
                            // Prevent accidental non-finite numbers reaching rendering by ensuring string stays finite-length
                            if newVal.count > 5000 { editableNote = String(newVal.prefix(5000)) }
                        }
                }

                // Assign to Trip section
                if item.tripExpense != nil || !openTrips.isEmpty {
                    tripAssignmentSection
                }

                Spacer()

                // Delete at bottom (styled and confirmed)
                Button(role: .destructive) {
                    Haptics.selection()
                    showDeleteDialog = true
                } label: {
                    Text("Delete Transaction")
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.15), lineWidth: 1))
                }
                .buttonStyle(.plain)
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
        .confirmationDialog("Delete Transaction?", isPresented: $showDeleteDialog, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                modelContext.delete(item)
                withAnimation(.spring(response: 0.35, dampingFraction: 0.9)) { showDeletedToast = true }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { dismiss() }
            }
            Button("Cancel", role: .cancel) { }
        }
        .onAppear {
            editableNote = item.note ?? ""
            editableDate = item.date
            selectedCategory = item.category
            selectedAccount = item.account
            editableAmount = decimalString(item.amount)
        }
    }

    private func toggleEditSave() {
        if isEditing {
            item.note = editableNote.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : editableNote
            item.date = editableDate
            item.category = selectedCategory
            item.account = selectedAccount
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

    // MARK: - Trip Assignment Section

    private var tripAssignmentSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Trip")
                .foregroundStyle(.white.opacity(0.7))
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))

            if let tripExpense = item.tripExpense, let trip = tripExpense.trip {
                // Already assigned to a trip
                HStack(spacing: 12) {
                    Text(trip.emoji)
                        .font(.system(size: 22))
                    Text(trip.name)
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                        .foregroundStyle(.white)
                    Spacer()
                    Button(action: {
                        // Remove from trip
                        modelContext.delete(tripExpense)
                        item.tripExpense = nil
                        Haptics.selection()
                    }) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 18))
                            .foregroundStyle(.white.opacity(0.5))
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
            } else {
                // Not assigned - show button to assign
                Button(action: { showTripPicker = true }) {
                    HStack(spacing: 8) {
                        Image(systemName: "airplane")
                            .font(.system(size: 14))
                        Text("Add to Trip")
                            .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                    }
                    .foregroundStyle(.white.opacity(0.7))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
            }
        }
        .sheet(isPresented: $showTripPicker) {
            tripPickerSheet
        }
    }

    private var tripPickerSheet: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 12) {
                        ForEach(openTrips) { trip in
                            Button(action: {
                                assignToTrip(trip)
                                showTripPicker = false
                            }) {
                                HStack(spacing: 12) {
                                    Text(trip.emoji)
                                        .font(.system(size: 24))
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(trip.name)
                                            .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                                            .foregroundStyle(.white)
                                        if let startDate = trip.startDate {
                                            Text(startDate, style: .date)
                                                .font(.system(size: 12))
                                                .foregroundStyle(.white.opacity(0.5))
                                        }
                                    }
                                    Spacer()
                                    if trip.isGroup {
                                        Image(systemName: "person.2.fill")
                                            .font(.system(size: 12))
                                            .foregroundStyle(.white.opacity(0.4))
                                    }
                                }
                                .padding(14)
                                .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(20)
                }
            }
            .navigationTitle("Add to Trip")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { showTripPicker = false }
                }
            }
            .preferredColorScheme(.dark)
        }
        .presentationDetents([.medium])
    }

    private func assignToTrip(_ trip: Trip) {
        // Create TripExpense to link this transaction to the trip
        let tripExpense = TripExpense(
            transaction: item,
            paidByParticipant: trip.participants?.first // Default to first participant for solo trips
        )
        tripExpense.trip = trip
        item.tripExpense = tripExpense
        modelContext.insert(tripExpense)
        Haptics.success()
    }
}

#Preview {
    TransactionDetailView(item: Transaction(amount: 12.34))
}


