//
//  EditTripView.swift
//  BudgetThing
//

import SwiftUI
import SwiftData

struct EditTripView: View {
    @Bindable var trip: Trip
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Environment(\._currencyCode) private var currencyCode

    @State private var name: String = ""
    @State private var emoji: String = ""
    @State private var startDate: Date = Date()
    @State private var endDate: Date = Date()
    @State private var hasBudget: Bool = false
    @State private var budgetString: String = ""

    @State private var showEmojiPicker: Bool = false
    @State private var showDeleteConfirm: Bool = false
    @State private var showToast: Bool = false
    @State private var toastMessage: String = ""

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Emoji & Name Row
                    HStack(spacing: 16) {
                        Button(action: { showEmojiPicker = true }) {
                            Text(emoji)
                                .font(.system(size: 44))
                                .frame(width: 64, height: 64)
                                .background(.white.opacity(0.10), in: RoundedRectangle(cornerRadius: 12))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12)
                                        .stroke(.white.opacity(0.15), lineWidth: 1)
                                )
                        }

                        VStack(alignment: .leading, spacing: 4) {
                            Text("Trip Name")
                                .font(.system(size: 12))
                                .foregroundStyle(.white.opacity(0.5))

                            TextField("e.g., Japan 2025", text: $name)
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 22))
                                .foregroundStyle(.white)
                                .textInputAutocapitalization(.words)
                        }
                    }

                    // Trip Dates (Required)
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 8) {
                            Image(systemName: "calendar")
                                .foregroundStyle(.white.opacity(0.7))
                            Text("Trip Dates")
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                                .foregroundStyle(.white)
                        }

                        HStack(spacing: 16) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Start")
                                    .font(.system(size: 11))
                                    .foregroundStyle(.white.opacity(0.5))
                                DatePicker("", selection: $startDate, displayedComponents: .date)
                                    .labelsHidden()
                                    .tint(.orange)
                            }

                            VStack(alignment: .leading, spacing: 4) {
                                Text("End")
                                    .font(.system(size: 11))
                                    .foregroundStyle(.white.opacity(0.5))
                                DatePicker("", selection: $endDate, in: startDate..., displayedComponents: .date)
                                    .labelsHidden()
                                    .tint(.orange)
                            }

                            Spacer()
                        }
                        .padding(.leading, 4)
                    }

                    // Budget Toggle
                    VStack(alignment: .leading, spacing: 12) {
                        Toggle(isOn: $hasBudget) {
                            HStack(spacing: 8) {
                                Image(systemName: "dollarsign.circle")
                                    .foregroundStyle(.white.opacity(0.7))
                                Text("Set Budget")
                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                                    .foregroundStyle(.white)
                            }
                        }
                        .tint(.orange)

                        if hasBudget {
                            HStack(spacing: 8) {
                                Text(currencySymbol)
                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 22))
                                    .foregroundStyle(.white.opacity(0.5))

                                TextField("0.00", text: $budgetString)
                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 22))
                                    .foregroundStyle(.white)
                                    .keyboardType(.decimalPad)
                            }
                            .padding(.leading, 4)
                        }
                    }

                    // Trip Info
                    if trip.isGroup {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Trip Type")
                                .font(.system(size: 12))
                                .foregroundStyle(.white.opacity(0.5))

                            HStack(spacing: 8) {
                                Image(systemName: "person.2.fill")
                                    .font(.system(size: 14))
                                Text("Group Trip")
                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                                Text("· \(trip.participants?.count ?? 0) participants")
                                    .font(.system(size: 14))
                                    .foregroundStyle(.white.opacity(0.5))
                            }
                            .foregroundStyle(.white)
                        }
                    }

                    Spacer(minLength: 40)

                    // Delete Button
                    Button(action: { showDeleteConfirm = true }) {
                        HStack {
                            Image(systemName: "trash")
                            Text("Delete Trip")
                        }
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(.red.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                    }
                }
                .padding(24)
            }
            .scrollIndicators(.hidden)

            // Toast
            if showToast {
                VStack {
                    Text(toastMessage)
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(.black.opacity(0.8), in: Capsule())
                        .padding(.top, 8)
                    Spacer()
                }
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Cancel") { dismiss() }
                    .foregroundStyle(.white)
            }

            ToolbarItem(placement: .principal) {
                Text("Edit Trip")
                    .font(Font.custom("AvenirNextCondensed-Heavy", size: 22))
                    .foregroundStyle(.white)
            }

            ToolbarItem(placement: .topBarTrailing) {
                Button("Save") { saveChanges() }
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(canSave ? .orange : .white.opacity(0.3))
                    .disabled(!canSave)
            }
        }
        .sheet(isPresented: $showEmojiPicker) {
            TripEmojiPickerView(selectedEmoji: $emoji)
                .presentationDetents([.large])
        }
        .confirmationDialog("Delete Trip?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { deleteTrip() }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("This will remove the trip and unlink all expenses. The transactions themselves will not be deleted.")
        }
        .onAppear {
            // Load current values
            name = trip.name
            emoji = trip.emoji
            startDate = trip.startDate ?? Date()
            endDate = trip.endDate ?? Calendar.current.date(byAdding: .day, value: 7, to: trip.startDate ?? Date()) ?? Date()
            hasBudget = trip.budget != nil
            if let budget = trip.budget {
                budgetString = "\(budget)"
            }
        }
        .preferredColorScheme(.dark)
    }

    private var currencySymbol: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        return formatter.currencySymbol ?? "$"
    }

    private func saveChanges() {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            showToastMessage("Please enter a trip name")
            return
        }

        trip.name = trimmedName
        trip.emoji = emoji
        trip.startDate = startDate
        trip.endDate = endDate

        if hasBudget, let value = Decimal(string: budgetString), value > 0 {
            trip.budget = value
        } else {
            trip.budget = nil
        }

        trip.updatedAt = .now

        Haptics.success()
        dismiss()
    }

    private func deleteTrip() {
        // Hard delete the trip
        modelContext.delete(trip)
        try? modelContext.save()
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

#Preview {
    NavigationStack {
        EditTripView(trip: Trip(name: "Japan 2025", emoji: "🇯🇵", budget: 3000))
    }
}
