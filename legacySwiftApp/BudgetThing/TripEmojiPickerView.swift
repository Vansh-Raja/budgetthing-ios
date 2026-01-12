//
//  TripEmojiPickerView.swift
//  BudgetThing
//

import SwiftUI

struct TripEmojiPickerView: View {
    @Binding var selectedEmoji: String
    @Environment(\.dismiss) private var dismiss

    private let columns = [GridItem(.adaptive(minimum: 44))]

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 16) {
                // Header
                HStack {
                    Button(action: { dismiss() }) {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(.white)
                    }
                    Spacer()
                    Text("Choose Emoji")
                        .font(Font.custom("AvenirNextCondensed-Heavy", size: 22))
                        .foregroundStyle(.white)
                    Spacer()
                    // Spacer for balance
                    Image(systemName: "chevron.down")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(.clear)
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)

                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        ForEach(TripEmojiCatalog.sections, id: \.title) { section in
                            VStack(alignment: .leading, spacing: 12) {
                                Text(section.title)
                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                                    .foregroundStyle(.white.opacity(0.6))

                                LazyVGrid(columns: columns, spacing: 8) {
                                    ForEach(section.emojis, id: \.self) { emoji in
                                        emojiButton(emoji)
                                    }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 40)
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private func emojiButton(_ emoji: String) -> some View {
        Button(action: {
            Haptics.selection()
            selectedEmoji = emoji
            dismiss()
        }) {
            Text(emoji)
                .font(.system(size: 28))
                .frame(width: 44, height: 38)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(selectedEmoji == emoji ? Color.orange : Color.white.opacity(0.08))
                )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Trip Emoji Catalog

enum TripEmojiCatalog {
    struct Section {
        let title: String
        let emojis: [String]
    }

    static let sections: [Section] = [
        Section(title: "Travel", emojis: [
            "✈️", "🛫", "🛬", "🚀", "🛸", "🚁", "🛩️", "🪂",
            "🚂", "🚃", "🚄", "🚅", "🚆", "🚇", "🚈", "🚊",
            "🚗", "🚕", "🚙", "🏎️", "🚌", "🚐", "🛻", "🚚",
            "🚢", "⛴️", "🛳️", "🚤", "⛵", "🛶", "🚲", "🛵"
        ]),
        Section(title: "Places", emojis: [
            "🏖️", "🏝️", "🏜️", "🏕️", "⛺", "🏔️", "🗻", "🌋",
            "🏠", "🏡", "🏢", "🏨", "🏩", "🏪", "🏫", "🏛️",
            "⛪", "🕌", "🕍", "🛕", "🏰", "🏯", "🗼", "🗽",
            "🎡", "🎢", "🎠", "⛲", "🌉", "🌁", "🏟️", "🎪"
        ]),
        Section(title: "Activities", emojis: [
            "🎿", "🏂", "🏄", "🏊", "🚴", "🧗", "🤿", "🏌️",
            "⛷️", "🛷", "🎣", "🏹", "🎯", "🎳", "🎾", "⚽",
            "🏀", "🏈", "⚾", "🎮", "🎲", "🎰", "🎭", "🎨"
        ]),
        Section(title: "Countries", emojis: [
            "🇺🇸", "🇬🇧", "🇫🇷", "🇩🇪", "🇮🇹", "🇪🇸", "🇵🇹", "🇳🇱",
            "🇯🇵", "🇰🇷", "🇨🇳", "🇹🇭", "🇻🇳", "🇮🇩", "🇮🇳", "🇦🇺",
            "🇳🇿", "🇨🇦", "🇲🇽", "🇧🇷", "🇦🇷", "🇿🇦", "🇪🇬", "🇲🇦",
            "🇦🇪", "🇸🇬", "🇲🇾", "🇵🇭", "🇬🇷", "🇹🇷", "🇨🇭", "🇦🇹"
        ]),
        Section(title: "Events", emojis: [
            "🎉", "🎊", "🎂", "🎁", "🎈", "🎄", "🎃", "🎆",
            "🎇", "✨", "🎵", "🎶", "🎤", "🎸", "🥁", "🎺",
            "💒", "💍", "👰", "🤵", "🎓", "📸", "🎬", "🎪"
        ]),
        Section(title: "Food & Drink", emojis: [
            "🍕", "🍔", "🍟", "🌮", "🍣", "🍜", "🍝", "🍛",
            "🍱", "🍖", "🍗", "🥩", "🍤", "🦞", "🦐", "🦑",
            "🍷", "🍸", "🍹", "🍺", "🥂", "☕", "🍵", "🧋"
        ]),
        Section(title: "Nature", emojis: [
            "🌸", "🌺", "🌻", "🌼", "🌷", "🌹", "🌴", "🌵",
            "🌲", "🌳", "🍀", "🍁", "🍂", "🌊", "🌅", "🌄",
            "🌈", "☀️", "🌙", "⭐", "❄️", "🌨️", "⛄", "🔥"
        ])
    ]
}

#Preview {
    TripEmojiPickerView(selectedEmoji: .constant("✈️"))
}
