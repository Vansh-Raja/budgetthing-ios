import AppIntents

// TODO: Implement full Siri "Record Expense" intent.
// - Add parameters: category (AppEntity), optional note (String), optional account (AppEntity)
// - Validate: positive amount, category exists and is not system/income, account valid
// - Use shared SwiftData (App Group) ModelContainer to insert Transaction
// - Return success/error dialogs with clear messaging

struct RecordExpenseIntent: AppIntent {
    static var title: LocalizedStringResource = "Record Expense"

    @Parameter(title: "Amount", requestValueDialog: "What amount?")
    var amount: Double

    static var parameterSummary: some ParameterSummary {
        Summary("Record expense of \(\.$amount)")
    }

    func perform() async throws -> some IntentResult {
        .result(dialog: "Siri shortcut will be available in a future update.")
    }
}


