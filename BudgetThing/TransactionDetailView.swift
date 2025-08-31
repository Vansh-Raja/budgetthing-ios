//
//  TransactionDetailView.swift
//  BudgetThing
//

import SwiftUI

struct TransactionDetailView: View {
    let item: Item

    var body: some View {
        ZStack {
            Color(.black).ignoresSafeArea()
            VStack(spacing: 24) {
                if let emoji = item.categoryEmoji, !emoji.isEmpty {
                    Text(emoji)
                        .font(.system(size: 48))
                }
                Text(formattedAmount(item.amount))
                    .font(Font.custom("AvenirNextCondensed-Heavy", size: 64))
                    .foregroundStyle(.white)
                Text(item.timestamp.formatted(date: .abbreviated, time: .shortened))
                    .foregroundStyle(.white.opacity(0.7))
                Spacer()
            }
            .padding(24)
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.black, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .preferredColorScheme(.dark)
    }

    private func formattedAmount(_ amount: Decimal?) -> String {
        let number = NSDecimalNumber(decimal: amount ?? 0)
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        return formatter.string(from: number) ?? "$0"
    }
}

#Preview {
    TransactionDetailView(item: Item(timestamp: Date(), amount: 12.34))
}


