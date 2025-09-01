//
//  SettingsView.swift
//  BudgetThing
//

import SwiftUI

struct SettingsView: View {
    @State private var isHapticsOn: Bool = true
    @State private var currency: String = "USD"

    var body: some View {
        NavigationStack {
            ZStack {
                Color(.black).ignoresSafeArea()
                VStack(alignment: .leading, spacing: 24) {
                    Text("Settings")
                        .font(Font.custom("AvenirNextCondensed-Heavy", size: 36))
                        .foregroundStyle(.white)

                    Group {
                        HStack {
                            Text("Haptics")
                                .foregroundStyle(.white)
                            Spacer()
                            Toggle("", isOn: $isHapticsOn)
                                .labelsHidden()
                        }

                        Divider().background(Color.white.opacity(0.1))

                        HStack(spacing: 12) {
                            Text("Currency")
                                .foregroundStyle(.white)
                            Spacer()
                            Text(currency)
                                .foregroundStyle(.white.opacity(0.7))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(.white.opacity(0.08), in: Capsule())
                        }
                    }

                    Divider().background(Color.white.opacity(0.1))

                    // Manage categories link
                    NavigationLink {
                        CategoriesManageView()
                    } label: {
                        HStack {
                            Text("Manage Categories")
                                .foregroundStyle(.white)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .foregroundStyle(.white.opacity(0.25))
                        }
                        .padding(.vertical, 8)
                    }

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
    }
}

#Preview {
    SettingsView()
}


