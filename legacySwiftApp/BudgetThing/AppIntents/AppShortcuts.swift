import AppIntents

struct BudgetThingShortcuts: AppShortcutsProvider {
    static var shortcutTileColor: ShortcutTileColor = .purple

    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: RecordExpenseIntent(),
            phrases: [
                "Record expense in \(.applicationName)",
                "Add expense in \(.applicationName)",
                "Log expense in \(.applicationName)"
            ],
            shortTitle: "Record Expense",
            systemImageName: "banknote"
        )
    }
}


