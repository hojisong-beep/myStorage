// swift-tools-version:6.0
import PackageDescription

let package = Package(
    name: "MyMemo",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(name: "MyMemo", path: "Sources/MyMemo"),
        .executableTarget(name: "MyMemoMCP", path: "Sources/MyMemoMCP")
    ],
    swiftLanguageModes: [.v5]
)
