import WidgetKit
import SwiftUI

@main
struct BudgetThingWidgets: WidgetBundle {
    var body: some Widget {
        QuickAddWidget()
        LatestTransactionsWidget()
        AccountsChartWidget()
    }
}
