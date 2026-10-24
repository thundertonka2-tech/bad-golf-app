#!/bin/sh
# v1943 - runtime test of the watch's plays-as (Geo.playsLike), compiled from the real source
# against a two-line CoreLocation stub (CoreLocation isn't on Linux). Kevin, Cedar Crest #14:
# "3 · plays 0" from a stale player height.   sh qa/watch_swift/plays_like.sh
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
W="$HERE/../../ios/App/BadGolfWatch Watch App/Geo.swift"
T="$(mktemp -d)"
S=$(grep -n 'static func bearing' "$W" | cut -d: -f1)
E=$(awk -v s="$S" 'NR>s && /^}/ {print NR-1; exit}' "$W")
{ echo 'import Foundation'; echo 'struct CLLocationCoordinate2D { var latitude: Double; var longitude: Double }'
  echo 'enum Geo {'; echo '    static let metersToYards = 1.09361'; sed -n "${S},${E}p" "$W"; echo '}'
  cat "$HERE/plays_like_main.swift"; } > "$T/pl.swift"
cd "$T" && swiftc -swift-version 5 -o pl pl.swift && ./pl
