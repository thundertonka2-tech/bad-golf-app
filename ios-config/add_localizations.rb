# v1840 LANGUAGES — wires the translated iOS text into the Xcode project at CI time
# (run from the repo root by codemagic.yaml after add_widget_target.rb). Idempotent.
#   ios/App/App/<lang>.lproj/InfoPlist.strings            -> App target (permission prompts)
#   ios/App/BadGolfWidgets/<lang>.lproj/Localizable.strings -> widget target (Live Activity)
# The text itself is generated from i18n/native_strings.json.
require "xcodeproj"

PROJ_PATH = "ios/App/App.xcodeproj"
LANGS     = %w[en es ko ja zh-Hans]

proj = Xcodeproj::Project.open(PROJ_PATH)

# Tell Xcode the project knows these languages.
regions = proj.root_object.known_regions || []
(LANGS + ["Base"]).each { |l| regions << l unless regions.include?(l) }
proj.root_object.known_regions = regions

def wire_variant(proj, target_name, group_name, file_name, langs, disk_dir)
  target = proj.targets.find { |t| t.name == target_name }
  return puts("#{target_name} target not found - skipped #{file_name}") unless target
  group = proj.main_group.find_subpath(group_name, false) || proj.main_group[group_name]
  return puts("#{group_name} group not found - skipped #{file_name}") unless group
  vg = group.children.find { |c| c.isa == "PBXVariantGroup" && c.name == file_name } || group.new_variant_group(file_name)
  langs.each do |l|
    rel = "#{l}.lproj/#{file_name}"
    next unless File.exist?(File.join(disk_dir, rel))
    next if vg.children.any? { |f| f.path == rel }
    ref = vg.new_reference(rel)
    ref.name = l
  end
  unless target.resources_build_phase.files_references.include?(vg)
    target.resources_build_phase.add_file_reference(vg, true)
  end
  puts "#{target_name}: #{file_name} in #{vg.children.map(&:name).join(', ')}"
end

wire_variant(proj, "App", "App", "InfoPlist.strings", LANGS, "ios/App/App")
wire_variant(proj, "BadGolfWidgets", "BadGolfWidgets", "Localizable.strings", LANGS, "ios/App/BadGolfWidgets")

proj.save
puts "Saved #{PROJ_PATH} (knownRegions: #{proj.root_object.known_regions.join(', ')})"
