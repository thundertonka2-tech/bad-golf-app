#!/bin/sh
# v1910 — runtime test of the watch's models, parsers and RoundStore (group scoring,
# hole stats, cell queue, heartbeat overlay, debounced send, finish ordering, final card)
# and (v1911) the map maths: projection, aim, arcs, shot miss, Est. Drive, greens, slope.
# Needs a Swift toolchain (Linux is fine: https://www.swift.org/install/). SwiftUI views
# are NOT compiled here — Combine / WatchConnectivity / WorkoutSession are stubbed in
# Stubs.swift. Fixtures are a real phone hand-off produced by BadGolfWatchSync (v1910).
#   sh qa/watch_swift/run.sh
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
W="$HERE/../../ios/App/BadGolfWatch Watch App"
T="$(mktemp -d)"
sed 's/^import CoreLocation$//' "$W/Models.swift" > "$T/Models.swift"
sed 's/^import Combine$//' "$W/RoundStore.swift" > "$T/RoundStore.swift"
cp "$W/SessionStore.swift" "$W/GolfGeometry.swift" "$T/"
sed 's/^import Combine$//' "$W/GreenStore.swift" > "$T/GreenStore.swift"
sed 's/^import Foundation$/import Foundation\n#if canImport(FoundationNetworking)\nimport FoundationNetworking\n#endif/' "$W/SupabaseService.swift" > "$T/SupabaseService.swift"
cp "$HERE/Stubs.swift" "$HERE/main.swift" "$HERE/fixture_live.json" "$HERE/fixture_ended.json" "$T/"
cd "$T"
swiftc -swift-version 5 -o watchtest Stubs.swift Models.swift SessionStore.swift SupabaseService.swift RoundStore.swift GolfGeometry.swift GreenStore.swift main.swift
HOME="$T" ./watchtest
