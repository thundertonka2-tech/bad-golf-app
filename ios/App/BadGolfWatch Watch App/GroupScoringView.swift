// Bad Golf Watch — v1910 Phase 1: group scoring, hole stats, units, final card.
//
// Scoring page:
//   * a group  -> one row per player (me first). Tap a row to score that player.
//   * solo     -> my own hole, inline.
//   * a phone build without the group hand-off -> the original ScoringView.
// Who can be scored comes from the phone (GroupPlayer.canScore): anyone in a casual
// round, only the group's scorekeeper in an event. Read-only rows still open, so
// everyone can see the card.
//
// Units page: the live standings the phone computes. The watch never does game math.
// Wording is units, never currency.

import SwiftUI
#if os(watchOS)
import WatchKit
#endif

private func tick() {
    #if os(watchOS)
    WKInterfaceDevice.current().play(.click)
    #endif
}

// MARK: - Scoring page

struct GroupScoringView: View {
    @EnvironmentObject var store: RoundStore

    var body: some View {
        if store.round?.players == nil {
            ScoringView()                                   // no group in the hand-off yet: the original screen
        } else if !store.isGroup, let me = store.me {
            ScrollView {
                VStack(spacing: 6) {
                    HoleHeader()
                    PlayerHoleView(pid: me.id, embedded: true)
                    RoundActionsView()
                }
                .padding(.horizontal, 4)
            }
            .background(Color.badGolfNavy.ignoresSafeArea())
        } else {
            VStack(spacing: 0) {
                HoleHeader()
                List {
                    Section {
                        ForEach(store.orderedPlayers) { p in
                            // The hole rides in the link, so a hole change handed over
                            // from the phone can't move an edit that is in progress.
                            NavigationLink(value: "\(p.id)|\(store.currentHole)") { PlayerRow(player: p) }
                        }
                    } footer: {
                        if store.round?.isEvent == true && store.round?.scorer != true {
                            Text("Only your group's scorekeeper scores other players.")
                        }
                    }
                    Section { RoundActionsView() }
                }
            }
            .navigationDestination(for: String.self) { v in
                let cut = v.lastIndex(of: "|")
                let pid = cut.map { String(v[..<$0]) } ?? v
                let hole = cut.flatMap { Int(v[v.index(after: $0)...]) }
                PlayerHoleView(pid: pid, fixedHole: hole)
            }
        }
    }
}

/// ‹ Hole 7 · Par 4 ›
struct HoleHeader: View {
    @EnvironmentObject var store: RoundStore
    var body: some View {
        HStack(spacing: 0) {
            Button { store.prev(); tick() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .semibold))
                    .frame(width: 40, height: 36)
                    .contentShape(Rectangle())
            }
            Spacer(minLength: 0)
            VStack(spacing: 0) {
                Text("Hole \(store.currentHole)").font(.system(size: 15, weight: .semibold))
                if let p = store.parFor(hole: store.currentHole) {
                    Text("Par \(p)").font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.7))
                }
            }
            Spacer(minLength: 0)
            Button { store.next(); tick() } label: {
                Image(systemName: "chevron.right")
                    .font(.system(size: 18, weight: .semibold))
                    .frame(width: 40, height: 36)
                    .contentShape(Rectangle())
            }
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.badGolfBlue)
    }
}

struct PlayerRow: View {
    @EnvironmentObject var store: RoundStore
    let player: GroupPlayer
    var body: some View {
        let h = store.currentHole
        HStack(spacing: 6) {
            VStack(alignment: .leading, spacing: 1) {
                Text(player.name.isEmpty ? "Player" : player.name)
                    .font(.system(size: 15, weight: player.me ? .bold : .regular))
                    .lineLimit(1)
                Text(store.toPar(player))
                    .font(.system(size: 11))
                    .foregroundStyle(Color.badGolfBlue)
            }
            Spacer(minLength: 2)
            if !player.canScore {
                Image(systemName: "lock.fill").font(.system(size: 10)).foregroundStyle(.secondary)
            }
            Text(player.strokes(h).map { String($0) } ?? "–")
                .font(.system(size: 24, weight: .bold, design: .rounded))
                .monospacedDigit()
                .frame(minWidth: 30, alignment: .trailing)
        }
    }
}

// MARK: - One player's hole

struct PlayerHoleView: View {
    @EnvironmentObject var store: RoundStore
    let pid: String
    var embedded: Bool = false
    var fixedHole: Int? = nil

    var body: some View {
        if embedded {
            content
        } else {
            ScrollView { content.padding(.horizontal, 4) }
                .navigationTitle(store.player(pid)?.name ?? "")
        }
    }

    private var h: Int { fixedHole ?? store.currentHole }
    private var par: Int? { store.parFor(hole: h) }
    private var p: GroupPlayer? { store.player(pid) }
    private var canEdit: Bool { p?.canScore == true }
    private var holeLine: String { par.map { "Hole \(h) · Par \($0)" } ?? "Hole \(h)" }

    @ViewBuilder private var content: some View {
        if let p = p {
            VStack(spacing: 8) {
                if !embedded {
                    Text(holeLine)
                        .font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.7))
                }
                strokesRow(p)
                if store.track.putts { stepRow("Putts", value: p.puttsOn(h), minus: puttsMinus, plus: puttsPlus) }
                if store.track.fairways, let par = par, par >= 4 { fairwayRow(p) }
                if store.track.penalties { stepRow("Penalties", value: p.penalties(h) ?? 0, minus: penMinus, plus: penPlus) }
                if store.track.gir, let g = p.girOn(h) {
                    Text(g ? "GIR \u{2713}" : "GIR \u{2717}")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(g ? Color.green : Color.white.opacity(0.6))
                }
                if !canEdit {
                    Text("Scored by your group's scorekeeper")
                        .font(.system(size: 11)).foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
            }
        } else {
            Text("Player not on this card").foregroundStyle(.secondary)
        }
    }

    // Strokes: big number, − / + and the crown. + on an empty hole starts at par,
    // − on an empty hole starts at a birdie (the phone's rule).
    private func strokesRow(_ p: GroupPlayer) -> some View {
        HStack(spacing: 12) {
            stepButton("minus.circle.fill", enabled: canEdit) { strokesStep(-1) }
            Text(p.strokes(h).map { String($0) } ?? "–")
                .font(.system(size: 48, weight: .bold, design: .rounded))
                .monospacedDigit()
                .frame(minWidth: 56)
                .focusable(canEdit)
                .digitalCrownRotation(
                    .init(get: { Double(p.strokes(h) ?? par ?? 4) },
                          set: { v in
                              let n = Int(v.rounded())
                              if canEdit, n >= 1, n != p.strokes(h) { store.setCell(pid: pid, hole: h, field: "s", int: n) }
                          }),
                    from: 1, through: 15, by: 1, sensitivity: .medium
                )
            stepButton("plus.circle.fill", enabled: canEdit) { strokesStep(1) }
        }
    }

    private func strokesStep(_ d: Int) {
        let cur = p?.strokes(h)
        let base = par ?? 4
        let next: Int = cur.map { $0 + d } ?? (d > 0 ? base : max(1, base - 1))
        guard next >= 1 && next <= 15 else { return }
        store.setCell(pid: pid, hole: h, field: "s", int: next)
        tick()
    }

    // Putts: + on empty starts at 2, − on empty is a chip-in (0), − from 0 clears.
    private func puttsPlus() {
        let cur = p?.puttsOn(h)
        store.setCell(pid: pid, hole: h, field: "p", int: cur.map { min(10, $0 + 1) } ?? 2); tick()
    }
    private func puttsMinus() {
        let next: Int?
        if let c = p?.puttsOn(h) { next = (c <= 0) ? nil : c - 1 } else { next = 0 }
        store.setCell(pid: pid, hole: h, field: "p", int: next); tick()
    }
    private func penPlus() {
        let cur = p?.penalties(h) ?? 0
        guard cur < 3 else { return }
        store.setCell(pid: pid, hole: h, field: "pen", int: cur + 1); tick()
    }
    private func penMinus() {
        let cur = p?.penalties(h) ?? 0
        guard cur > 0 else { return }
        store.setCell(pid: pid, hole: h, field: "pen", int: cur - 1); tick()
    }

    private func stepRow(_ label: String, value: Int?, minus: @escaping () -> Void, plus: @escaping () -> Void) -> some View {
        HStack(spacing: 6) {
            Text(label).font(.system(size: 13)).foregroundStyle(Color.white.opacity(0.8))
            Spacer(minLength: 2)
            stepButton("minus.circle", enabled: canEdit, size: 24, action: minus)
            Text(value.map { String($0) } ?? "–")
                .font(.system(size: 18, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .frame(minWidth: 22)
            stepButton("plus.circle", enabled: canEdit, size: 24, action: plus)
        }
    }

    // Fairway: L · Hit · R. Tapping the selected one clears it.
    private func fairwayRow(_ p: GroupPlayer) -> some View {
        let cur = p.fairway(h)
        return VStack(spacing: 3) {
            Text(cur == "M" ? "Fairway · missed" : "Fairway")
                .font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.8))
            HStack(spacing: 4) {
                fwButton("L", label: "\u{2190} L", cur: cur)
                fwButton("H", label: "Hit", cur: cur)
                fwButton("R", label: "R \u{2192}", cur: cur)
            }
        }
    }
    private func fwButton(_ code: String, label: String, cur: String?) -> some View {
        let on = (cur == code)
        return Button {
            store.setCell(pid: pid, hole: h, field: "fw", str: on ? nil : code); tick()
        } label: {
            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .frame(maxWidth: .infinity, minHeight: 32)
                .background(on ? (code == "H" ? Color.green : Color.orange) : Color.white.opacity(0.12))
                .foregroundStyle(on ? Color.black : Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .disabled(!canEdit)
    }

    private func stepButton(_ name: String, enabled: Bool, size: CGFloat = 32, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: name)
                .font(.system(size: size))
                .frame(minWidth: 40, minHeight: 40)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(enabled ? Color.badGolfBlue : Color.white.opacity(0.25))
        .disabled(!enabled)
    }
}

// MARK: - Finish / Close

struct RoundActionsView: View {
    @EnvironmentObject var store: RoundStore
    @State private var confirmFinish = false
    @State private var confirmClose = false

    var body: some View {
        VStack(spacing: 6) {
            if store.canFinish {
                Button { confirmFinish = true } label: {
                    Label("Finish round", systemImage: "flag.checkered")
                        .font(.system(size: 14, weight: .semibold))
                }
                .buttonStyle(.bordered)        // its own tap target, even inside a List row
                .tint(.green)
                .confirmationDialog("Finish this round?", isPresented: $confirmFinish, titleVisibility: .visible) {
                    Button("Finish round") { Task { await store.requestFinish() } }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text("Your phone runs the finish. If it has a question, like a missing pick or blank holes, answer it there.")
                }
            }
            if let note = store.finishNote {
                Text(note)
                    .font(.system(size: 11))
                    .foregroundStyle(Color.white.opacity(0.7))
                    .multilineTextAlignment(.center)
            }
            // v926: the escape hatch — close the round on the watch only. Phone untouched.
            Button { confirmClose = true } label: {
                Label("Close on watch", systemImage: "xmark.circle")
                    .font(.system(size: 12, weight: .semibold))
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.white.opacity(0.55))
            .confirmationDialog("Close this round on the watch?", isPresented: $confirmClose, titleVisibility: .visible) {
                Button("Close on watch", role: .destructive) { store.closeOnWatch() }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Your scores stay safe on your phone. The watch clears until a new round starts — or tap Check again to reattach.")
            }
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Units page

struct UnitsView: View {
    @EnvironmentObject var store: RoundStore

    var body: some View {
        if let st = store.round?.standings, !st.games.isEmpty {
            List {
                // v1911: the GPS screen's match chips ("vs KW · 2 UP")
                if let chips = st.chips, !chips.isEmpty {
                    Section("Matches") {
                        ForEach(Array(chips.enumerated()), id: \.offset) { _, c in
                            HStack {
                                Text(c.label).font(.system(size: 13)).lineLimit(1)
                                Spacer(minLength: 4)
                                Text(c.text).font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(c.cls == "pos" ? Color.green : (c.cls == "neg" ? Color.orange : Color.white))
                            }
                        }
                    }
                }
                Section {
                    ForEach(board(st)) { row in
                        HStack {
                            Text(row.name).font(.system(size: 15, weight: row.me ? .bold : .regular)).lineLimit(1)
                            Spacer(minLength: 4)
                            Text(UnitsFormat.text(row.units))
                                .font(.system(size: 16, weight: .semibold, design: .rounded))
                                .monospacedDigit()
                                .foregroundStyle(row.units > 0.004 ? Color.green : (row.units < -0.004 ? Color.orange : Color.white))
                        }
                    }
                } header: {
                    Text(store.round?.isEvent == true ? "Group units · thru \(st.thru)" : "Units · thru \(st.thru)")
                }
                Section("By game") {
                    ForEach(st.games) { g in
                        NavigationLink(value: g.key) {
                            HStack {
                                Text(g.label).font(.system(size: 14)).lineLimit(1)
                                Spacer(minLength: 4)
                                if let meId = store.me?.id {
                                    Text(UnitsFormat.text(g.units[meId] ?? 0))
                                        .font(.system(size: 14, weight: .semibold)).monospacedDigit()
                                }
                            }
                        }
                    }
                }
            }
            .navigationDestination(for: String.self) { key in GameUnitsView(key: key) }
        } else {
            VStack(spacing: 6) {
                Image(systemName: "list.number").font(.system(size: 26)).foregroundStyle(Color.badGolfBlue)
                Text("No games this round").font(.headline)
                Text("Just keeping score.").font(.system(size: 13)).foregroundStyle(.secondary)
            }
        }
    }

    private func board(_ st: Standings) -> [BoardRow] {
        let all: [BoardRow] = store.players.map { p in
            BoardRow(id: p.id, name: p.name, units: st.units[p.id] ?? 0, me: p.me)
        }
        return all.sorted { $0.units > $1.units }
    }
}

struct GameUnitsView: View {
    @EnvironmentObject var store: RoundStore
    let key: String
    private var game: GameUnits? { store.round?.standings?.games.first(where: { $0.key == key }) }
    private var rows: [BoardRow] {
        let g = game
        let all: [BoardRow] = store.players.map { p in
            BoardRow(id: p.id, name: p.name, units: g?.units[p.id] ?? 0, me: p.me)
        }
        return all.sorted { $0.units > $1.units }
    }
    var body: some View {
        List {
            ForEach(rows) { row in
                HStack {
                    Text(row.name).font(.system(size: 15, weight: row.me ? .bold : .regular)).lineLimit(1)
                    Spacer(minLength: 4)
                    Text(UnitsFormat.text(row.units)).monospacedDigit()
                }
            }
        }
        .navigationTitle(game?.label ?? "Game")
    }
}

// MARK: - Final card

struct SummaryView: View {
    @EnvironmentObject var store: RoundStore
    let summary: RoundSummary

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                Text("Round finished").font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.7))
                Text(summary.course).font(.system(size: 13, weight: .semibold)).lineLimit(2).multilineTextAlignment(.center)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("\(summary.strokes)").font(.system(size: 40, weight: .bold, design: .rounded))
                    Text(toParText).font(.system(size: 18, weight: .semibold)).foregroundStyle(Color.badGolfBlue)
                }
                if summary.holes > 0 && summary.holes != 18 {
                    Text("\(summary.holes) holes").font(.system(size: 11)).foregroundStyle(.secondary)
                }
                HStack(spacing: 10) {
                    if let p = summary.putts { stat("Putts", "\(p)") }
                    if let f = summary.fairways { stat("FW", f) }
                    if let g = summary.girs { stat("GIR", g) }
                }
                if let u = summary.units {
                    Text("Your units: \(UnitsFormat.text(u))").font(.system(size: 14, weight: .semibold))
                }
                if !summary.board.isEmpty {
                    VStack(spacing: 2) {
                        ForEach(summary.board.prefix(6)) { row in
                            HStack {
                                Text(row.name).font(.system(size: 13, weight: row.me ? .bold : .regular)).lineLimit(1)
                                Spacer(minLength: 4)
                                Text(UnitsFormat.text(row.units)).font(.system(size: 13)).monospacedDigit()
                            }
                        }
                    }
                    .padding(.top, 2)
                }
                Button("Done") { store.dismissSummary() }
                    .buttonStyle(.borderedProminent)
                    .tint(Color.badGolfBlue)
                    .padding(.top, 4)
            }
            .padding(.horizontal, 6)
        }
        .background(Color.badGolfNavy.ignoresSafeArea())
    }

    private var toParText: String {
        summary.toPar == 0 ? "E" : (summary.toPar > 0 ? "+\(summary.toPar)" : "\(summary.toPar)")
    }
    private func stat(_ k: String, _ v: String) -> some View {
        VStack(spacing: 0) {
            Text(v).font(.system(size: 15, weight: .semibold)).monospacedDigit()
            Text(k).font(.system(size: 10)).foregroundStyle(.secondary)
        }
    }
}
