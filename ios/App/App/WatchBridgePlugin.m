// Capacitor plugin registration for WatchBridge.
// Add this file alongside WatchBridgePlugin.swift in the iOS app target.

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(WatchBridgePlugin, "WatchBridge",
    CAP_PLUGIN_METHOD(syncSession, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(watchStatus, CAPPluginReturnPromise);
)
