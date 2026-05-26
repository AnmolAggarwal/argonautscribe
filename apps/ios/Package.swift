// swift-tools-version: 6.0
// This Package.swift is used for SPM dependency resolution only.
// The actual build is done via the Xcode project.
import PackageDescription

let package = Package(
    name: "ArgonautScribe",
    platforms: [.iOS(.v17)],
    dependencies: [
        .package(url: "https://github.com/firebase/firebase-ios-sdk.git", from: "11.0.0"),
    ],
    targets: [
        .executableTarget(
            name: "ArgonautScribe",
            dependencies: [
                .product(name: "FirebaseAuth", package: "firebase-ios-sdk"),
                .product(name: "FirebaseFirestore", package: "firebase-ios-sdk"),
                .product(name: "FirebaseStorage", package: "firebase-ios-sdk"),
                .product(name: "FirebaseFunctions", package: "firebase-ios-sdk"),
                .product(name: "FirebaseMessaging", package: "firebase-ios-sdk"),
            ],
            path: "ArgonautScribe"
        ),
    ]
)
