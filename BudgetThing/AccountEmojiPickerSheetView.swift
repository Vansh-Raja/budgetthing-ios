import SwiftUI

struct AccountEmojiPickerSheetView: View {
    @Binding var selection: String
    let kind: Account.Kind
    @Environment(\.dismiss) private var dismiss

    private let columns: [GridItem] = [GridItem(.adaptive(minimum: 44), spacing: 10)]

    var body: some View {
        ZStack { Color.black.ignoresSafeArea() }
            .overlay(
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        Text(title(for: kind))
                            .font(Font.custom("AvenirNextCondensed-Heavy", size: 22))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 20)
                        LazyVGrid(columns: columns, spacing: 10) {
                            ForEach(AccountEmojiCatalog.list(for: kind), id: \.self) { e in
                                Button(action: { selection = e; Haptics.selection(); dismiss() }) {
                                    Text(e)
                                        .font(.system(size: 22))
                                        .frame(width: 44, height: 38)
                                        .background(
                                            RoundedRectangle(cornerRadius: 10)
                                                .fill(selection == e ? Color.white.opacity(0.18) : Color.white.opacity(0.08))
                                        )
                                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.12), lineWidth: 1))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 20)
                        Spacer(minLength: 12)
                    }
                    .padding(.top, 16)
                }
            )
            .toolbarBackground(.black, for: .automatic)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: { dismiss() }) { Image(systemName: "chevron.down") }
                }
            }
            .preferredColorScheme(.dark)
    }

    private func title(for kind: Account.Kind) -> String {
        switch kind {
        case .cash: return "Cash & Wallet"
        case .bank: return "Bank Account"
        case .credit: return "Card · Credit/Debit"
        }
    }
}


