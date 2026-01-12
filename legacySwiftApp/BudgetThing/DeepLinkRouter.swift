//
//  DeepLinkRouter.swift
//  BudgetThing
//

import Foundation
import SwiftUI

final class DeepLinkRouter: ObservableObject {
    // Triggers to notify listeners without relying on reference equality
    @Published var calculatorCategoryId: UUID? = nil
    @Published var calculatorTrigger: Int = 0

    @Published var openTransactionId: UUID? = nil
    @Published var transactionTrigger: Int = 0

    func openCalculator(categoryId: UUID?) {
        calculatorCategoryId = categoryId
        calculatorTrigger &+= 1
    }

    func openTransaction(id: UUID) {
        openTransactionId = id
        transactionTrigger &+= 1
    }
}

enum DeepLinkRoute {
    case calculator(categoryId: UUID?)
    case transaction(id: UUID)
}

enum DeepLinkParser {
    static func parse(url: URL) -> DeepLinkRoute? {
        // Expecting scheme: budgetthing://calculator?categoryId=UUID
        // or budgetthing://transaction/UUID
        guard let scheme = url.scheme?.lowercased(), scheme == "budgetthing" else { return nil }
        let path = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let host = url.host?.lowercased()

        // Two styles supported: budgetthing://calculator and budgetthing:///calculator
        if host == "calculator" || path == "calculator" {
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
            let catId = components?.queryItems?.first(where: { $0.name == "categoryId" })?.value
            let uuid = catId.flatMap { UUID(uuidString: $0) }
            return .calculator(categoryId: uuid)
        }

        if host == "transaction" || path.hasPrefix("transaction") {
            let idString: String? = {
                if host == "transaction" {
                    let comps = path.split(separator: "/")
                    return comps.dropFirst().first.map(String.init)
                } else {
                    let comps = path.split(separator: "/")
                    return comps.dropFirst().first.map(String.init)
                }
            }()
            if let idString, let uuid = UUID(uuidString: idString) {
                return .transaction(id: uuid)
            }
        }

        return nil
    }
}


