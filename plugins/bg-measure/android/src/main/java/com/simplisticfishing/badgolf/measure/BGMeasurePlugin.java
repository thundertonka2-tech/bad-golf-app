package com.simplisticfishing.badgolf.measure;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.ar.core.ArCoreApk;

/**
 * Bad Golf — AR distance measure, Android (v1831).
 *
 * Same JS contract as the iPhone plugin (ios/App/App/BGMeasurePlugin.swift):
 *   Capacitor.Plugins.BGMeasure.isAvailable()      -> { available, lidar:false }
 *   Capacitor.Plugins.BGMeasure.measure({ title }) -> { inches, ft, in, meters } | { cancelled:true }
 *   rejects "AR_UNSUPPORTED" on a phone that can't do ARCore.
 *
 * The web code (bgMeasureAvailable / bgMeasureInto) is shared and needs no change.
 */
@CapacitorPlugin(name = "BGMeasure")
public class BGMeasurePlugin extends Plugin {

    private final Handler main = new Handler(Looper.getMainLooper());

    /** ARCore answers "checking…" for a moment on first ask; poll briefly for a real answer. */
    private void withAvailability(final Callback cb) {
        if (Build.VERSION.SDK_INT < 24) { cb.done(false); return; }
        final int[] tries = {0};
        final Runnable[] r = new Runnable[1];
        r[0] = () -> {
            ArCoreApk.Availability a;
            try {
                a = ArCoreApk.getInstance().checkAvailability(getContext());
            } catch (Throwable t) {
                cb.done(false);
                return;
            }
            if (a.isTransient() && tries[0]++ < 12) {
                main.postDelayed(r[0], 200);
                return;
            }
            // SUPPORTED_INSTALLED / SUPPORTED_APK_TOO_OLD / SUPPORTED_NOT_INSTALLED all count:
            // the measure screen offers the Google Play Services for AR install itself.
            // Still "checking" after ~2.5s: be optimistic; measure() re-checks.
            cb.done(a.isSupported() || a.isTransient());
        };
        main.post(r[0]);
    }

    private interface Callback { void done(boolean ok); }

    @PluginMethod
    public void isAvailable(final PluginCall call) {
        withAvailability(ok -> {
            JSObject r = new JSObject();
            r.put("available", ok);
            r.put("lidar", false);
            call.resolve(r);
        });
    }

    @PluginMethod
    public void measure(final PluginCall call) {
        withAvailability(ok -> {
            if (!ok) { call.reject("AR_UNSUPPORTED"); return; }
            Intent i = new Intent(getContext(), MeasureActivity.class);
            i.putExtra(MeasureActivity.EXTRA_TITLE, call.getString("title", "Measure"));
            // v1840 languages: the web app's translations of every label on the AR screen.
            try { com.getcapacitor.JSObject s = call.getObject("strings"); if (s != null) i.putExtra(MeasureActivity.EXTRA_STRINGS, s.toString()); } catch (Exception ignored) { }
            startActivityForResult(call, i, "onMeasureResult");
        });
    }

    @ActivityCallback
    private void onMeasureResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent d = result.getData();
        if (result.getResultCode() == Activity.RESULT_OK && d != null && d.hasExtra(MeasureActivity.EXTRA_INCHES)) {
            double inches = d.getDoubleExtra(MeasureActivity.EXTRA_INCHES, 0);
            int total = (int) Math.round(inches);
            JSObject r = new JSObject();
            r.put("inches", total);
            r.put("ft", total / 12);
            r.put("in", total % 12);
            r.put("meters", inches * 0.0254);
            call.resolve(r);
            return;
        }
        if (d != null && d.hasExtra(MeasureActivity.EXTRA_ERROR)) {
            call.reject(d.getStringExtra(MeasureActivity.EXTRA_ERROR));
            return;
        }
        JSObject r = new JSObject();
        r.put("cancelled", true);
        call.resolve(r);
    }
}
