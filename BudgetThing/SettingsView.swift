//
//  SettingsView.swift
//  BudgetThing
//

import SwiftUI

struct SettingsView: View {
    @Binding var tabSelection: Int
    @AppStorage("hapticsOn") private var isHapticsOn: Bool = true
    @State private var currency: String = "USD"
    @Environment(\._currencyCode) private var envCurrency
    @AppStorage("currencyCode") private var storedCurrency: String = "USD"
    @State private var showCurrencyPicker: Bool = false
    @State private var path = NavigationPath()
    @State private var showingCategories: Bool = false

    var body: some View {
        NavigationStack(path: $path) {
            ZStack {
                Color(.black).ignoresSafeArea()
                VStack(alignment: .leading, spacing: 24) {
                    Text("Settings")
                        .font(Font.custom("AvenirNextCondensed-Heavy", size: 36))
                        .foregroundStyle(.white)

                    Group {
                        HStack {
                            Text("Haptics")
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 22))
                                .foregroundStyle(.white)
                            Spacer()
                            Toggle("", isOn: $isHapticsOn)
                                .labelsHidden()
                        }
                        .padding(.vertical, 8)

                        Divider().background(Color.white.opacity(0.1))

                        HStack(spacing: 12) {
                            Text("Currency")
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 22))
                                .foregroundStyle(.white)
                            Spacer()
                            Button(action: { Haptics.selection(); showCurrencyPicker = true }) {
                                Text(currency)
                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 22))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .background(.white.opacity(0.08), in: Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.vertical, 8)
                    }

                    Divider().background(Color.white.opacity(0.1))

                    // Manage categories link - custom, borderless (full screen)
                    Button(action: { Haptics.selection(); showingCategories = true }) {
                        HStack {
                            Text("Manage Categories")
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 22))
                                .foregroundStyle(.white)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .foregroundStyle(.white.opacity(0.25))
                        }
                        .padding(.vertical, 8)
                        .background(Color.clear)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .background(Color.clear)

                    Divider().background(Color.white.opacity(0.1))

                    VStack(alignment: .leading, spacing: 8) {
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
            if path.isEmpty && !showingCategories {
                FloatingPageSwitcher(selection: $tabSelection)
                    .padding(.bottom, 18)
            }
        }
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
    }
}

#Preview {
    SettingsView(tabSelection: .constant(2))
}


