//
//  TripsListView.swift
//  BudgetThing
//

import SwiftUI
import SwiftData

struct TripsListView: View {
    @Binding var tabSelection: Int
    @Environment(\.modelContext) private var modelContext
    @Environment(\._currencyCode) private var currencyCode

    @Query(sort: \Trip.updatedAt, order: .reverse)
    private var trips: [Trip]

    @State private var showingAddTrip: Bool = false
    @State private var selectedTrip: Trip? = nil
    @State private var showFloatingPager: Bool = true
    @State private var tripToDelete: Trip? = nil

    private var activeTrips: [Trip] {
        trips.filter { trip in
            let notArchived = !trip.isArchived
            let notDeleted = !(trip.isDeleted ?? false)
            return notArchived && notDeleted
        }
    }

    private var archivedTrips: [Trip] {
        trips.filter { trip in
            let isArchived = trip.isArchived
            let notDeleted = !(trip.isDeleted ?? false)
            return isArchived && notDeleted
        }
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 0) {
                // Header
                HStack {
                    Text("Trips")
                        .font(Font.custom("AvenirNextCondensed-Heavy", size: 36))
                        .foregroundStyle(.white)
                    Spacer()
                    Button(action: { showingAddTrip = true }) {
                        Image(systemName: "plus")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(.orange)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 24)
                .padding(.bottom, 16)

                if trips.isEmpty {
                    emptyStateView
                } else {
                    ScrollView {
                        VStack(spacing: 16) {
                            // Active Trips
                            if !activeTrips.isEmpty {
                                VStack(alignment: .leading, spacing: 12) {
                                    ForEach(activeTrips) { trip in
                                        TripCard(trip: trip, currencyCode: currencyCode)
                                            .onTapGesture {
                                                Haptics.selection()
                                                selectedTrip = trip
                                            }
                                            .contextMenu {
                                                Button(role: .destructive, action: { tripToDelete = trip }) {
                                                    Label("Delete Trip", systemImage: "trash")
                                                }
                                            }
                                    }
                                }
                            }

                            // Archived Trips Section
                            if !archivedTrips.isEmpty {
                                VStack(alignment: .leading, spacing: 12) {
                                    Text("Archived")
                                        .font(Font.custom("AvenirNextCondensed-DemiBold", size: 16))
                                        .foregroundStyle(.white.opacity(0.5))
                                        .padding(.top, 8)

                                    ForEach(archivedTrips) { trip in
                                        TripCard(trip: trip, currencyCode: currencyCode)
                                            .opacity(0.6)
                                            .onTapGesture {
                                                Haptics.selection()
                                                selectedTrip = trip
                                            }
                                            .contextMenu {
                                                Button(role: .destructive, action: { tripToDelete = trip }) {
                                                    Label("Delete Trip", systemImage: "trash")
                                                }
                                            }
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, 24)
                        .padding(.bottom, 100)
                    }
                    .scrollIndicators(.hidden)
                }
            }

            // Floating Page Switcher
            if showFloatingPager {
                VStack {
                    Spacer()
                    FloatingPageSwitcher(selection: $tabSelection)
                        .padding(.bottom, 18)
                }
            }
        }
        .fullScreenCover(isPresented: $showingAddTrip) {
            NavigationStack {
                AddTripView()
            }
        }
        .fullScreenCover(item: $selectedTrip) { trip in
            NavigationStack {
                TripDetailView(trip: trip)
            }
        }
        .onChange(of: showingAddTrip) { _, isShowing in
            showFloatingPager = !isShowing
        }
        .onChange(of: selectedTrip) { _, trip in
            showFloatingPager = trip == nil
        }
        .confirmationDialog(
            "Delete Trip?",
            isPresented: Binding(
                get: { tripToDelete != nil },
                set: { if !$0 { tripToDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                if let trip = tripToDelete {
                    // Hard delete the trip
                    modelContext.delete(trip)
                    try? modelContext.save()
                    Haptics.success()
                }
                tripToDelete = nil
            }
            Button("Cancel", role: .cancel) { tripToDelete = nil }
        } message: {
            Text("This will permanently delete the trip and all its expenses.")
        }
    }

    private var emptyStateView: some View {
        VStack(spacing: 20) {
            Spacer()

            Text("✈️")
                .font(.system(size: 64))

            Text("No trips yet")
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 24))
                .foregroundStyle(.white)

            Text("Create a trip to track expenses\nfor your travels")
                .font(Font.custom("AvenirNextCondensed-Medium", size: 16))
                .foregroundStyle(.white.opacity(0.6))
                .multilineTextAlignment(.center)

            Button(action: { showingAddTrip = true }) {
                HStack(spacing: 8) {
                    Image(systemName: "plus")
                    Text("New Trip")
                }
                .font(Font.custom("AvenirNextCondensed-DemiBold", size: 18))
                .foregroundStyle(.white)
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(.orange, in: Capsule())
            }
            .padding(.top, 8)

            Spacer()
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }
}

#Preview {
    TripsListView(tabSelection: .constant(4))
        .modelContainer(for: [Trip.self], inMemory: true)
}
