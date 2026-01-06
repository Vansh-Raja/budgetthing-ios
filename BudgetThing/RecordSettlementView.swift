//
//  RecordSettlementView.swift
//  BudgetThing
//

import SwiftUI
import SwiftData

struct RecordSettlementView: View {
    @Bindable var trip: Trip
    var fromParticipant: TripParticipant?
    var toParticipant: TripParticipant?
    var suggestedAmount: Decimal?

    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Environment(\._currencyCode) private var currencyCode

    @State private var selectedFrom: TripParticipant? = nil
    @State private var selectedTo: TripParticipant? = nil
    @State private var amountString: String = ""
    @State private var note: String = ""
    @State private var date: Date = Date()

    @State private var showToast: Bool = false
    @State private var toastMessage: String = ""

    private var participants: [TripParticipant] {
        trip.participants ?? []
    }

    private var amount: Decimal? {
        Decimal(string: amountString)
    }

    private var canSave: Bool {
        guard let amt = amount, amt > 0 else { return false }
        guard selectedFrom != nil && selectedTo != nil else { return false }
        guard selectedFrom?.id != selectedTo?.id else { return false }
        return true
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 24) {
                // From -> To Row
                HStack(spacing: 20) {
                    // From Person
                    VStack(spacing: 8) {
                        Text("From")
                            .font(.system(size: 11))
                            .foregroundStyle(.white.opacity(0.5))

                        Menu {
                            ForEach(participants) { participant in
                                Button(action: { selectedFrom = participant }) {
                                    HStack {
                                        Text(participant.isCurrentUser ? "You" : participant.name)
                                        if selectedFrom?.id == participant.id {
                                            Image(systemName: "checkmark")
                                        }
                                    }
                                }
                            }
                        } label: {
                            VStack(spacing: 6) {
                                Circle()
                                    .fill(Color(hex: selectedFrom?.colorHex ?? "666666") ?? .gray)
                                    .frame(width: 50, height: 50)
                                    .overlay(
                                        Group {
                                            if let from = selectedFrom {
                                                Text(String(from.name.prefix(1)).uppercased())
                                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 20))
                                                    .foregroundStyle(.white)
                                            } else {
                                                Image(systemName: "person.fill")
                                                    .foregroundStyle(.white.opacity(0.5))
                                            }
                                        }
                                    )

                                Text(selectedFrom?.isCurrentUser == true ? "You" : selectedFrom?.name ?? "Select")
                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
                                    .foregroundStyle(.white)
                                    .lineLimit(1)
                            }
                        }
                    }
                    .frame(width: 80)

                    // Arrow
                    VStack(spacing: 8) {
                        Image(systemName: "arrow.right")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(.orange)

                        Text("pays")
                            .font(.system(size: 12))
                            .foregroundStyle(.white.opacity(0.5))
                    }

                    // To Person
                    VStack(spacing: 8) {
                        Text("To")
                            .font(.system(size: 11))
                            .foregroundStyle(.white.opacity(0.5))

                        Menu {
                            ForEach(participants) { participant in
                                Button(action: { selectedTo = participant }) {
                                    HStack {
                                        Text(participant.isCurrentUser ? "You" : participant.name)
                                        if selectedTo?.id == participant.id {
                                            Image(systemName: "checkmark")
                                        }
                                    }
                                }
                            }
                        } label: {
                            VStack(spacing: 6) {
                                Circle()
                                    .fill(Color(hex: selectedTo?.colorHex ?? "666666") ?? .gray)
                                    .frame(width: 50, height: 50)
                                    .overlay(
                                        Group {
                                            if let to = selectedTo {
                                                Text(String(to.name.prefix(1)).uppercased())
                                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 20))
                                                    .foregroundStyle(.white)
                                            } else {
                                                Image(systemName: "person.fill")
                                                    .foregroundStyle(.white.opacity(0.5))
                                            }
                                        }
                                    )

                                Text(selectedTo?.isCurrentUser == true ? "You" : selectedTo?.name ?? "Select")
                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
                                    .foregroundStyle(.white)
                                    .lineLimit(1)
                            }
                        }
                    }
                    .frame(width: 80)
                }

                // Amount
                VStack(alignment: .leading, spacing: 8) {
                    Text("Amount")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.5))

                    HStack(spacing: 8) {
                        Text(currencySymbol)
                            .font(Font.custom("AvenirNextCondensed-Heavy", size: 32))
                            .foregroundStyle(.white.opacity(0.5))

                        TextField("0.00", text: $amountString)
                            .font(Font.custom("AvenirNextCondensed-Heavy", size: 32))
                            .foregroundStyle(.white)
                            .keyboardType(.decimalPad)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)

                // Date
                HStack {
                    Text("Date")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.5))

                    Spacer()

                    DatePicker("", selection: $date, displayedComponents: .date)
                        .labelsHidden()
                        .tint(.orange)
                }
                .padding(.horizontal, 20)

                // Note
                VStack(alignment: .leading, spacing: 8) {
                    Text("Note (Optional)")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.5))

                    TextField("e.g., Cash, Venmo, etc.", text: $note)
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                        .foregroundStyle(.white)
                        .padding(12)
                        .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                }
                .padding(.horizontal, 20)

                Spacer()
            }
            .padding(.top, 24)

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
                Text("Record Settlement")
                    .font(Font.custom("AvenirNextCondensed-Heavy", size: 20))
                    .foregroundStyle(.white)
            }

            ToolbarItem(placement: .topBarTrailing) {
                Button("Save") { saveSettlement() }
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(canSave ? .orange : .white.opacity(0.3))
                    .disabled(!canSave)
            }
        }
        .onAppear {
            // Pre-fill if provided
            selectedFrom = fromParticipant
            selectedTo = toParticipant
            if let suggested = suggestedAmount {
                amountString = "\(suggested)"
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

    private func saveSettlement() {
        guard let amt = amount, amt > 0 else {
            showToastMessage("Enter a valid amount")
            return
        }

        guard let from = selectedFrom, let to = selectedTo else {
            showToastMessage("Select both participants")
            return
        }

        guard from.id != to.id else {
            showToastMessage("Cannot settle with yourself")
            return
        }

        let settlement = TripSettlement(
            amount: amt,
            date: date,
            note: note.isEmpty ? nil : note,
            trip: trip,
            fromParticipant: from,
            toParticipant: to
        )

        modelContext.insert(settlement)
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

#Preview {
    NavigationStack {
        RecordSettlementView(trip: Trip(name: "Test", emoji: "✈️", isGroup: true))
    }
}
