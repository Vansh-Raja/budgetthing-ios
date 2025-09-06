//
//  SettingsView.swift
//  BudgetThing
//

import SwiftUI

struct SettingsView: View {
    @Binding var tabSelection: Int
    @State private var isHapticsOn: Bool = true
    @State private var currency: String = "USD"
    @Environment(\._currencyCode) private var envCurrency
    @AppStorage("currencyCode") private var storedCurrency: String = "USD"
    @State private var showCurrencyPicker: Bool = false
    @State private var path = NavigationPath()

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

                        Divider().background(Color.white.opacity(0.1))

                        HStack(spacing: 12) {
                            Text("Currency")
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 22))
                                .foregroundStyle(.white)
                            Spacer()
                            Button(action: { showCurrencyPicker = true }) {
                                Text(currency)
                                    .font(Font.custom("AvenirNextCondensed-DemiBold", size: 22))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .background(.white.opacity(0.08), in: Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    Divider().background(Color.white.opacity(0.1))

                    // Manage categories link - custom, borderless
                    NavigationLink {
                        CategoriesManageView()
                    } label: {
                        HStack {
                            Text("Manage Categories")
                                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 22))
                                .foregroundStyle(.white)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .foregroundStyle(.white.opacity(0.25))
                        }
                        .padding(.vertical, 14)
                        .background(Color.clear)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .buttonStyle(.plain) // avoid iOS device default tile background
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
            if path.isEmpty {
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
    }
}

#Preview {
    SettingsView(tabSelection: .constant(2))
}


