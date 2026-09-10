# Bad Golf — pin the fetched App Store provisioning profiles onto EVERY target in
# the Xcode project, by bundle id (v1606, Codemagic 9/10/2026).
#
# Why: `xcode-project use-profiles` is supposed to do this, and did for months. On
# the Xcode 26.6 builder image the BadGolfWidgets extension target (added at CI
# time by add_widget_target.rb) came out of that step with no profile assigned and
# the archive died with:
#   error: "BadGolfWidgets" requires a provisioning profile. Select a provisioning
#   profile in the Signing & Capabilities editor.
# The profile itself WAS on disk (fetch-signing-files succeeded). So this script
# reads every .mobileprovision Codemagic installed, maps bundle id -> profile, and
# writes manual-signing settings onto each matching target. Run it right after
# `xcode-project use-profiles`. Idempotent; prints a table; never masks a real
# mismatch — a target whose bundle id has no profile is called out loudly.
#
# Needs the xcodeproj gem (already installed by the entitlements step). CFPropertyList
# is one of its dependencies, which is what we use to parse the decoded profiles.

require "xcodeproj"
require "cfpropertylist"

PROJ_PATH = "ios/App/App.xcodeproj"
PROFILES_DIR = File.expand_path("~/Library/MobileDevice/Provisioning Profiles")

profiles = {}   # bundle id => { uuid:, name:, team: }
Dir.glob(File.join(PROFILES_DIR, "*.mobileprovision")).each do |f|
  begin
    xml = `security cms -D -i "#{f}" 2>/dev/null`
    next if xml.nil? || xml.empty?
    plist = CFPropertyList::List.new(data: xml)
    p = CFPropertyList.native_types(plist.value)
    ent = p["Entitlements"] || {}
    appid = ent["application-identifier"].to_s          # TEAMID.com.bundle.id
    team  = (p["TeamIdentifier"] || []).first.to_s
    team  = appid.split(".").first if team.empty?
    bid   = appid.sub(/^[A-Z0-9]+\./, "")
    next if bid.empty? || bid.end_with?("*")
    profiles[bid] = { uuid: p["UUID"].to_s, name: p["Name"].to_s, team: team, file: File.basename(f) }
  rescue => e
    puts "WARN: could not read #{File.basename(f)}: #{e.message}"
  end
end

puts "===== Provisioning profiles found (#{profiles.size}) ====="
profiles.each { |bid, pr| puts "  #{bid.ljust(48)} #{pr[:name]}  (#{pr[:uuid]}, team #{pr[:team]})" }
if profiles.empty?
  puts "WARN: no profiles on disk under #{PROFILES_DIR} — nothing to pin"
  exit 0
end

proj = Xcodeproj::Project.open(PROJ_PATH)
missing = []
proj.targets.each do |t|
  next unless t.respond_to?(:product_type)
  # Only real, signable products: the app, app extensions, watch apps.
  next unless t.product_type.to_s =~ /application|app-extension|watchapp|watchkit/
  t.build_configurations.each do |c|
    bs  = c.build_settings
    bid = bs["PRODUCT_BUNDLE_IDENTIFIER"].to_s
    pr  = profiles[bid]
    if pr.nil?
      missing << "#{t.name}/#{c.name} (#{bid.empty? ? 'no PRODUCT_BUNDLE_IDENTIFIER' : bid})"
      next
    end
    bs["CODE_SIGN_STYLE"]                = "Manual"
    bs["DEVELOPMENT_TEAM"]               = pr[:team]
    bs["PROVISIONING_PROFILE_SPECIFIER"] = pr[:name]
    bs["PROVISIONING_PROFILE"]           = pr[:uuid]
    bs["CODE_SIGN_IDENTITY"]             = "iPhone Distribution"
    bs["CODE_SIGN_IDENTITY[sdk=iphoneos*]"] = "iPhone Distribution"
    puts "  pinned #{t.name.ljust(18)} #{c.name.ljust(8)} -> #{pr[:name]}"
  end
end
proj.save
puts "Saved #{PROJ_PATH}"

unless missing.empty?
  puts "!! Targets with NO matching profile on disk (the archive will fail for these):"
  missing.each { |m| puts "     #{m}" }
end
