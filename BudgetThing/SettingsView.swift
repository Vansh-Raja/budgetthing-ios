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

    var body: some View {
        NavigationStack(path: $path) {
            ZStack {
                Color(.black).ignoresSafeArea()
                VStack(alignment: .leading, spacing: 20) {
                    Text("Settings")
                        .font(Font.custom("AvenirNextCondensed-Heavy", size: 36))
                        .foregroundStyle(.white)

                    Group {
                        HStack {
                            Text("Haptics")
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 20))
                                .foregroundStyle(.white)
                            Spacer()
                            Toggle("", isOn: $isHapticsOn)
                                .labelsHidden()
                        }
                        .padding(.vertical, 6)

                        Divider().background(Color.white.opacity(0.1))

                        HStack(spacing: 12) {
                            Text("Currency")
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 20))
                                .foregroundStyle(.white)
                            Spacer()
                            Button(action: { Haptics.selection(); showCurrencyPicker = true }) {
                                Text(currency)
                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 20))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .background(.white.opacity(0.08), in: Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.vertical, 6)
                    }

                    Divider().background(Color.white.opacity(0.1))

                    // Manage accounts
                    Button(action: { Haptics.selection(); showingAccounts = true }) {
                        HStack(spacing: 8) {
                            Text("Manage Accounts")
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 20))
                                .foregroundStyle(.white)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.25))
                        }
                        .padding(.vertical, 6)
                        .background(Color.clear)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .background(Color.clear)

                    Divider().background(Color.white.opacity(0.1))

                    // Manage categories link - custom, borderless (full screen)
                    Button(action: { Haptics.selection(); showingCategories = true }) {
                        HStack(spacing: 8) {
                            Text("Manage Categories")
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 20))
                                .foregroundStyle(.white)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.25))
                        }
                        .padding(.vertical, 6)
                        .background(Color.clear)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .background(Color.clear)

                    Divider().background(Color.white.opacity(0.1))

                    // Legal & Support links
                    Group {
                        Button(action: {
                            Haptics.selection()
                            if let url = URL(string: "https://budgetthing.vanshraja.me/support") { UIApplication.shared.open(url) }
                        }) {
                            HStack(spacing: 8) {
                                Text("Support")
                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 20))
                                    .foregroundStyle(.white)
                                Spacer()
                                Image(systemName: "arrow.up.right.square")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.25))
                            }
                            .padding(.vertical, 6)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)

                        Divider().background(Color.white.opacity(0.1))

                        Button(action: {
                            Haptics.selection()
                            if let url = URL(string: "https://budgetthing.vanshraja.me/privacy") { UIApplication.shared.open(url) }
                        }) {
                            HStack(spacing: 8) {
                                Text("Privacy Policy")
                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 20))
                                    .foregroundStyle(.white)
                                Spacer()
                                Image(systemName: "arrow.up.right.square")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.25))
                            }
                            .padding(.vertical, 6)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }

                    Divider().background(Color.white.opacity(0.1))

                    // View Tutorial (Onboarding)
                    Button(action: { Haptics.selection(); showOnboarding = true }) {
                        HStack(spacing: 8) {
                            Text("View Tutorial")
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 20))
                                .foregroundStyle(.white)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.25))
                        }
                        .padding(.vertical, 6)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)

                    Divider().background(Color.white.opacity(0.1))

                    VStack(alignment: .leading, spacing: 6) {
                        Text("About")
                            .foregroundStyle(.white.opacity(0.7))
                            .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                        Text("BudgetThing helps you log expenses quickly with a simple, clean UI.")
                            .foregroundStyle(.white.opacity(0.7))
                    }

                    Spacer()
                }
                .padding(24)
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


