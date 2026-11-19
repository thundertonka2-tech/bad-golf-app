# 2026-11-19 (Xcode 27) - adopts the UIScene life cycle at CI time (run from the repo root by
# codemagic.yaml, ONLY on Xcode 27+). Copies ios-config/SceneDelegate.swift into the App
# target and adds UIApplicationSceneManifest to Info.plist. Idempotent.
require "xcodeproj"
require "fileutils"

PROJ_PATH = "ios/App/App.xcodeproj"
SRC = "ios-config/SceneDelegate.swift"
DST = "ios/App/App/SceneDelegate.swift"
PLIST = "ios/App/App/Info.plist"

abort("#{SRC} not found") unless File.exist?(SRC)
FileUtils.cp(SRC, DST)

proj = Xcodeproj::Project.open(PROJ_PATH)
target = proj.targets.find { |t| t.name == "App" }
abort("App target not found") unless target
group = proj.main_group.find_subpath("App", false) || proj.main_group["App"]
abort("App group not found") unless group
ref = group.files.find { |f| f.path == "SceneDelegate.swift" } || group.new_reference("SceneDelegate.swift")
unless target.source_build_phase.files_references.include?(ref)
  target.source_build_phase.add_file_reference(ref, true)
end
proj.save

plist = Xcodeproj::Plist.read_from_path(PLIST)
plist["UIApplicationSceneManifest"] = {
  "UIApplicationSupportsMultipleScenes" => false,
  "UISceneConfigurations" => {
    "UIWindowSceneSessionRoleApplication" => [
      {
        "UISceneConfigurationName" => "Default Configuration",
        "UISceneDelegateClassName" => "$(PRODUCT_MODULE_NAME).SceneDelegate",
        "UISceneStoryboardFile" => "Main"
      }
    ]
  }
}
Xcodeproj::Plist.write_to_path(plist, PLIST)
puts "SceneDelegate.swift is in the App target; Info.plist has UIApplicationSceneManifest"
