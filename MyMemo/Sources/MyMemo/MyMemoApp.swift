import SwiftUI

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationDidResignActive(_ notification: Notification) {
        Task { @MainActor in
            EditorController.shared.flush { NoteStore.shared.flush() }
        }
    }

    // 종료 전에 편집기에 남은 변경분을 받아서 저장한 뒤 종료한다.
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        Task { @MainActor in
            EditorController.shared.flush {
                DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(100)) {
                    NoteStore.shared.flush()
                    NSApp.reply(toApplicationShouldTerminate: true)
                }
            }
        }
        return .terminateLater
    }
}

@main
struct MyMemoApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    var body: some Scene {
        WindowGroup("MyMemo") {
            ContentView().environmentObject(NoteStore.shared)
        }
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("새 메모") { NoteStore.shared.add() }.keyboardShortcut("n")
            }
        }
    }
}
