//
//  AddExpenseToTripView.swift
//  BudgetThing
//

import SwiftUI
import SwiftData

struct AddExpenseToTripView: View {
    @Bindable var trip: Trip
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Environment(\._currencyCode) private var currencyCode

    @Query(sort: \Category.sortIndex) private var categories: [Category]
    @Query(sort: \Account.sortIndex) private var accounts: [Account]

    @State private var amountString: String = ""
    @State private var selectedCategory: Category? = nil
    @State private var selectedAccount: Account? = nil
    @State private var note: String = ""
    @State private var date: Date = Date()

    // Group trip specific
    @State private var paidByParticipant: TripParticipant? = nil
    @State private var splitType: TripExpense.SplitType = .equal
    @State private var splitData: [UUID: Decimal] = [:]

    @State private var showCategoryPicker: Bool = false
    @State private var showSplitEditor: Bool = false
    @State private var showToast: Bool = false
    @State private var toastMessage: String = ""

    private var participants: [TripParticipant] {
        trip.participants ?? []
    }

    private var visibleCategories: [Category] {
        categories.filter { $0.isSystem != true }
    }

    private var amount: Decimal? {
        Decimal(string: amountString)
    }

    private var canSave: Bool {
        guard let amt = amount, amt > 0 else { return false }
        if trip.isGroup && paidByParticipant == nil { return false }
        return true
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Amount Input
                    amountSection

                    // Category Selection
                    categorySection

                    // Account Selection
                    accountSection

                    // Date Picker
                    dateSection

                    // Note
                    noteSection

                    // Group Trip: Who Paid
                    if trip.isGroup {
                        whoPaidSection
                        splitSection
                    }

                    Spacer(minLength: 100)
                }
                .padding(24)
            }
            .scrollIndicators(.hidden)

            // Toast
            if showToast {
                VStack {
                    toastView
                    Spacer()
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button(action: { dismiss() }) {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                }
            }

            ToolbarItem(placement: .principal) {
                Text("Add Expense")
                    .font(Font.custom("AvenirNextCondensed-Heavy", size: 22))
                    .foregroundStyle(.white)
            }

            ToolbarItem(placement: .topBarTrailing) {
                Button(action: saveExpense) {
                    Text("Save")
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                        .foregroundStyle(canSave ? .orange : .white.opacity(0.3))
                }
                .disabled(!canSave)
            }
        }
        .sheet(isPresented: $showCategoryPicker) {
            CategoryPickerSheet(selectedCategory: $selectedCategory, categories: visibleCategories)
                .presentationDetents([.medium])
        }
        .sheet(isPresented: $showSplitEditor) {
            NavigationStack {
                SplitEditorView(
                    participants: participants,
                    splitType: $splitType,
                    splitData: $splitData,
                    totalAmount: amount ?? 0
                )
            }
            .presentationDetents([.large])
        }
        .onAppear {
            // Default to current user as payer
            if trip.isGroup {
                paidByParticipant = participants.first { $0.isCurrentUser }
                // Initialize split data for equal split
                initializeSplitData()
            }
            // Default account
            if let defaultId = UserDefaults.standard.string(forKey: "defaultAccountID"),
               let uuid = UUID(uuidString: defaultId) {
                selectedAccount = accounts.first { $0.id == uuid }
            }
            if selectedAccount == nil {
                selectedAccount = accounts.first
            }
        }
        .preferredColorScheme(.dark)
    }

    // MARK: - Sections

    private var amountSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Amount")
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.5))

            HStack(spacing: 8) {
                Text(currencySymbol)
                    .font(Font.custom("AvenirNextCondensed-Heavy", size: 36))
                    .foregroundStyle(.white.opacity(0.5))

                TextField("0.00", text: $amountString)
                    .font(Font.custom("AvenirNextCondensed-Heavy", size: 36))
                    .foregroundStyle(.white)
                    .keyboardType(.decimalPad)
            }
        }
    }

    private var categorySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Category")
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.5))

            Button(action: { showCategoryPicker = true }) {
                HStack(spacing: 12) {
                    Text(selectedCategory?.emoji ?? "📝")
                        .font(.system(size: 24))

                    Text(selectedCategory?.name ?? "Select Category")
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                        .foregroundStyle(selectedCategory == nil ? .white.opacity(0.5) : .white)

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.system(size: 14))
                        .foregroundStyle(.white.opacity(0.3))
                }
                .padding(14)
                .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
        }
    }

    private var accountSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Account")
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.5))

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(accounts) { account in
                        accountPill(account)
                    }
                }
            }
        }
    }

    private func accountPill(_ account: Account) -> some View {
        let isSelected = selectedAccount?.id == account.id
        return Button(action: {
            Haptics.selection()
            selectedAccount = account
        }) {
            HStack(spacing: 6) {
                Text(account.emoji)
                    .font(.system(size: 14))
                Text(account.name)
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
            }
            .foregroundStyle(isSelected ? .white : .white.opacity(0.6))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                isSelected ? Color.orange : Color.white.opacity(0.08),
                in: Capsule()
            )
        }
        .buttonStyle(.plain)
    }

    private var dateSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Date")
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.5))

            DatePicker("", selection: $date, displayedComponents: [.date, .hourAndMinute])
                .labelsHidden()
                .tint(.orange)
        }
    }

    private var noteSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Note (Optional)")
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.5))

            TextField("Add a note...", text: $note)
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                .foregroundStyle(.white)
                .padding(12)
                .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
        }
    }

    private var whoPaidSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Who Paid?")
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.5))

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(participants) { participant in
                        participantPill(participant)
                    }
                }
            }
        }
    }

    private func participantPill(_ participant: TripParticipant) -> some View {
        let isSelected = paidByParticipant?.id == participant.id
        return Button(action: {
            Haptics.selection()
            paidByParticipant = participant
        }) {
            HStack(spacing: 6) {
                Circle()
                    .fill(Color(hex: participant.colorHex ?? "FF6B6B") ?? .orange)
                    .frame(width: 20, height: 20)
                    .overlay(
                        Text(String(participant.name.prefix(1)).uppercased())
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(.white)
                    )

                Text(participant.isCurrentUser ? "You" : participant.name)
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
            }
            .foregroundStyle(isSelected ? .white : .white.opacity(0.6))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                isSelected ? Color.orange : Color.white.opacity(0.08),
                in: Capsule()
            )
        }
        .buttonStyle(.plain)
    }

    private var splitSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Split")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.5))

                Spacer()

                Button(action: { showSplitEditor = true }) {
                    HStack(spacing: 4) {
                        Text("Customize")
                        Image(systemName: "chevron.right")
                    }
                    .font(.system(size: 12))
                    .foregroundStyle(.orange)
                }
            }

            // Split preview
            HStack(spacing: 12) {
                Image(systemName: splitType.icon)
                    .font(.system(size: 18))
                    .foregroundStyle(.orange)

                VStack(alignment: .leading, spacing: 2) {
                    Text(splitType.displayName)
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                        .foregroundStyle(.white)

                    Text(splitPreviewText)
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.5))
                }

                Spacer()
            }
            .padding(12)
            .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
        }
    }

    private var splitPreviewText: String {
        switch splitType {
        case .equal:
            return "Split equally among \(participants.count) people"
        case .equalSelected:
            let count = splitData.filter { $0.value > 0 }.count
            return "Split equally among \(count) people"
        case .percentage:
            return "Custom percentages"
        case .shares:
            return "Custom shares"
        case .exact:
            return "Exact amounts"
        }
    }

    private var toastView: some View {
        Text(toastMessage)
            .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(.black.opacity(0.8), in: Capsule())
            .padding(.top, 8)
            .transition(.move(edge: .top).combined(with: .opacity))
    }

    // MARK: - Helpers

    private var currencySymbol: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        return formatter.currencySymbol ?? "$"
    }

    private func initializeSplitData() {
        // For equal split, include all participants
        for participant in participants {
            splitData[participant.id] = 1 // Selected
        }
    }

    // MARK: - Save

    private func saveExpense() {
        guard let amt = amount, amt > 0 else {
            showToastMessage("Enter an amount greater than 0")
            return
        }

        // Create transaction
        let transaction = Transaction(
            amount: amt,
            date: date,
            note: note.isEmpty ? nil : note,
            category: selectedCategory,
            account: selectedAccount,
            type: "expense"
        )
        modelContext.insert(transaction)

        // Create trip expense
        let tripExpense = TripExpense(
            trip: trip,
            transaction: transaction,
            paidByParticipant: paidByParticipant,
            splitType: splitType,
            splitData: splitData.isEmpty ? nil : splitData
        )

        // Calculate and store computed splits
        if trip.isGroup {
            let computed = TripSplitCalculator.calculateSplits(
                total: amt,
                splitType: splitType,
                participants: participants,
                splitData: splitData.isEmpty ? nil : splitData
            )
            tripExpense.computedSplits = computed
        }

        modelContext.insert(tripExpense)
        transaction.tripExpense = tripExpense

        trip.updatedAt = .now

        Haptics.success()
        dismiss()
    }

    private func showToastMessage(_ message: String) {
        toastMessage = message
        Haptics.error()
        withAnimation(.easeOut(duration: 0.2)) {
            showToast = true
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
            withAnimation(.easeOut(duration: 0.25)) {
                showToast = false
            }
        }
    }
}

// MARK: - Split Type Icon Extension

extension TripExpense.SplitType {
    var icon: String {
        switch self {
        case .equal: return "equal.circle"
        case .equalSelected: return "person.2.circle"
        case .exact: return "number.circle"
        case .percentage: return "percent"
        case .shares: return "chart.pie"
        }
    }
}

// MARK: - Category Picker Sheet

struct CategoryPickerSheet: View {
    @Binding var selectedCategory: Category?
    let categories: [Category]
    @Environment(\.dismiss) private var dismiss

    private let columns = [GridItem(.adaptive(minimum: 70))]

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 16) {
                Text("Select Category")
                    .font(Font.custom("AvenirNextCondensed-Heavy", size: 22))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20)
                    .padding(.top, 20)

                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(categories) { category in
                        Button(action: {
                            Haptics.selection()
                            selectedCategory = category
                            dismiss()
                        }) {
                            VStack(spacing: 6) {
                                Text(category.emoji)
                                    .font(.system(size: 28))

                                Text(category.name)
                                    .font(.system(size: 11))
                                    .foregroundStyle(.white.opacity(0.7))
                                    .lineLimit(1)
                            }
                            .frame(width: 70, height: 70)
                            .background(
                                selectedCategory?.id == category.id ? Color.orange : Color.white.opacity(0.08),
                                in: RoundedRectangle(cornerRadius: 12)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 20)

                Spacer()
            }
        }
        .preferredColorScheme(.dark)
    }
}

#Preview {
    NavigationStack {
        AddExpenseToTripView(trip: Trip(name: "Test", emoji: "✈️", isGroup: true))
    }
}
