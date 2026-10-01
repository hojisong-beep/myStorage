import SwiftUI

enum Palette {
    static let colors = ["#FFF7B0", "#FFD6E0", "#FFE0B8", "#D5F5C8", "#CFF5EA", "#D0E8FF", "#E4D8FF", "#EDEDEF"]
}

extension Color {
    init(hex: String) {
        var v: UInt64 = 0
        Scanner(string: hex.replacingOccurrences(of: "#", with: "")).scanHexInt64(&v)
        self.init(red: Double((v >> 16) & 255) / 255, green: Double((v >> 8) & 255) / 255, blue: Double(v & 255) / 255)
    }
}

struct Note: Identifiable, Codable, Equatable {
    var id = UUID()
    var title = ""
    var html = ""
    var preview = ""
    var color = Palette.colors[0]
    var pinned = false
    var created = Date()
    var updated = Date()
}

/// 메모를 ~/Library/Application Support/MyMemo/notes/<id>.json 에 파일 하나씩 저장한다.
@MainActor
final class NoteStore: ObservableObject {
    static let shared = NoteStore()

    @Published private(set) var notes: [Note] = []
    @Published var selection: UUID?
    /// 외부(MCP 등)에서 현재 편집 중인 메모가 바뀌었을 때 편집기를 다시 불러오게 하는 신호
    @Published private(set) var reloadTick = 0
    private(set) var reloadID: UUID?
    private var fileDates: [UUID: Date] = [:]

    private let dir: URL
    private var dirty = Set<UUID>()
    private var saveTask: Task<Void, Never>?

    private init() {
        dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("MyMemo/notes", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        load()
        if notes.isEmpty { add() }
        selection = sorted.first?.id
        Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                self?.syncExternal()
            }
        }
    }

    var sorted: [Note] {
        notes.sorted { ($0.pinned ? 1 : 0, $0.updated) > ($1.pinned ? 1 : 0, $1.updated) }
    }

    func note(_ id: UUID) -> Note? { notes.first { $0.id == id } }

    func add() {
        let n = Note()
        notes.append(n)
        selection = n.id
        markDirty(n.id)
    }

    func delete(_ id: UUID) {
        let next = sorted.first { $0.id != id }?.id
        notes.removeAll { $0.id == id }
        dirty.remove(id)
        fileDates[id] = nil
        try? FileManager.default.removeItem(at: file(id))
        if notes.isEmpty { add() } else if selection == id { selection = next }
    }

    func update(_ id: UUID, touch: Bool = true, _ change: (inout Note) -> Void) {
        guard let i = notes.firstIndex(where: { $0.id == id }) else { return }
        var n = notes[i]
        change(&n)
        guard n != notes[i] else { return }
        if touch { n.updated = Date() }
        notes[i] = n
        markDirty(id)
    }

    func flush() {
        saveTask?.cancel()
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        for id in dirty {
            guard let n = note(id), let data = try? enc.encode(n) else { continue }
            try? data.write(to: file(id), options: .atomic)
            fileDates[id] = modDate(file(id))
        }
        dirty.removeAll()
    }

    private func markDirty(_ id: UUID) {
        dirty.insert(id)
        saveTask?.cancel()
        saveTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 500_000_000)
            if !Task.isCancelled { self?.flush() }
        }
    }

    private func file(_ id: UUID) -> URL { dir.appendingPathComponent("\(id.uuidString).json") }

    private func modDate(_ url: URL) -> Date? {
        (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
    }

    /// 폴더를 훑어 앱 밖에서 생긴 추가/수정/삭제를 반영한다. 앱에 저장 안 된 변경이 있는 메모는 건드리지 않는다.
    private func syncExternal() {
        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        let urls = ((try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? [])
            .filter { $0.pathExtension == "json" }
        var seen = Set<UUID>()
        for url in urls {
            guard let id = UUID(uuidString: url.deletingPathExtension().lastPathComponent) else { continue }
            seen.insert(id)
            guard !dirty.contains(id), let d = modDate(url), fileDates[id] != d else { continue }
            fileDates[id] = d
            guard let n = try? dec.decode(Note.self, from: Data(contentsOf: url)) else { continue }
            if let i = notes.firstIndex(where: { $0.id == id }) {
                guard notes[i] != n else { continue }
                let htmlChanged = notes[i].html != n.html
                notes[i] = n
                if htmlChanged && selection == id { reloadID = id; reloadTick += 1 }
            } else {
                notes.append(n)
            }
        }
        for n in notes where !seen.contains(n.id) && !dirty.contains(n.id) {
            delete(n.id)
        }
    }

    private func load() {
        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        notes = files.filter { $0.pathExtension == "json" }
            .compactMap { url -> Note? in
                guard let n = try? dec.decode(Note.self, from: Data(contentsOf: url)) else { return nil }
                fileDates[n.id] = modDate(url)
                return n
            }
    }
}
