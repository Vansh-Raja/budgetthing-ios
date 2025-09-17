//
//  SettingsView.swift
//  BudgetThing
//

import SwiftUI

struct SettingsView: View {
    @Binding var tabSelection: Int
    @AppStorage("hapticsOn") private var isHapticsOn: Bool = true
    @AppStorage("hasSeenOnboarding") private var hasSeenOnboarding: Bool = true
    @State private var currency: String = "USD"
    @Environment(\._currencyCode) private var envCurrency
    @AppStorage("currencyCode") private var storedCurrency: String = "USD"
    @State private var showCurrencyPicker: Bool = false
    @State private var path = NavigationPath()
    @State private var showingCategories: Bool = false
    @State private var showingAccounts: Bool = false
    @State private var showOnboarding: Bool = false
    private let pillHeight: CGFloat = 36
    private let pillHPad: CGFloat = 12

    var body: some View {
        NavigationStack(path: $path) {
            ZStack {
                Color(.black).ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        // Title
                        Text("Settings")
                            .font(Font.custom("AvenirNextCondensed-Heavy", size: 36))
                            .foregroundStyle(.white)
                            .padding(.bottom, 2)

                        // Basics
                        Text("Basics")
                            .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
                            .foregroundStyle(.white.opacity(0.6))
                        HStack {
                            Text("Haptics")
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                                .foregroundStyle(.white)
                            Spacer()
                            Toggle("", isOn: $isHapticsOn)
                                .labelsHidden()
                        }
                        .frame(minHeight: 44)

                        HStack(spacing: 12) {
                            Text("Currency")
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                                .foregroundStyle(.white)
                            Spacer()
                            Button(action: { Haptics.selection(); showCurrencyPicker = true }) {
                                Text(currency)
                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, pillHPad)
                                    .frame(height: pillHeight)
                                    .background(.white.opacity(0.12), in: Capsule())
                                    .overlay(Capsule().stroke(.white.opacity(0.15), lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                        }
                        .frame(minHeight: 44)

                        // Manage
                        Text("Manage")
                            .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
                            .foregroundStyle(.white.opacity(0.6))
                            .padding(.top, 8)
                        Button(action: { Haptics.selection(); showingAccounts = true }) {
                            HStack(spacing: 8) {
                                Text("Manage Accounts")
                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                                    .foregroundStyle(.white)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.25))
                            }
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)

                        Button(action: { Haptics.selection(); showingCategories = true }) {
                            HStack(spacing: 8) {
                                Text("Manage Categories")
                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                                    .foregroundStyle(.white)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.25))
                            }
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)

                        // Help
                        Text("Help")
                            .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
                            .foregroundStyle(.white.opacity(0.6))
                            .padding(.top, 8)
                        Button(action: {
                            Haptics.selection()
                            if let url = URL(string: "https://budgetthing.vanshraja.me/support") { UIApplication.shared.open(url) }
                        }) {
                            HStack(spacing: 8) {
                                Text("Support")
                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                                    .foregroundStyle(.white)
                                Spacer()
                                Image(systemName: "arrow.up.right.square")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.25))
                            }
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)

                        Button(action: {
                            Haptics.selection()
                            if let url = URL(string: "https://budgetthing.vanshraja.me/privacy") { UIApplication.shared.open(url) }
                        }) {
                            HStack(spacing: 8) {
                                Text("Privacy Policy")
                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                                    .foregroundStyle(.white)
                                Spacer()
                                Image(systemName: "arrow.up.right.square")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.25))
                            }
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)

                        Button(action: { Haptics.selection(); showOnboarding = true }) {
                            HStack(spacing: 8) {
                                Text("View Tutorial")
                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                                    .foregroundStyle(.white)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.25))
                            }
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)

                        // Footer / About
                        VStack(alignment: .leading, spacing: 6) {
                            Text("About")
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 14))
                                .foregroundStyle(.white.opacity(0.6))
                                .padding(.top, 10)
                            Text("BudgetThing helps you log expenses quickly with a simple, clean UI.")
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                                .foregroundStyle(.white.opacity(0.6))
                            Text(versionString())
                                .font(.system(size: 12))
                                .foregroundStyle(.white.opacity(0.45))
                        }

                        Spacer(minLength: 24)
                    }
                    .padding(24)
                }
            }
            .preferredColorScheme(.dark)
        }
        .overlay(alignment: .bottom) {
            if path.isEmpty && !showingCategories && !showingAccounts {
                FloatingPageSwitcher(selection: $tabSelection)
                    .padding(.bottom, 18)
            }
        }
        // Skip home indicator hiding for compatibility
        .sheet(isPresented: $showCurrencyPicker, onDismiss: {
            storedCurrency = currency
        }) {
            CurrencyPickerView(selectedCode: $currency)
        }
        .onAppear { currency = storedCurrency }
        .fullScreenCover(isPresented: $showingCategories) {
            NavigationStack { CategoriesManageView() }
                .interactiveDismissDisabled(false)
        }
        .fullScreenCover(isPresented: $showingAccounts) {
            NavigationStack { AccountsManageView() }
                .interactiveDismissDisabled(false)
        }
        .fullScreenCover(isPresented: $showOnboarding) {
            OnboardingView {
                hasSeenOnboarding = true
                showOnboarding = false
            }
        }
    }
}

#Preview {
    SettingsView(tabSelection: .constant(2))
}

private func versionString() -> String {
    let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
    let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? ""
    return [v, b.isEmpty ? nil : "(", b, b.isEmpty ? nil : ")"].compactMap { $0 }.joined()
}
