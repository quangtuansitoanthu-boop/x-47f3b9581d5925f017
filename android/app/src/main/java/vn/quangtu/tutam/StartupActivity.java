package vn.quangtu.tutam;

/** Paint the selected photo before the WebView and login SDKs start initializing. */
public class StartupActivity extends androidx.appcompat.app.AppCompatActivity {
    private static java.lang.ref.WeakReference<StartupActivity> current = new java.lang.ref.WeakReference<>(null);
    public static void finishBehindMain() {
        StartupActivity activity = current.get();
        if (activity != null && !activity.isFinishing()) {
            activity.finish();
            activity.overridePendingTransition(0, 0);
        }
    }
    private final android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());
    private boolean started;
    private int artworkIndex;

    @Override
    protected void onCreate(android.os.Bundle savedInstanceState) {
        androidx.activity.EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        current = new java.lang.ref.WeakReference<>(this);
        int index = savedInstanceState != null && savedInstanceState.containsKey(StartupArtworkView.EXTRA_INDEX)
            ? savedInstanceState.getInt(StartupArtworkView.EXTRA_INDEX) : StartupArtworkView.nextIndex(this);
        artworkIndex = index;
        android.widget.FrameLayout artwork = StartupArtworkView.create(this, index);
        setContentView(artwork);
        artwork.getViewTreeObserver().addOnPreDrawListener(new android.view.ViewTreeObserver.OnPreDrawListener() {
            @Override public boolean onPreDraw() {
                artwork.getViewTreeObserver().removeOnPreDrawListener(this);
                artwork.postOnAnimation(() -> handler.postDelayed(() -> {
                    if (started || isFinishing() || isDestroyed()) return;
                    started = true;
                    android.content.Intent main = new android.content.Intent(StartupActivity.this, MainActivity.class);
                    main.putExtra(StartupArtworkView.EXTRA_INDEX, index);
                    main.addFlags(android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP | android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP | android.content.Intent.FLAG_ACTIVITY_NO_ANIMATION);
                    startActivity(main);
                    overridePendingTransition(0, 0);
                }, 100));
                return true;
            }
        });
    }

    @Override protected void onSaveInstanceState(android.os.Bundle state) {
        state.putInt(StartupArtworkView.EXTRA_INDEX, artworkIndex);
        super.onSaveInstanceState(state);
    }

    @Override protected void onDestroy() {
        if (current.get() == this) current.clear();
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}
