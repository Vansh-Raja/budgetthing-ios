import SwiftUI

struct CurrencyPickerView: View {
    @Binding var selectedCode: String

    var body: some View {
        ZStack { Color(.black).ignoresSafeArea() }
            .overlay(
                VStack(alignment: .leading, spacing: 12) {
                    Text("Choose Currency")
                        .font(Font.custom("AvenirNextCondensed-Heavy", size: 28))
                        .foregroundStyle(.white)
                    List {
                        ForEach(CurrencyUtils.popular, id: \.code) { entry in
                            HStack(spacing: 8) {
                                Text(CurrencyUtils.symbol(for: entry.code))
                                    .foregroundStyle(.white)
                                Text(entry.code)
                                    .foregroundStyle(.white)
                                Text("·")
                                    .foregroundStyle(.white.opacity(0.4))
                                Text(entry.name)
                                    .foregroundStyle(.white.opacity(0.8))
                                Spacer()
                                if entry.code == selectedCode { Image(systemName: "checkmark").foregroundStyle(.orange) }
                            }
                            .contentShape(Rectangle())
                            .listRowBackground(Color.clear)
                            .onTapGesture { selectedCode = entry.code }
                        }
                    }
                    .scrollContentBackground(.hidden)
                    .listStyle(.plain)
                }
                .padding(20)
            )
            .preferredColorScheme(.dark)
    }
}




