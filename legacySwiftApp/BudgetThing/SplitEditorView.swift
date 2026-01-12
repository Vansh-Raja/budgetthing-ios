//
//  SplitEditorView.swift
//  BudgetThing
//

import SwiftUI

struct SplitEditorView: View {
    let participants: [TripParticipant]
    @Binding var splitType: TripExpense.SplitType
    @Binding var splitData: [UUID: Decimal]
    let totalAmount: Decimal

    @Environment(\.dismiss) private var dismiss
    @Environment(\._currencyCode) private var currencyCode

    @State private var localSplitData: [UUID: String] = [:]
    @State private var showValidationError: Bool = false
    @State private var validationMessage: String = ""

    private var computedSplits: [UUID: Decimal] {
        TripSplitCalculator.calculateSplits(
            total: totalAmount,
            splitType: splitType,
            participants: participants,
            splitData: parsedSplitData
        )
    }

    private var parsedSplitData: [UUID: Decimal] {
        var result: [UUID: Decimal] = [:]
        for (id, valueStr) in localSplitData {
            if let value = Decimal(string: valueStr) {
                result[id] = value
            }
        }
        return result
    }

    private var isValid: Bool {
        switch splitType {
        case .equal:
            return true
        case .equalSelected:
            return parsedSplitData.values.contains { $0 > 0 }
        case .percentage:
            let sum = parsedSplitData.values.reduce(0, +)
            return sum == 100
        case .shares:
            let sum = parsedSplitData.values.reduce(0, +)
            return sum > 0
        case .exact:
            let sum = parsedSplitData.values.reduce(0, +)
            return sum == totalAmount
        }
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                // Split Type Selector
                splitTypeSelector

                ScrollView {
                    VStack(spacing: 20) {
                        // Description
                        Text(splitType.description)
                            .font(.system(size: 14))
                            .foregroundStyle(.white.opacity(0.6))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 20)
                            .padding(.top, 16)

                        // Participant List
                        participantsList

                        // Validation Summary
                        validationSummary

                        Spacer(minLength: 40)
                    }
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Cancel") { dismiss() }
                    .foregroundStyle(.white)
            }

            ToolbarItem(placement: .principal) {
                Text("Split Options")
                    .font(Font.custom("AvenirNextCondensed-Heavy", size: 20))
                    .foregroundStyle(.white)
            }

            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") { saveSplit() }
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(isValid ? .orange : .white.opacity(0.3))
                    .disabled(!isValid)
            }
        }
        .onAppear {
            initializeLocalData(repopulateExisting: true)
        }
        .preferredColorScheme(.dark)
    }

    // MARK: - Split Type Selector

    private var splitTypeSelector: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(TripExpense.SplitType.allCases) { type in
                    splitTypeButton(type)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .background(.white.opacity(0.04))
    }

    private func splitTypeButton(_ type: TripExpense.SplitType) -> some View {
        Button(action: {
            Haptics.selection()
            splitType = type
            // Don't repopulate when changing types - reset to defaults
            initializeLocalData(repopulateExisting: false)
        }) {
            HStack(spacing: 6) {
                Image(systemName: type.icon)
                    .font(.system(size: 12))
                Text(type.displayName)
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
            }
            .foregroundStyle(splitType == type ? .white : .white.opacity(0.5))
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(
                splitType == type ? Color.orange : Color.white.opacity(0.08),
                in: Capsule()
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Participants List

    private var participantsList: some View {
        VStack(spacing: 0) {
            ForEach(participants) { participant in
                participantRow(participant)

                if participant.id != participants.last?.id {
                    Rectangle()
                        .fill(.white.opacity(0.06))
                        .frame(height: 1)
                        .padding(.leading, 60)
                }
            }
        }
        .background(.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 20)
    }

    private func participantRow(_ participant: TripParticipant) -> some View {
        HStack(spacing: 12) {
            // Avatar
            Circle()
                .fill(Color(hex: participant.colorHex ?? "FF6B6B") ?? .orange)
                .frame(width: 36, height: 36)
                .overlay(
                    Text(String(participant.name.prefix(1)).uppercased())
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
                        .foregroundStyle(.white)
                )

            // Name
            Text(participant.isCurrentUser ? "You" : participant.name)
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                .foregroundStyle(.white)

            Spacer()

            // Input based on split type
            switch splitType {
            case .equal:
                // Show calculated amount
                Text(formatCurrency(computedSplits[participant.id] ?? 0))
                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                    .foregroundStyle(.white.opacity(0.6))

            case .equalSelected:
                // Checkbox
                Button(action: {
                    Haptics.light()
                    let current = Decimal(string: localSplitData[participant.id] ?? "0") ?? 0
                    localSplitData[participant.id] = current > 0 ? "0" : "1"
                }) {
                    let isSelected = (Decimal(string: localSplitData[participant.id] ?? "0") ?? 0) > 0
                    Circle()
                        .stroke(isSelected ? Color.orange : Color.white.opacity(0.3), lineWidth: 2)
                        .frame(width: 24, height: 24)
                        .overlay(
                            Circle()
                                .fill(isSelected ? Color.orange : Color.clear)
                                .frame(width: 14, height: 14)
                        )
                }

                if (Decimal(string: localSplitData[participant.id] ?? "0") ?? 0) > 0 {
                    Text(formatCurrency(computedSplits[participant.id] ?? 0))
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
                        .foregroundStyle(.white.opacity(0.6))
                        .frame(width: 70, alignment: .trailing)
                }

            case .percentage:
                HStack(spacing: 4) {
                    TextField("0", text: binding(for: participant.id))
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                        .foregroundStyle(.white)
                        .keyboardType(.decimalPad)
                        .frame(width: 50)
                        .multilineTextAlignment(.trailing)

                    Text("%")
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                        .foregroundStyle(.white.opacity(0.5))
                }

            case .shares:
                HStack(spacing: 8) {
                    Button(action: {
                        Haptics.light()
                        let current = Decimal(string: localSplitData[participant.id] ?? "0") ?? 0
                        if current > 0 {
                            localSplitData[participant.id] = "\(max(0, current - 1))"
                        }
                    }) {
                        Image(systemName: "minus.circle.fill")
                            .font(.system(size: 24))
                            .foregroundStyle(.white.opacity(0.4))
                    }

                    Text(localSplitData[participant.id] ?? "0")
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 20))
                        .foregroundStyle(.white)
                        .frame(width: 30)

                    Button(action: {
                        Haptics.light()
                        let current = Decimal(string: localSplitData[participant.id] ?? "0") ?? 0
                        localSplitData[participant.id] = "\(current + 1)"
                    }) {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 24))
                            .foregroundStyle(.orange)
                    }
                }

            case .exact:
                HStack(spacing: 4) {
                    Text(currencySymbol)
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
                        .foregroundStyle(.white.opacity(0.5))

                    TextField("0.00", text: binding(for: participant.id))
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                        .foregroundStyle(.white)
                        .keyboardType(.decimalPad)
                        .frame(width: 80)
                        .multilineTextAlignment(.trailing)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    // MARK: - Validation Summary

    private var validationSummary: some View {
        VStack(spacing: 8) {
            switch splitType {
            case .equal:
                HStack {
                    Text("Each person pays")
                    Spacer()
                    Text(formatCurrency(computedSplits.values.first ?? 0))
                        .fontWeight(.semibold)
                }

            case .equalSelected:
                let selectedCount = parsedSplitData.filter { $0.value > 0 }.count
                HStack {
                    Text("\(selectedCount) selected · Each pays")
                    Spacer()
                    if selectedCount > 0 {
                        Text(formatCurrency(computedSplits.values.first ?? 0))
                            .fontWeight(.semibold)
                    }
                }

            case .percentage:
                let sum = parsedSplitData.values.reduce(0, +)
                HStack {
                    Text("Total")
                    Spacer()
                    Text("\(NSDecimalNumber(decimal: sum))%")
                        .foregroundStyle(sum == 100 ? .green : .orange)
                        .fontWeight(.semibold)
                }
                if sum != 100 {
                    Text("Must equal 100%")
                        .font(.system(size: 12))
                        .foregroundStyle(.orange)
                }

            case .shares:
                let totalShares = parsedSplitData.values.reduce(0, +)
                HStack {
                    Text("Total shares")
                    Spacer()
                    Text("\(NSDecimalNumber(decimal: totalShares))")
                        .fontWeight(.semibold)
                }

            case .exact:
                let sum = parsedSplitData.values.reduce(0, +)
                let remaining = totalAmount - sum

                HStack {
                    Text("Total")
                    Spacer()
                    Text(formatCurrency(sum))
                        .foregroundStyle(remaining == 0 ? .green : .orange)
                        .fontWeight(.semibold)
                }

                HStack {
                    if remaining > 0 {
                        Text("\(formatCurrency(remaining)) left")
                    } else if remaining < 0 {
                        Text("Over by \(formatCurrency(-remaining))")
                    } else {
                        Text("\(formatCurrency(0)) left")
                    }

                    Spacer()

                    Text(remaining == 0 ? "Matches \(formatCurrency(totalAmount))" : "Must equal \(formatCurrency(totalAmount))")
                }
                .font(.system(size: 12))
                .foregroundStyle(remaining == 0 ? .green : .orange)
            }
        }
        .font(.system(size: 14))
        .foregroundStyle(.white.opacity(0.7))
        .padding(16)
        .background(.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 20)
    }

    // MARK: - Helpers

    private var currencySymbol: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        return formatter.currencySymbol ?? "$"
    }

    private func formatCurrency(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        formatter.maximumFractionDigits = 2
        return formatter.string(from: value as NSDecimalNumber) ?? "\(value)"
    }

    private func binding(for id: UUID) -> Binding<String> {
        Binding(
            get: { localSplitData[id] ?? "" },
            set: { localSplitData[id] = $0 }
        )
    }

    private func initializeLocalData(repopulateExisting: Bool) {
        localSplitData = [:]
        
        // Only check for existing data if we're repopulating (initial load)
        // When changing split types, we want fresh defaults
        let hasExistingData = repopulateExisting && !splitData.isEmpty

        switch splitType {
        case .equal:
            // No input needed
            break

        case .equalSelected:
            for participant in participants {
                if hasExistingData {
                    // Repopulate from existing splitData
                    if let value = splitData[participant.id], value > 0 {
                        localSplitData[participant.id] = "1"
                    } else {
                        localSplitData[participant.id] = "0"
                    }
                } else {
                    // All selected by default
                    localSplitData[participant.id] = "1"
                }
            }

        case .percentage:
            if hasExistingData {
                for participant in participants {
                    if let value = splitData[participant.id] {
                        localSplitData[participant.id] = "\(NSDecimalNumber(decimal: value))"
                    } else {
                        localSplitData[participant.id] = "0"
                    }
                }
            } else {
                // Equal percentages by default
                guard participants.count > 0 else { return }
                let equalPct = 100 / participants.count
                for (index, participant) in participants.enumerated() {
                    if index == participants.count - 1 {
                        // Last one gets remainder
                        localSplitData[participant.id] = "\(100 - equalPct * (participants.count - 1))"
                    } else {
                        localSplitData[participant.id] = "\(equalPct)"
                    }
                }
            }

        case .shares:
            if hasExistingData {
                for participant in participants {
                    if let value = splitData[participant.id] {
                        // Round to nearest integer to avoid truncation
                        let rounded = NSDecimalNumber(decimal: value).rounding(accordingToBehavior: nil)
                        localSplitData[participant.id] = "\(rounded.intValue)"
                    } else {
                        localSplitData[participant.id] = "0"
                    }
                }
            } else {
                // 1 share each by default
                for participant in participants {
                    localSplitData[participant.id] = "1"
                }
            }

        case .exact:
            if hasExistingData {
                for participant in participants {
                    if let value = splitData[participant.id] {
                        // Format as decimal string (e.g., "50.00" or "25.50")
                        let formatter = NumberFormatter()
                        formatter.numberStyle = .decimal
                        formatter.minimumFractionDigits = 0
                        formatter.maximumFractionDigits = 2
                        formatter.usesGroupingSeparator = false
                        localSplitData[participant.id] = formatter.string(from: value as NSDecimalNumber) ?? ""
                    } else {
                        localSplitData[participant.id] = ""
                    }
                }
            } else {
                // Empty by default
                for participant in participants {
                    localSplitData[participant.id] = ""
                }
            }
        }
    }

    private func saveSplit() {
        splitData = parsedSplitData
        dismiss()
    }
}

#Preview {
    NavigationStack {
        SplitEditorView(
            participants: [],
            splitType: .constant(.equal),
            splitData: .constant([:]),
            totalAmount: 100
        )
    }
}
