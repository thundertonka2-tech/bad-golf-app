# v2000 (audit UX-7) — adds ios/App/App/PrivacyInfo.xcprivacy to the App target's resources at CI time
# (run from the repo root by codemagic.yaml). Idempotent. The Watch app's manifest needs no wiring: its
# folder is a synchronized group, so Xcode bundles it automatically.
require "xcodeproj"

PROJ_PATH = "ios/App/App.xcodeproj"
proj = Xcodeproj::Project.open(PROJ_PATH)
target = proj.targets.find { |t| t.name == "App" }
abort("App target not found") unless target
group = proj.main_group.find_subpath("App", false) || proj.main_group["App"]
abort("App group not found") unless group
ref = group.files.find { |f| f.path == "PrivacyInfo.xcprivacy" } || group.new_reference("PrivacyInfo.xcprivacy")
unless target.resources_build_phase.files_references.include?(ref)
  target.resources_build_phase.add_file_reference(ref, true)
end
proj.save
puts "PrivacyInfo.xcprivacy is in the App target's resources"
