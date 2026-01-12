import SwiftUI

struct EmojiPickerView: View {
    @Binding var selection: String

    @State private var activeGroupId: String = EmojiCatalog.groups.first?.id ?? ""
    @State private var searchText: String = ""

    private let columns: [GridItem] = [GridItem(.adaptive(minimum: 40), spacing: 10)]

    var body: some View {
        VStack(spacing: 12) {
            // Group chips (horizontal)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(EmojiCatalog.groups) { group in
                        Button(action: { withAnimation(.easeInOut(duration: 0.15)) { activeGroupId = group.id } }) {
                            Text(group.name)
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(activeGroupId == group.id ? .orange : .white.opacity(0.7))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(Color.white.opacity(activeGroupId == group.id ? 0.14 : 0.08), in: Capsule())
                                .overlay(Capsule().stroke(Color.white.opacity(0.12), lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 4)
            }

            // Optional search
            TextField("Search emoji or label", text: $searchText)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .padding(.horizontal, 12)
                .frame(height: 36)
                .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(.white.opacity(0.12), lineWidth: 1))
                .foregroundStyle(.white)

            // Grid for active group
            ScrollView(.vertical, showsIndicators: true) {
                LazyVGrid(columns: columns, spacing: 10) {
                    ForEach(filteredItems(), id: \.self) { item in
                        Button(action: { selection = item.emoji; Haptics.selection() }) {
                            Text(item.emoji)
                                .font(.system(size: 20))
                                .frame(width: 40, height: 34)
                                .background(
                                    RoundedRectangle(cornerRadius: 9)
                                        .fill(selection == item.emoji ? Color.white.opacity(0.18) : Color.white.opacity(0.08))
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 9)
                                        .stroke(Color.white.opacity(0.12), lineWidth: 1)
                                )
                                .accessibilityLabel(item.label)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, 2)
            }
            .frame(maxHeight: 160)
        }
    }

    private func filteredItems() -> [EmojiItem] {
        let base = EmojiCatalog.groups.first(where: { $0.id == activeGroupId })?.items ?? []
        let q = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return base }
        return base.filter { $0.label.lowercased().contains(q) || $0.emoji.contains(q) }
    }
}


