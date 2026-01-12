import SwiftUI

struct OnboardingView: View {
    let onDone: () -> Void

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            TabView {
                page(title: "Quick Entry",
                     desc: "Type amounts like a calculator and save instantly.",
                     icon: "plus.circle")
                page(title: "Track & Filter",
                     desc: "See transactions grouped by month. Filter with chips.",
                     icon: "list.bullet.below.rectangle")
                page(title: "Categories & Settings",
                     desc: "Tag with emojis, change currency, and haptics.",
                     icon: "gearshape")
            }
            .tabViewStyle(.page)
            .indexViewStyle(.page(backgroundDisplayMode: .interactive))

            VStack {
                Spacer()
                Button(action: {
                    Haptics.selection()
                    onDone()
                }) {
                    Text("Get Started")
                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 20))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .background(.white.opacity(0.12), in: Capsule())
                }
                .buttonStyle(.plain)
                .padding(.bottom, 32)
            }
        }
        .preferredColorScheme(.dark)
    }

    private func page(title: String, desc: String, icon: String) -> some View {
        VStack(spacing: 18) {
            Image(systemName: icon)
                .font(.system(size: 64, weight: .bold))
                .foregroundStyle(.white)
                .padding(.bottom, 6)
            Text(title)
                .font(Font.custom("AvenirNextCondensed-Heavy", size: 32))
                .foregroundStyle(.white)
            Text(desc)
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.7))
                .padding(.horizontal, 24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}


