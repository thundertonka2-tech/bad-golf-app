package com.simplisticfishing.badgolf.measure;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.opengl.GLES11Ext;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.opengl.Matrix;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.Surface;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.google.ar.core.Anchor;
import com.google.ar.core.ArCoreApk;
import com.google.ar.core.Camera;
import com.google.ar.core.Config;
import com.google.ar.core.Coordinates2d;
import com.google.ar.core.DepthPoint;
import com.google.ar.core.Frame;
import com.google.ar.core.HitResult;
import com.google.ar.core.Plane;
import com.google.ar.core.Point;
import com.google.ar.core.Pose;
import com.google.ar.core.Session;
import com.google.ar.core.Trackable;
import com.google.ar.core.TrackingFailureReason;
import com.google.ar.core.TrackingState;
import com.google.ar.core.exceptions.UnavailableDeviceNotCompatibleException;
import com.google.ar.core.exceptions.UnavailableUserDeclinedInstallationException;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.ArrayList;
import java.util.List;

import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

/**
 * Bad Golf — the AR measure screen on Android (v1831). Mirrors the iPhone screen:
 * crosshair in the middle, "Mark ball" → "Mark hole" → "Use 4′ 7″", with Undo / Cancel.
 * Distance is the straight-line distance between the two marks (same as iOS).
 *
 * Built entirely in code (no layouts/resources) so the plugin stays a handful of files.
 * Threads: ARCore + all anchor state live on the GL thread; the UI thread only posts
 * requests (queueEvent) and receives text updates (runOnUiThread).
 */
public class MeasureActivity extends Activity implements GLSurfaceView.Renderer {

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_INCHES = "inches";
    public static final String EXTRA_ERROR = "error";

    private static final int REQ_CAMERA = 4711;
    private static final double M_TO_IN = 39.3701;

    private static final int GOLD = Color.rgb(242, 201, 76);
    private static final int NAVY = Color.argb(235, 13, 59, 99);
    private static final int NAVY_TEXT = Color.rgb(8, 36, 64);

    // ── UI ─────────────────────────────────────────────────────────────────────────────
    private GLSurfaceView glView;
    private Overlay overlay;
    private TextView infoLabel, distLabel;
    private Button markButton, useButton, undoButton;

    // ── AR (GL thread) ─────────────────────────────────────────────────────────────────
    private volatile Session session;
    private boolean installRequested;
    private boolean textureSet;
    private int cameraTex = -1;
    private int program, aPos, aTex, uTex;
    private final FloatBuffer quadNdc = floatBuf(new float[]{-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f});
    private final FloatBuffer quadUv = floatBuf(new float[8]);
    private int surfW, surfH;
    private final List<Anchor> anchors = new ArrayList<>();
    private boolean markRequested;
    private boolean done;
    private double resultInches = -1;
    private String lastInfo = "";

    private final float[] view = new float[16];
    private final float[] proj = new float[16];
    private final float[] viewProj = new float[16];

    // Screen positions for the overlay (written on GL thread, read on UI thread).
    private volatile float[] screenPts = new float[0];  // x0,y0,x1,y1…  NaN = off-screen
    private volatile float[] livePt = null;              // crosshair's ground point while aiming at the hole

    // ── lifecycle ──────────────────────────────────────────────────────────────────────

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        glView = new GLSurfaceView(this);
        glView.setPreserveEGLContextOnPause(true);
        glView.setEGLContextClientVersion(2);
        glView.setEGLConfigChooser(8, 8, 8, 8, 16, 0);
        glView.setRenderer(this);
        glView.setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);
        root.addView(glView, match());

        overlay = new Overlay(this);
        root.addView(overlay, match());

        // Top: title + instructions
        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.VERTICAL);
        top.setPadding(dp(16), dp(28), dp(16), 0);
        TextView title = new TextView(this);
        String t = getIntent().getStringExtra(EXTRA_TITLE);
        title.setText(t == null || t.isEmpty() ? "Measure" : t);
        title.setTextColor(Color.WHITE);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        title.setShadowLayer(4, 0, 1, Color.BLACK);
        top.addView(title, wrapW());
        infoLabel = new TextView(this);
        infoLabel.setTextColor(Color.WHITE);
        infoLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        infoLabel.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        infoLabel.setGravity(Gravity.CENTER);
        infoLabel.setPadding(dp(14), dp(12), dp(14), dp(12));
        infoLabel.setBackground(rounded(NAVY, 12));
        infoLabel.setMinHeight(dp(52));
        LinearLayout.LayoutParams ilp = wrapW();
        ilp.topMargin = dp(10);
        top.addView(infoLabel, ilp);
        root.addView(top, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP));

        // Bottom: distance readout + buttons
        LinearLayout bottom = new LinearLayout(this);
        bottom.setOrientation(LinearLayout.VERTICAL);
        bottom.setPadding(dp(16), 0, dp(16), dp(20));
        distLabel = new TextView(this);
        distLabel.setTextColor(GOLD);
        distLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 44);
        distLabel.setTypeface(Typeface.create(Typeface.MONOSPACE, Typeface.BOLD));
        distLabel.setGravity(Gravity.CENTER);
        distLabel.setShadowLayer(6, 0, 2, Color.BLACK);
        bottom.addView(distLabel, wrapW());

        markButton = button("Mark ball", true);
        useButton = button("Use this distance", true);
        useButton.setVisibility(View.GONE);
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56));
        blp.topMargin = dp(12);
        bottom.addView(markButton, blp);
        bottom.addView(useButton, new LinearLayout.LayoutParams(blp));

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        Button cancel = button("Cancel", false);
        undoButton = button("Undo", false);
        undoButton.setVisibility(View.INVISIBLE);
        LinearLayout.LayoutParams half = new LinearLayout.LayoutParams(0, dp(50), 1f);
        LinearLayout.LayoutParams half2 = new LinearLayout.LayoutParams(0, dp(50), 1f);
        half2.leftMargin = dp(12);
        row.addView(cancel, half);
        row.addView(undoButton, half2);
        LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        rlp.topMargin = dp(12);
        bottom.addView(row, rlp);
        root.addView(bottom, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM));

        setContentView(root);
        setInfo("Starting up. Move the phone slowly over the ground.");

        markButton.setOnClickListener(v -> glView.queueEvent(() -> markRequested = true));
        undoButton.setOnClickListener(v -> glView.queueEvent(this::undoOnGl));
        useButton.setOnClickListener(v -> finishWith(resultInches));
        cancel.setOnClickListener(v -> finishWith(-1));
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (session == null) {
            try {
                switch (ArCoreApk.getInstance().requestInstall(this, !installRequested)) {
                    case INSTALL_REQUESTED:
                        // Play Store "Google Play Services for AR" screen; we come back to onResume.
                        installRequested = true;
                        return;
                    case INSTALLED:
                        break;
                }
                if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
                    return;
                }
                Session s = new Session(this);
                Config c = new Config(s);
                c.setPlaneFindingMode(Config.PlaneFindingMode.HORIZONTAL);
                c.setFocusMode(Config.FocusMode.AUTO);
                c.setUpdateMode(Config.UpdateMode.LATEST_CAMERA_IMAGE);
                if (s.isDepthModeSupported(Config.DepthMode.AUTOMATIC)) {
                    c.setDepthMode(Config.DepthMode.AUTOMATIC);   // better hits on flat grass
                }
                s.configure(c);
                session = s;
            } catch (UnavailableUserDeclinedInstallationException e) {
                finishWithError("AR_DECLINED");
                return;
            } catch (UnavailableDeviceNotCompatibleException e) {
                finishWithError("AR_UNSUPPORTED");
                return;
            } catch (Throwable e) {
                finishWithError("AR_UNSUPPORTED");
                return;
            }
        }
        try {
            session.resume();
        } catch (Throwable e) {
            finishWithError("CAMERA_UNAVAILABLE");
            return;
        }
        glView.onResume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        glView.onPause();
        if (session != null) session.pause();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (session != null) {
            session.close();
            session = null;
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (code != REQ_CAMERA) return;
        if (res.length == 0 || res[0] != PackageManager.PERMISSION_GRANTED) {
            finishWithError("CAMERA_DENIED");
        }
        // Granted: onResume runs again and builds the session.
    }

    @Override
    public void onBackPressed() {
        finishWith(-1);
    }

    private void finishWith(double inches) {
        if (inches >= 0) {
            Intent d = new Intent();
            d.putExtra(EXTRA_INCHES, inches);
            setResult(RESULT_OK, d);
        } else {
            setResult(RESULT_CANCELED);
        }
        finish();
    }

    private void finishWithError(String code) {
        Intent d = new Intent();
        d.putExtra(EXTRA_ERROR, code);
        setResult(RESULT_CANCELED, d);
        finish();
    }

    // ── GL renderer ────────────────────────────────────────────────────────────────────

    @Override
    public void onSurfaceCreated(GL10 gl, EGLConfig config) {
        GLES20.glClearColor(0f, 0f, 0f, 1f);
        int[] tex = new int[1];
        GLES20.glGenTextures(1, tex, 0);
        cameraTex = tex[0];
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, cameraTex);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
        textureSet = false;

        String vs = "attribute vec4 a_Position; attribute vec2 a_TexCoord; varying vec2 v_TexCoord;"
                + "void main(){ gl_Position = a_Position; v_TexCoord = a_TexCoord; }";
        String fs = "#extension GL_OES_EGL_image_external : require\n"
                + "precision mediump float; varying vec2 v_TexCoord; uniform samplerExternalOES sTexture;"
                + "void main(){ gl_FragColor = texture2D(sTexture, v_TexCoord); }";
        program = GLES20.glCreateProgram();
        GLES20.glAttachShader(program, shader(GLES20.GL_VERTEX_SHADER, vs));
        GLES20.glAttachShader(program, shader(GLES20.GL_FRAGMENT_SHADER, fs));
        GLES20.glLinkProgram(program);
        aPos = GLES20.glGetAttribLocation(program, "a_Position");
        aTex = GLES20.glGetAttribLocation(program, "a_TexCoord");
        uTex = GLES20.glGetUniformLocation(program, "sTexture");
    }

    @Override
    public void onSurfaceChanged(GL10 gl, int w, int h) {
        GLES20.glViewport(0, 0, w, h);
        surfW = w;
        surfH = h;
        if (session != null) session.setDisplayGeometry(displayRotation(), w, h);
    }

    @Override
    public void onDrawFrame(GL10 gl) {
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT | GLES20.GL_DEPTH_BUFFER_BIT);
        if (session == null) return;
        if (!textureSet) {
            session.setCameraTextureName(cameraTex);
            session.setDisplayGeometry(displayRotation(), surfW, surfH);
            textureSet = true;
        }
        Frame frame;
        try {
            frame = session.update();
        } catch (Throwable e) {
            return;
        }
        if (frame.hasDisplayGeometryChanged()) {
            frame.transformCoordinates2d(Coordinates2d.OPENGL_NORMALIZED_DEVICE_COORDINATES, quadNdc,
                    Coordinates2d.TEXTURE_NORMALIZED, quadUv);
        }
        if (frame.getTimestamp() != 0) drawBackground();

        Camera cam = frame.getCamera();
        TrackingState ts = cam.getTrackingState();
        updateTrackingInfo(cam, ts);
        if (ts != TrackingState.TRACKING) {
            markRequested = false;
            publishScreen(null);
            return;
        }
        cam.getViewMatrix(view, 0);
        cam.getProjectionMatrix(proj, 0, 0.05f, 100f);
        Matrix.multiplyMM(viewProj, 0, proj, 0, view, 0);

        if (markRequested) {
            markRequested = false;
            handleMark(frame);
        }

        // Live readout: from the ball mark to wherever the crosshair lands now.
        float[] live = null;
        if (!done && anchors.size() == 1) {
            Pose p = hitAtCenter(frame);
            if (p != null) {
                live = p.getTranslation();
                final double d = inchesBetween(anchors.get(0).getPose().getTranslation(), live);
                runOnUiThread(() -> { if (!done) distLabel.setText(fmt(d)); });
            }
        }
        publishScreen(live);
    }

    private void drawBackground() {
        GLES20.glDisable(GLES20.GL_DEPTH_TEST);
        GLES20.glDepthMask(false);
        GLES20.glUseProgram(program);
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0);
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, cameraTex);
        GLES20.glUniform1i(uTex, 0);
        quadNdc.position(0);
        quadUv.position(0);
        GLES20.glVertexAttribPointer(aPos, 2, GLES20.GL_FLOAT, false, 0, quadNdc);
        GLES20.glVertexAttribPointer(aTex, 2, GLES20.GL_FLOAT, false, 0, quadUv);
        GLES20.glEnableVertexAttribArray(aPos);
        GLES20.glEnableVertexAttribArray(aTex);
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
        GLES20.glDisableVertexAttribArray(aPos);
        GLES20.glDisableVertexAttribArray(aTex);
        GLES20.glDepthMask(true);
        GLES20.glEnable(GLES20.GL_DEPTH_TEST);
    }

    // ── measuring (GL thread) ──────────────────────────────────────────────────────────

    /** Ground point under the crosshair: detected plane first, then depth, then any surface. */
    private Pose hitAtCenter(Frame frame) {
        List<HitResult> hits;
        try {
            hits = frame.hitTest(surfW / 2f, surfH / 2f);
        } catch (Throwable e) {
            return null;
        }
        HitResult planeLoose = null, other = null;
        for (HitResult h : hits) {
            Trackable t = h.getTrackable();
            if (t instanceof Plane) {
                Plane pl = (Plane) t;
                if (pl.getType() != Plane.Type.HORIZONTAL_UPWARD_FACING) continue;
                if (pl.isPoseInPolygon(h.getHitPose())) return h.getHitPose();
                if (planeLoose == null) planeLoose = h;       // like iOS .estimatedPlane
            } else if (t instanceof DepthPoint) {
                if (other == null) other = h;
            } else if (t instanceof Point
                    && ((Point) t).getOrientationMode() == Point.OrientationMode.ESTIMATED_SURFACE_NORMAL) {
                if (other == null) other = h;
            }
        }
        if (other != null) return other.getHitPose();
        if (planeLoose != null) return planeLoose.getHitPose();
        return null;
    }

    private void handleMark(Frame frame) {
        if (done || anchors.size() >= 2) return;
        Pose p = hitAtCenter(frame);
        if (p == null) {
            runOnUiThread(() -> {
                setInfo("Can't see the ground yet. Aim at the grass and move the phone slowly side to side.");
                buzz(30);
            });
            return;
        }
        Anchor a;
        try {
            a = session.createAnchor(p);
        } catch (Throwable e) {
            return;
        }
        anchors.add(a);
        if (anchors.size() == 1) {
            runOnUiThread(() -> {
                buzz(20);
                markButton.setText("Mark hole");
                undoButton.setVisibility(View.VISIBLE);
                setInfo("Now aim the crosshair at the centre of the hole and tap Mark hole.");
            });
        } else {
            final double d = inchesBetween(anchors.get(0).getPose().getTranslation(),
                    anchors.get(1).getPose().getTranslation());
            done = true;
            resultInches = d;
            runOnUiThread(() -> {
                buzz(20);
                distLabel.setText(fmt(d));
                markButton.setVisibility(View.GONE);
                useButton.setText("Use " + fmt(d));
                useButton.setVisibility(View.VISIBLE);
                setInfo("Measured. Tap Use to fill it in, or Undo to mark the hole again.");
            });
        }
    }

    private void undoOnGl() {
        if (anchors.isEmpty()) return;
        Anchor a = anchors.remove(anchors.size() - 1);
        try { a.detach(); } catch (Throwable ignored) { }
        done = false;
        resultInches = -1;
        final boolean none = anchors.isEmpty();
        runOnUiThread(() -> {
            useButton.setVisibility(View.GONE);
            markButton.setVisibility(View.VISIBLE);
            if (none) {
                distLabel.setText("");
                markButton.setText("Mark ball");
                undoButton.setVisibility(View.INVISIBLE);
                setInfo("Point at the ball and tap Mark ball.");
            } else {
                markButton.setText("Mark hole");
                setInfo("Aim the crosshair at the centre of the hole and tap Mark hole.");
            }
        });
    }

    private void updateTrackingInfo(Camera cam, TrackingState ts) {
        if (done) return;
        String msg;
        if (ts == TrackingState.TRACKING) {
            msg = anchors.isEmpty() ? "Point at the ball and tap Mark ball."
                    : "Aim the crosshair at the centre of the hole and tap Mark hole.";
        } else if (ts == TrackingState.PAUSED) {
            TrackingFailureReason r = cam.getTrackingFailureReason();
            if (r == TrackingFailureReason.EXCESSIVE_MOTION) msg = "Slow down a little.";
            else if (r == TrackingFailureReason.INSUFFICIENT_FEATURES) msg = "Not enough detail. Aim at the grass, not the sky.";
            else if (r == TrackingFailureReason.INSUFFICIENT_LIGHT) msg = "Too dark to see the ground.";
            else if (r == TrackingFailureReason.CAMERA_UNAVAILABLE) msg = "The camera is busy in another app.";
            else msg = "Starting up. Move the phone slowly over the ground.";
        } else {
            msg = "AR isn't available right now.";
        }
        if (!msg.equals(lastInfo)) {
            lastInfo = msg;
            final String m = msg;
            runOnUiThread(() -> setInfo(m));
        }
    }

    /** Project the marks (and the live aim point) to screen pixels for the overlay. */
    private void publishScreen(float[] live) {
        if (surfW == 0) return;
        int n = anchors.size();
        float[] pts = new float[n * 2];
        for (int i = 0; i < n; i++) {
            float[] s = project(anchors.get(i).getPose().getTranslation());
            pts[i * 2] = s[0];
            pts[i * 2 + 1] = s[1];
        }
        screenPts = pts;
        livePt = live == null ? null : project(live);
        overlay.postInvalidate();
    }

    private float[] project(float[] w) {
        float[] in = {w[0], w[1], w[2], 1f};
        float[] out = new float[4];
        Matrix.multiplyMV(out, 0, viewProj, 0, in, 0);
        if (out[3] <= 0.0001f) return new float[]{Float.NaN, Float.NaN};
        float x = out[0] / out[3], y = out[1] / out[3];
        return new float[]{(x + 1f) * 0.5f * surfW, (1f - y) * 0.5f * surfH};
    }

    private static double inchesBetween(float[] a, float[] b) {
        double dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
        return Math.sqrt(dx * dx + dy * dy + dz * dz) * M_TO_IN;
    }

    static String fmt(double inches) {
        int total = (int) Math.round(inches);
        return (total / 12) + "′ " + (total % 12) + "″";
    }

    // ── overlay: crosshair, marks, line ────────────────────────────────────────────────

    private class Overlay extends View {
        private final Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);

        Overlay(Context c) {
            super(c);
            ring.setStyle(Paint.Style.STROKE);
            ring.setStrokeWidth(dp(2));
            ring.setColor(Color.WHITE);
            line.setStyle(Paint.Style.STROKE);
            line.setStrokeWidth(dp(3));
            line.setColor(GOLD);
            line.setShadowLayer(dp(2), 0, 0, Color.BLACK);
            setLayerType(LAYER_TYPE_SOFTWARE, null);
        }

        @Override
        protected void onDraw(Canvas c) {
            float cx = getWidth() / 2f, cy = getHeight() / 2f;
            float[] pts = screenPts;
            float[] live = livePt;

            // Line: ball → hole, or ball → where the crosshair is aiming.
            if (pts.length >= 2 && ok(pts[0], pts[1])) {
                float ex = Float.NaN, ey = Float.NaN;
                if (pts.length >= 4) { ex = pts[2]; ey = pts[3]; }
                else if (live != null) { ex = live[0]; ey = live[1]; }
                if (ok(ex, ey)) c.drawLine(pts[0], pts[1], ex, ey, line);
            }
            for (int i = 0; i + 1 < pts.length; i += 2) {
                if (!ok(pts[i], pts[i + 1])) continue;
                fill.setColor(Color.BLACK);
                c.drawCircle(pts[i], pts[i + 1], dp(9), fill);
                fill.setColor(i == 0 ? Color.WHITE : GOLD);
                c.drawCircle(pts[i], pts[i + 1], dp(7), fill);
            }

            // Crosshair (same as iOS: soft ring with a gold dot).
            fill.setColor(Color.argb(20, 255, 255, 255));
            c.drawCircle(cx, cy, dp(18), fill);
            c.drawCircle(cx, cy, dp(18), ring);
            fill.setColor(GOLD);
            c.drawCircle(cx, cy, dp(3), fill);
        }

        private boolean ok(float x, float y) {
            return !Float.isNaN(x) && !Float.isNaN(y) && x > -4000 && x < 8000 && y > -4000 && y < 8000;
        }
    }

    // ── helpers ────────────────────────────────────────────────────────────────────────

    private void setInfo(String s) {
        infoLabel.setText(s);
    }

    private int displayRotation() {
        try {
            return getWindowManager().getDefaultDisplay().getRotation();
        } catch (Throwable e) {
            return Surface.ROTATION_0;
        }
    }

    @SuppressWarnings("deprecation")
    private void buzz(int ms) {
        try {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null) return;
            if (android.os.Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
            else v.vibrate(ms);
        } catch (Throwable ignored) { }
    }

    private Button button(String text, boolean primary) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setTextColor(primary ? NAVY_TEXT : Color.WHITE);
        b.setBackground(rounded(primary ? GOLD : NAVY, 14));
        b.setStateListAnimator(null);
        return b;
    }

    private GradientDrawable rounded(int color, int radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(radiusDp));
        return g;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private static FrameLayout.LayoutParams match() {
        return new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }

    private static LinearLayout.LayoutParams wrapW() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private static int shader(int type, String src) {
        int s = GLES20.glCreateShader(type);
        GLES20.glShaderSource(s, src);
        GLES20.glCompileShader(s);
        return s;
    }

    private static FloatBuffer floatBuf(float[] a) {
        FloatBuffer b = ByteBuffer.allocateDirect(a.length * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
        b.put(a);
        b.position(0);
        return b;
    }
}
