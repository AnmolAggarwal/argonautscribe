import SwiftUI

/// Brand colors from argonautdental.com
enum Theme {
    static let gold = Color(hex: 0xD4A017)
    static let plum = Color(hex: 0x5B2245)
    static let plumLight = Color(hex: 0x5B2245).opacity(0.08)
    static let textPrimary = Color(hex: 0x1A1A1A)
    static let textSecondary = Color(hex: 0x666666)
}

extension Color {
    init(hex: UInt, alpha: Double = 1.0) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}
