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
    var startInEditMode: Bool = false
    
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
    
    // Trip-related state
    @State private var showEditSplit: Bool = false
    @State private var showPayerPicker: Bool = false
    @State private var showRemoveFromTripDialog: Bool = false
    @State private var selectedPayer: TripParticipant? = nil
    @State private var previewSplits: [UUID: Decimal] = [:]

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
            guard let start = trip.startDate, let end = trip.endDate else { return true }
            let startDay = Calendar.current.startOfDay(for: start)
            let endDay = Calendar.current.startOfDay(for: end)
            return today >= startDay && today <= endDay
        }
    }
    
    // Trip-related computed properties
    private var tripExpense: TripExpense? { item.tripExpense }
    private var trip: Trip? { tripExpense?.trip }
    private var participants: [TripParticipant] { trip?.participants ?? [] }
    private var isGroupTrip: Bool { trip?.isGroup ?? false }
    
    private var displaySplits: [UUID: Decimal] {
        isEditing ? previewSplits : (tripExpense?.computedSplits ?? [:])
    }
    
    private var isFreshTransaction: Bool {
        Date().timeIntervalSince(item.date) < 10
    }
    
    // Filter out system categories (consistent with ExpenseEntryView)
    private var userCategories: [Category] {
        categories.filter { ($0.isSystem ?? false) == false }
    }

    var body: some View {
        ZStack {
            Color(.black).ignoresSafeArea()
            ScrollView {
                VStack(spacing: 24) {
                    headerSection
                    notesSection
                    
                    if tripExpense != nil {
                        tripDetailsSection
                    }
                    
                    if tripExpense == nil && !openTrips.isEmpty {
                        tripAssignmentSection
                    }

                    Spacer(minLength: 40)
                    deleteButton
                }
                .padding(24)
            }
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
        .confirmationDialog("Remove from Trip?", isPresented: $showRemoveFromTripDialog, titleVisibility: .visible) {
            Button("Remove", role: .destructive) { removeFromTrip() }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("The transaction will be kept but unlinked from this trip.")
        }
        .confirmationDialog("Who paid?", isPresented: $showPayerPicker, titleVisibility: .visible) {
            ForEach(participants) { participant in
                Button {
                    selectedPayer = participant
                    Haptics.selection()
                } label: {
                    Text(participant.isCurrentUser ? "You" : participant.name)
                }
            }
            Button("Cancel", role: .cancel) { }
        }
        .sheet(isPresented: $showTripPicker) {
            tripPickerSheet
        }
        .sheet(isPresented: $showEditSplit) {
            splitEditorSheet
        }
        .onAppear {
            editableNote = item.note ?? ""
            editableDate = item.date
            selectedCategory = item.category
            selectedAccount = item.account
            editableAmount = decimalString(item.amount)
            selectedPayer = item.tripExpense?.paidByParticipant
            previewSplits = item.tripExpense?.computedSplits ?? [:]
            isEditing = startInEditMode || isFreshTransaction
        }
    }

    // MARK: - Header Section
    
    private var headerSection: some View {
        VStack(spacing: 24) {
            emojiView
            amountView
            dateAccountView
        }
    }
    
    @ViewBuilder
    private var emojiView: some View {
        let displayEmoji: String? = isEditing ? (selectedCategory?.emoji ?? item.category?.emoji) : item.category?.emoji
        if let emoji = displayEmoji, !emoji.isEmpty {
            Text(emoji)
                .font(.system(size: 48))
        }
    }
    
    @ViewBuilder
    private var amountView: some View {
        let currencySymbol = CurrencyUtils.symbol(for: currencyCode)
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
                        recalculatePreviewSplits()
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
    }
    
    @ViewBuilder
    private var dateAccountView: some View {
        if isEditing {
            VStack(spacing: 16) {
                DatePicker("Date", selection: $editableDate, displayedComponents: [.date, .hourAndMinute])
                    .labelsHidden()
                    .datePickerStyle(.compact)
                    .tint(.orange)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .foregroundStyle(.white)
                
                if !accounts.isEmpty {
                    accountPicker
                }
                
                if !userCategories.isEmpty {
                    categoryPicker
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
    }
    
    private var accountPicker: some View {
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
    
    private var categoryPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Category")
                .foregroundStyle(.white.opacity(0.7))
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(userCategories) { cat in
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

    // MARK: - Notes Section
    
    private var notesSection: some View {
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
                    if newVal.count > 5000 { editableNote = String(newVal.prefix(5000)) }
                }
        }
    }

    // MARK: - Trip Details Section
    
    private var tripDetailsSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            tripBadgeRow
            if isGroupTrip {
                splitDetailsSection
            }
        }
    }
    
    private var tripBadgeRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Trip")
                .foregroundStyle(.white.opacity(0.7))
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
            
            HStack(spacing: 12) {
                Text(trip?.emoji ?? "✈️")
                    .font(.system(size: 22))
                Text(trip?.name ?? "Trip")
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                    .foregroundStyle(.white)
                Spacer()
                
                Button(action: {
                    Haptics.selection()
                    showRemoveFromTripDialog = true
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
        }
    }
    
    private var splitDetailsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Split Details")
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                    .foregroundStyle(.white.opacity(0.6))
                
                Spacer()
                
                if isEditing {
                    Button(action: { showEditSplit = true }) {
                        HStack(spacing: 4) {
                            Text("Edit")
                            Image(systemName: "chevron.right")
                        }
                        .font(.system(size: 12))
                        .foregroundStyle(.orange)
                    }
                }
            }
            
            VStack(spacing: 0) {
                paidByRow
                Rectangle().fill(.white.opacity(0.06)).frame(height: 1)
                splitTypeRow
                participantSplitsRows
            }
            .background(.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 12))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }
    
    private var paidByRow: some View {
        let payer = isEditing ? selectedPayer : tripExpense?.paidByParticipant
        
        return Group {
            if let paidBy = payer {
                paidByContent(paidBy: paidBy)
            } else if !participants.isEmpty {
                selectPayerContent
            }
        }
        .padding(14)
        .background(.white.opacity(0.08))
    }
    
    private func paidByContent(paidBy: TripParticipant) -> some View {
        Button(action: {
            if isEditing {
                Haptics.selection()
                showPayerPicker = true
            }
        }) {
            HStack(spacing: 12) {
                Circle()
                    .fill(Color(hex: paidBy.colorHex ?? "FF6B6B") ?? .orange)
                    .frame(width: 32, height: 32)
                    .overlay(
                        Text(String(paidBy.name.prefix(1)).uppercased())
                            .font(Font.custom("AvenirNextCondensed-DemiBold", size: 12))
                            .foregroundStyle(.white)
                    )
                
                Text(paidBy.isCurrentUser ? "You paid" : "\(paidBy.name) paid")
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 15))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                
                Spacer()
                
                let displayAmount = isEditing ? (Decimal(string: editableAmount) ?? item.amount) : item.amount
                Text(formattedAmount(displayAmount))
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 15))
                    .foregroundStyle(.white)
                    .layoutPriority(1)
                
                if isEditing {
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.4))
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(!isEditing)
    }
    
    private var selectPayerContent: some View {
        Button(action: {
            if isEditing {
                Haptics.selection()
                showPayerPicker = true
            }
        }) {
            HStack(spacing: 12) {
                Image(systemName: "person.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(.white.opacity(0.6))
                    .frame(width: 32, height: 32)
                    .background(.white.opacity(0.08), in: Circle())
                
                Text("Select who paid")
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 15))
                    .foregroundStyle(.white)
                
                Spacer()
                
                if isEditing {
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.4))
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(!isEditing)
    }
    
    private var splitTypeRow: some View {
        HStack(spacing: 8) {
            if let tripExpense = tripExpense {
                Image(systemName: tripExpense.splitType.icon)
                    .font(.system(size: 14))
                    .foregroundStyle(.orange)
                
                Text(tripExpense.splitType.displayName)
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
                    .foregroundStyle(.white.opacity(0.7))
            }
            
            Spacer()
        }
        .padding(14)
    }
    
    private var participantSplitsRows: some View {
        ForEach(participants) { participant in
            if let owedAmount = displaySplits[participant.id], owedAmount > 0 {
                participantSplitRow(participant: participant, amount: owedAmount)
            }
        }
    }
    
    private func participantSplitRow(participant: TripParticipant, amount: Decimal) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Circle()
                    .fill(Color(hex: participant.colorHex ?? "FF6B6B") ?? .orange)
                    .frame(width: 28, height: 28)
                    .overlay(
                        Text(String(participant.name.prefix(1)).uppercased())
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(.white)
                    )
                
                Text(participant.isCurrentUser ? "You" : participant.name)
                    .font(.system(size: 14))
                    .foregroundStyle(.white.opacity(0.8))
                
                Spacer()
                
                Text(formattedAmount(amount))
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
                    .foregroundStyle(.white.opacity(0.8))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            
            if participant.id != participants.last?.id {
                Rectangle()
                    .fill(.white.opacity(0.04))
                    .frame(height: 1)
                    .padding(.leading, 54)
            }
        }
    }

    // MARK: - Trip Assignment Section
    
    private var tripAssignmentSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Trip")
                .foregroundStyle(.white.opacity(0.7))
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))

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

    // MARK: - Delete Button
    
    private var deleteButton: some View {
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
    }

    // MARK: - Sheets

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
    
    @ViewBuilder
    private var splitEditorSheet: some View {
        if isGroupTrip, let tripExpense = tripExpense {
            NavigationStack {
                SplitEditorView(
                    participants: participants,
                    splitType: Binding(
                        get: { tripExpense.splitType },
                        set: { tripExpense.splitType = $0 }
                    ),
                    splitData: Binding(
                        get: { tripExpense.splitData ?? [:] },
                        set: { newData in
                            tripExpense.splitData = newData
                            let amount = Decimal(string: editableAmount) ?? item.amount
                            let computed = TripSplitCalculator.calculateSplits(
                                total: amount,
                                splitType: tripExpense.splitType,
                                participants: participants,
                                splitData: newData
                            )
                            tripExpense.computedSplits = computed
                            previewSplits = computed
                        }
                    ),
                    totalAmount: Decimal(string: editableAmount) ?? item.amount
                )
            }
            .presentationDetents([.large])
        }
    }

    // MARK: - Actions

    private func toggleEditSave() {
        if isEditing {
            item.note = editableNote.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : editableNote
            item.date = editableDate
            item.category = selectedCategory
            item.account = selectedAccount
            if let dec = Decimal(string: editableAmount) { item.amount = dec }
            
            if let tripExpense = item.tripExpense {
                tripExpense.paidByParticipant = selectedPayer
                tripExpense.computedSplits = previewSplits
                trip?.updatedAt = .now
            }
        }
        withAnimation { isEditing.toggle() }
    }
    
    private func recalculatePreviewSplits() {
        guard let tripExpense = item.tripExpense else { return }
        guard let amount = Decimal(string: editableAmount), amount > 0 else { return }
        
        previewSplits = TripSplitCalculator.calculateSplits(
            total: amount,
            splitType: tripExpense.splitType,
            participants: participants,
            splitData: tripExpense.splitData
        )
    }
    
    private func removeFromTrip() {
        guard let tripExpense = item.tripExpense else { return }
        let tripToUpdate = tripExpense.trip
        item.tripExpense = nil
        modelContext.delete(tripExpense)
        tripToUpdate?.updatedAt = .now
        Haptics.success()
    }

    private func assignToTrip(_ trip: Trip) {
        let paidBy = trip.participants?.first(where: { $0.isCurrentUser })
                    ?? trip.participants?.first
        
        let tripExpense = TripExpense(
            transaction: item,
            paidByParticipant: paidBy
        )
        tripExpense.trip = trip
        
        tripExpense.computedSplits = TripSplitCalculator.calculateSplits(
            total: item.amount,
            splitType: tripExpense.splitType,
            participants: trip.participants ?? [],
            splitData: tripExpense.splitData
        )
        
        item.tripExpense = tripExpense
        modelContext.insert(tripExpense)
        trip.updatedAt = .now
        
        selectedPayer = paidBy
        previewSplits = tripExpense.computedSplits ?? [:]
        
        Haptics.success()
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
