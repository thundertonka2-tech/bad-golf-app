// Capacitor plugin registration for BGMeasure (v1830). Same pattern as WatchBridgePlugin.m;
// the instance is also registered explicitly in MainViewController.

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(BGMeasurePlugin, "BGMeasure",
    CAP_PLUGIN_METHOD(isAvailable, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(measure, CAPPluginReturnPromise);
)
