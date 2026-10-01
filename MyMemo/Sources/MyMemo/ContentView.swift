import SwiftUI

struct ContentView: View {
    @EnvironmentObject var store: NoteStore
    @State private var query = ""
    @State private var toDelete: Note?
    @AppStorage("alwaysOnTop") private var alwaysOnTop = false

    private var filtered: [Note] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return q.isEmpty ? store.sorted : store.sorted.filter { ($0.title + " " + $0.preview).lowercased().contains(q) }
    }

    var body: some View {
        NavigationSplitView {
            List(selection: $store.selection) {
                ForEach(filtered) { n in
                    NoteRow(note: n)
                        .tag(n.id)
                        .contextMenu {
                            Button(n.pinned ? "고정 해제" : "맨 위에 고정") { store.update(n.id, touch: false) { $0.pinned.toggle() } }
                            Button("삭제", role: .destructive) { toDelete = n }
                        }
                }
            }
            .searchable(text: $query, placement: .sidebar, prompt: "검색")
            .navigationSplitViewColumnWidth(min: 200, ideal: 250, max: 360)
            .toolbar {
                ToolbarItem { Button { store.add() } label: { Image(systemName: "square.and.pencil") }.help("새 메모 (⌘N)") }
            }
        } detail: {
            if let id = store.selection, store.note(id) != nil {
                DetailView(id: id, toDelete: $toDelete, alwaysOnTop: $alwaysOnTop)
            } else {
                Text("메모를 선택하세요").foregroundStyle(.secondary)
            }
        }
        .frame(minWidth: 620, minHeight: 420)
        .onAppear(perform: applyLevel)
        .onChange(of: alwaysOnTop) { _, _ in applyLevel() }
        .alert("이 메모를 삭제할까요?", isPresented: Binding(get: { toDelete != nil }, set: { if !$0 { toDelete = nil } }), presenting: toDelete) { n in
            Button("삭제", role: .destructive) { store.delete(n.id) }
            Button("취소", role: .cancel) {}
        } message: { n in
            Text("“\(n.title.isEmpty ? "제목 없음" : n.title)” 메모는 복구할 수 없습니다.")
        }
    }

    private func applyLevel() {
        NSApp.windows.forEach { $0.level = alwaysOnTop ? .floating : .normal }
    }
}

struct NoteRow: View {
    let note: Note
    var body: some View {
        HStack(spacing: 9) {
            Circle().fill(Color(hex: note.color)).frame(width: 14, height: 14)
                .overlay(Circle().stroke(.black.opacity(0.18), lineWidth: 0.5))
            VStack(alignment: .leading, spacing: 2) {
                Text(note.title.isEmpty ? "제목 없음" : note.title).font(.headline).lineLimit(1)
                HStack(spacing: 6) {
                    Text(note.updated, format: .dateTime.month().day().hour().minute())
                    Text(note.preview).lineLimit(1)
                }
                .font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            if note.pinned { Image(systemName: "pin.fill").font(.caption).foregroundStyle(.secondary) }
        }
        .padding(.vertical, 2)
    }
}

struct DetailView: View {
    let id: UUID
    @Binding var toDelete: Note?
    @Binding var alwaysOnTop: Bool
    @EnvironmentObject var store: NoteStore
    private let editor = EditorController.shared

    var body: some View {
        if let note = store.note(id) {
            VStack(spacing: 0) {
                TextField("제목", text: Binding(get: { note.title }, set: { t in store.update(id) { $0.title = t } }))
                    .textFieldStyle(.plain)
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(Color(white: 0.15))
                    .padding(.horizontal, 22).padding(.top, 14).padding(.bottom, 6)
                toolbar(note)
                EditorWebView()
            }
            .background(Color(hex: note.color))
            .environment(\.colorScheme, .light)
            .onAppear { editor.load(note) }
            .onChange(of: id) { _, _ in if let n = store.note(id) { editor.load(n) } }
            .onChange(of: store.reloadTick) { _, _ in
                if store.reloadID == id, let n = store.note(id) { editor.load(n) }
            }
        }
    }

    private func toolbar(_ note: Note) -> some View {
        HStack(spacing: 4) {
            tool("bold", "굵게 (⌘B)") { editor.cmd("bold") }
            tool("italic", "기울임 (⌘I)") { editor.cmd("italic") }
            tool("underline", "밑줄 (⌘U)") { editor.cmd("underline") }
            tool("strikethrough", "취소선") { editor.cmd("strikeThrough") }
            tool("textformat.size", "큰 제목") { editor.heading() }
            tool("list.bullet", "글머리 기호") { editor.cmd("insertUnorderedList") }
            tool("checklist", "체크리스트") { editor.checklist() }
            divider
            tool("photo", "그림 넣기 (붙여넣기·드래그도 가능)") { editor.pickImage() }
            tool("tablecells", "표 넣기 (3×3)") { editor.table("insert(3,3)") }
            Menu {
                Button("행 추가") { editor.table("addRow()") }
                Button("열 추가") { editor.table("addCol()") }
                Divider()
                Button("행 삭제") { editor.table("delRow()") }
                Button("열 삭제") { editor.table("delCol()") }
                Button("표 삭제") { editor.table("del()") }
            } label: { Image(systemName: "ellipsis.circle") }
                .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize().help("표 편집 (표 안에 커서를 두고 사용)")
            divider
            ForEach(Palette.colors, id: \.self) { hex in
                Circle().fill(Color(hex: hex)).frame(width: 16, height: 16)
                    .overlay(Circle().stroke(.black.opacity(note.color == hex ? 0.7 : 0.2), lineWidth: note.color == hex ? 2 : 0.5))
                    .onTapGesture {
                        store.update(id, touch: false) { $0.color = hex }
                        editor.setColor(hex)
                    }
            }
            Spacer(minLength: 8)
            tool(note.pinned ? "pin.fill" : "pin", "맨 위에 고정") { store.update(id, touch: false) { $0.pinned.toggle() } }
            tool(alwaysOnTop ? "macwindow.badge.plus" : "macwindow", "항상 위에 표시") { alwaysOnTop.toggle() }
            tool("trash", "삭제") { toDelete = note }
        }
        .padding(.horizontal, 18).padding(.vertical, 6)
        .foregroundStyle(Color(white: 0.2))
        .background(.black.opacity(0.05))
    }

    private var divider: some View { Divider().frame(height: 16).padding(.horizontal, 4) }

    private func tool(_ icon: String, _ help: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) { Image(systemName: icon).frame(width: 24, height: 22) }
            .buttonStyle(.plain).help(help)
    }
}
