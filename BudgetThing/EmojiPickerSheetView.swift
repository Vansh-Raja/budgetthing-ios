import SwiftUI

struct EmojiPickerSheetView: View {
    @Binding var selection: String
    @Environment(\.dismiss) private var dismiss

    private let columns: [GridItem] = [GridItem(.adaptive(minimum: 44), spacing: 10)]

    var body: some View {
        ZStack { Color.black.ignoresSafeArea() }
            .overlay(
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        Text("Most Used")
                            .font(Font.custom("AvenirNextCondensed-Heavy", size: 22))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 20)
                        LazyVGrid(columns: columns, spacing: 10) {
                            ForEach(EmojiCatalog.topEmojis, id: \.self) { item in
                                emojiButton(item)
                            }
                        }
                        .padding(.horizontal, 20)

                        ForEach(EmojiCatalog.groups) { group in
                            VStack(alignment: .leading, spacing: 10) {
                                Text(group.name)
                                    .font(Font.custom("AvenirNextCondensed-Heavy", size: 22))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 20)
                                LazyVGrid(columns: columns, spacing: 10) {
                                    ForEach(group.items, id: \.self) { item in
                                        emojiButton(item)
                                    }
                                }
                                .padding(.horizontal, 20)
                            }
                        }
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

    @ViewBuilder
    private func emojiButton(_ item: EmojiItem) -> some View {
        Button(action: { selection = item.emoji; Haptics.selection(); dismiss() }) {
            Text(item.emoji)
                .font(.system(size: 22))
                .frame(width: 44, height: 38)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(selection == item.emoji ? Color.white.opacity(0.18) : Color.white.opacity(0.08))
                )
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.12), lineWidth: 1))
                .accessibilityLabel(item.label)
        }
        .buttonStyle(.plain)
    }
}


