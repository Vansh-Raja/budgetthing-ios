//
//  AddTripView.swift
//  BudgetThing
//

import SwiftUI
import SwiftData

struct AddTripView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Environment(\._currencyCode) private var currencyCode

    @State private var name: String = ""
    @State private var emoji: String = "✈️"
    @State private var isGroup: Bool = false
    @State private var startDate: Date = Date()
    @State private var endDate: Date = Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date()
    @State private var hasBudget: Bool = false
    @State private var budgetString: String = ""

    @State private var showEmojiPicker: Bool = false
    @State private var showToast: Bool = false
    @State private var toastMessage: String = ""

    // Group trip participants
    @State private var participants: [ParticipantEntry] = []
    @State private var newParticipantName: String = ""

    struct ParticipantEntry: Identifiable {
        let id = UUID()
        var name: String
        var isCurrentUser: Bool
    }

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

                    // Trip Type Toggle
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Trip Type")
                            .font(.system(size: 12))
                            .foregroundStyle(.white.opacity(0.5))

                        HStack(spacing: 12) {
                            tripTypeButton(title: "Solo", icon: "person.fill", isSelected: !isGroup) {
                                isGroup = false
                            }
                            tripTypeButton(title: "Group", icon: "person.2.fill", isSelected: isGroup) {
                                isGroup = true
                                if participants.isEmpty {
                                    // Add "You" as first participant
                                    participants.append(ParticipantEntry(name: "You", isCurrentUser: true))
                                }
                            }
                        }
                    }

                    // Group Participants (if group trip)
                    if isGroup {
                        participantsSection
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

                    Spacer(minLength: 100)
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
                Button(action: { dismiss() }) {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                }
            }

            ToolbarItem(placement: .principal) {
                Text("New Trip")
                    .font(Font.custom("AvenirNextCondensed-Heavy", size: 22))
                    .foregroundStyle(.white)
            }

            ToolbarItem(placement: .topBarTrailing) {
                Button(action: saveTrip) {
                    Text("Save")
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                        .foregroundStyle(canSave ? .orange : .white.opacity(0.3))
                }
                .disabled(!canSave)
            }
        }
        .sheet(isPresented: $showEmojiPicker) {
            TripEmojiPickerView(selectedEmoji: $emoji)
                .presentationDetents([.large])
        }
        .preferredColorScheme(.dark)
    }

    // MARK: - Participants Section

    private var participantsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Participants")
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.5))

            VStack(spacing: 8) {
                ForEach(participants) { participant in
                    participantRow(participant)
                }

                // Add participant row
                HStack(spacing: 12) {
                    TextField("Add participant...", text: $newParticipantName)
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                        .foregroundStyle(.white)
                        .onSubmit {
                            addParticipant()
                        }

                    Button(action: addParticipant) {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(newParticipantName.isEmpty ? .white.opacity(0.3) : .orange)
                    }
                    .disabled(newParticipantName.isEmpty)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
            }
        }
    }

    private func participantRow(_ participant: ParticipantEntry) -> some View {
        HStack(spacing: 12) {
            Circle()
                .fill(Color(hex: TripParticipant.participantColors[participants.firstIndex(where: { $0.id == participant.id }) ?? 0 % TripParticipant.participantColors.count]) ?? .orange)
                .frame(width: 32, height: 32)
                .overlay(
                    Text(String(participant.name.prefix(1)).uppercased())
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
                        .foregroundStyle(.white)
                )

            Text(participant.isCurrentUser ? "You" : participant.name)
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                .foregroundStyle(.white)

            if participant.isCurrentUser {
                Text("(me)")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.5))
            }

            Spacer()

            if !participant.isCurrentUser {
                Button(action: { removeParticipant(participant) }) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(.white.opacity(0.4))
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.white.opacity(0.10), in: RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Helper Views

    private func tripTypeButton(title: String, icon: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: {
            Haptics.selection()
            action()
        }) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 14))
                Text(title)
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
            }
            .foregroundStyle(isSelected ? .white : .white.opacity(0.5))
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(
                isSelected ? Color.orange : Color.white.opacity(0.08),
                in: Capsule()
            )
        }
        .buttonStyle(.plain)
    }

    private var currencySymbol: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        return formatter.currencySymbol ?? "$"
    }

    // MARK: - Actions

    private func addParticipant() {
        let trimmedName = newParticipantName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { return }

        Haptics.light()
        participants.append(ParticipantEntry(name: trimmedName, isCurrentUser: false))
        newParticipantName = ""
    }

    private func removeParticipant(_ participant: ParticipantEntry) {
        Haptics.light()
        participants.removeAll { $0.id == participant.id }
    }

    private func saveTrip() {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            showToastMessage("Please enter a trip name")
            return
        }

        // Parse budget
        var budget: Decimal? = nil
        if hasBudget, !budgetString.isEmpty {
            if let value = Decimal(string: budgetString), value > 0 {
                budget = value
            }
        }

        // Create trip (dates are always required)
        let trip = Trip(
            name: trimmedName,
            emoji: emoji,
            startDate: startDate,
            endDate: endDate,
            budget: budget,
            isGroup: isGroup
        )

        modelContext.insert(trip)

        // Add participants for group trips
        if isGroup {
            for (index, entry) in participants.enumerated() {
                let colorHex = TripParticipant.participantColors[index % TripParticipant.participantColors.count]
                let participant = TripParticipant(
                    name: entry.name,
                    isCurrentUser: entry.isCurrentUser,
                    colorHex: colorHex,
                    trip: trip
                )
                modelContext.insert(participant)
            }
        }

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

// MARK: - Color Extension

extension Color {
    init?(hex: String) {
        var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        hexSanitized = hexSanitized.replacingOccurrences(of: "#", with: "")

        var rgb: UInt64 = 0
        guard Scanner(string: hexSanitized).scanHexInt64(&rgb) else { return nil }

        let r = Double((rgb & 0xFF0000) >> 16) / 255.0
        let g = Double((rgb & 0x00FF00) >> 8) / 255.0
        let b = Double(rgb & 0x0000FF) / 255.0

        self.init(red: r, green: g, blue: b)
    }
}

#Preview {
    NavigationStack {
        AddTripView()
    }
}
