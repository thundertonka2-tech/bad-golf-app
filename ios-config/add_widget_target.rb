# Bad Golf — adds the BadGolfWidgets Live Activity extension target to the Xcode
# project at CI time (run from the repo root by codemagic.yaml; no Mac needed).
# Idempotent: safe to run on every build. Also wires the two LiveActivityPlugin
# files into the App target's sources.
#
# Run AFTER the entitlements step (which installs the xcodeproj gem) and BEFORE
# `pod install` / code signing.

require "xcodeproj"

PROJ_PATH   = "ios/App/App.xcodeproj"
WIDGET_NAME = "BadGolfWidgets"
WIDGET_BUNDLE_ID = "com.simplisticfishing.badgolf.widgets"

proj = Xcodeproj::Project.open(PROJ_PATH)
app  = proj.targets.find { |t| t.name == "App" }
abort("App target not found") unless app

def ensure_ref(group, filename)
  group.files.find { |f| f.path == filename } || group.new_reference(filename)
end

def in_sources?(target, ref)
  target.source_build_phase.files_references.include?(ref)
end

# ---- 1. LiveActivityPlugin.swift/.m into the App target ----
app_group = proj.main_group.find_subpath("App", false) || proj.main_group["App"]
abort("App group not found") unless app_group
["LiveActivityPlugin.swift", "LiveActivityPlugin.m"].each do |f|
  ref = ensure_ref(app_group, f)
  unless in_sources?(app, ref)
    app.add_file_references([ref])
    puts "Added #{f} to App target sources"
  end
end

# ---- 2. Widget group + file references ----
wgrp = proj.main_group[WIDGET_NAME] || proj.main_group.new_group(WIDGET_NAME, WIDGET_NAME)
attr_ref   = ensure_ref(wgrp, "BadGolfRoundAttributes.swift")
bundle_ref = ensure_ref(wgrp, "BadGolfWidgetsBundle.swift")

# The shared attributes struct also compiles into the App (the plugin uses it).
unless in_sources?(app, attr_ref)
  app.add_file_references([attr_ref])
  puts "Added BadGolfRoundAttributes.swift to App target sources"
end

# ---- 3. The extension target itself ----
ext = proj.targets.find { |t| t.name == WIDGET_NAME }
unless ext
  ext = proj.new_target(:app_extension, WIDGET_NAME, :ios, "16.1")
  ext.add_file_references([bundle_ref, attr_ref])
  ext.build_configurations.each do |c|
    bs = c.build_settings
    bs["PRODUCT_BUNDLE_IDENTIFIER"]   = WIDGET_BUNDLE_ID
    bs["INFOPLIST_FILE"]              = "#{WIDGET_NAME}/Info.plist"
    bs["GENERATE_INFOPLIST_FILE"]     = "NO"
    bs["SWIFT_VERSION"]               = "5.0"
    bs["IPHONEOS_DEPLOYMENT_TARGET"]  = "16.1"
    bs["TARGETED_DEVICE_FAMILY"]      = "1,2"
    bs["SKIP_INSTALL"]                = "YES"
    bs["VERSIONING_SYSTEM"]           = "apple-generic"
    bs["CURRENT_PROJECT_VERSION"]     = "1"
    bs["MARKETING_VERSION"]           = "1.0"
    bs["LD_RUNPATH_SEARCH_PATHS"]     = ["$(inherited)", "@executable_path/Frameworks", "@executable_path/../../Frameworks"]
  end
  app.add_dependency(ext)

  # Embed the .appex in the app's PlugIns folder (dst_subfolder_spec 13).
  embed = app.copy_files_build_phases.find { |p| p.dst_subfolder_spec == "13" }
  unless embed
    embed = app.new_copy_files_build_phase("Embed Foundation Extensions")
    embed.dst_subfolder_spec = "13"
  end
  unless embed.files_references.include?(ext.product_reference)
    bf = embed.add_file_reference(ext.product_reference)
    bf.settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }
  end
  puts "Created #{WIDGET_NAME} extension target (#{WIDGET_BUNDLE_ID})"
else
  puts "#{WIDGET_NAME} target already present — nothing to do"
end

proj.save
puts "Saved #{PROJ_PATH}"
