// Capacitor plugin registration for LiveActivity.
// Sits alongside LiveActivityPlugin.swift in the iOS app target. Note: like
// WatchBridge, the reliable registration is the explicit registerPluginInstance
// call in MainViewController — this macro is kept for Debug builds/completeness.

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(LiveActivityPlugin, "LiveActivity",
    CAP_PLUGIN_METHOD(start, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(update, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(end, CAPPluginReturnPromise);
)
