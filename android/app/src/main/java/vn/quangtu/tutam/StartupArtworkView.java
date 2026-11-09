package vn.quangtu.tutam;

/** Shared native startup identity; all artwork is bundled for offline use. */
public final class StartupArtworkView {
    public static final String EXTRA_INDEX = "tutam.startupArtworkIndex";
    public static final String[] NAMES = {"lotus-dawn", "temple-mist", "bamboo-path", "bodhi-leaves", "stupa-moon", "incense-lotus", "rosary-stillness", "lotus-lanterns", "zen-garden", "pagoda-hills"};
    private final android.content.Context context;
    private StartupArtworkView(android.content.Context context) { this.context = context; }
    public static int nextIndex(android.content.Context context) {
        android.content.SharedPreferences preferences = context.getSharedPreferences("startup-artwork", android.content.Context.MODE_PRIVATE);
        int index = Math.floorMod(preferences.getInt("last-index", -1) + 1, NAMES.length);
        preferences.edit().putInt("last-index", index).apply();
        return index;
    }
    public static android.widget.FrameLayout create(android.content.Context context, int index) {
        return new StartupArtworkView(context).createView(Math.floorMod(index, NAMES.length));
    }
    private int dp(int value) { return Math.round(value * context.getResources().getDisplayMetrics().density); }
    private android.graphics.drawable.Drawable asset(String path) {
        try (java.io.InputStream stream = context.getAssets().open("public/" + path)) {
            return android.graphics.drawable.Drawable.createFromStream(stream, path);
        } catch (Exception ignored) { return null; }
    }
    private android.widget.FrameLayout createView(int index) {
        android.widget.FrameLayout screen = new android.widget.FrameLayout(context);
        screen.setBackgroundColor(android.graphics.Color.rgb(255, 250, 242));
        screen.setClickable(true);
        android.widget.ImageView background = new android.widget.ImageView(context);
        background.setScaleType(android.widget.ImageView.ScaleType.CENTER_CROP);
        background.setImageDrawable(asset("images/calendar/" + NAMES[index] + ".webp"));
        screen.addView(background, new android.widget.FrameLayout.LayoutParams(-1, -1));

        android.widget.LinearLayout card = new android.widget.LinearLayout(context);
        card.setOrientation(android.widget.LinearLayout.VERTICAL);
        card.setGravity(android.view.Gravity.CENTER);
        card.setPadding(dp(24), dp(28), dp(24), dp(28));
        android.graphics.drawable.GradientDrawable glass = new android.graphics.drawable.GradientDrawable();
        glass.setColor(android.graphics.Color.argb(232, 255, 250, 242));
        glass.setCornerRadius(dp(28));
        glass.setStroke(dp(1), android.graphics.Color.argb(190, 255, 255, 255));
        card.setBackground(glass);
        card.setElevation(dp(8));
        android.widget.ImageView logo = new android.widget.ImageView(context);
        logo.setScaleType(android.widget.ImageView.ScaleType.FIT_CENTER);
        logo.setImageDrawable(asset("assets/branding/lotus-mark.png"));
        logo.setContentDescription("Tu tập Phật pháp");
        boolean landscape = context.getResources().getConfiguration().orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE;
        int logoSize = dp(landscape ? 84 : 116);
        card.addView(logo, new android.widget.LinearLayout.LayoutParams(logoSize, logoSize));
        android.widget.TextView title = new android.widget.TextView(context);
        title.setText("Tu tập Phật pháp");
        title.setTextSize(landscape ? 24 : 26);
        title.setGravity(android.view.Gravity.CENTER);
        title.setTypeface(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD);
        title.setTextColor(android.graphics.Color.rgb(40, 89, 79));
        android.widget.LinearLayout.LayoutParams titleParams = new android.widget.LinearLayout.LayoutParams(-2, -2);
        titleParams.topMargin = dp(18);
        card.addView(title, titleParams);
        android.widget.TextView tagline = new android.widget.TextView(context);
        tagline.setText("Học lời Phật dạy · Thực hành mỗi ngày");
        tagline.setTextSize(13);
        tagline.setGravity(android.view.Gravity.CENTER);
        tagline.setTextColor(android.graphics.Color.rgb(99, 113, 94));
        android.widget.LinearLayout.LayoutParams taglineParams = new android.widget.LinearLayout.LayoutParams(-1, -2);
        taglineParams.topMargin = dp(10);
        card.addView(tagline, taglineParams);
        int width = Math.min(dp(340), context.getResources().getDisplayMetrics().widthPixels - dp(40));
        android.widget.FrameLayout.LayoutParams cardParams = new android.widget.FrameLayout.LayoutParams(width, -2, android.view.Gravity.CENTER);
        screen.addView(card, cardParams);
        screen.addOnLayoutChangeListener((view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> view.post(() -> {
            if (card.getWidth() > 0 && card.getHeight() > 0) {
                float scale = Math.min(1f, Math.min((view.getWidth() - dp(24)) / (float) card.getWidth(),
                    (view.getHeight() - dp(24)) / (float) card.getHeight()));
                card.setScaleX(Math.max(.1f, scale));
                card.setScaleY(Math.max(.1f, scale));
            }
        }));
        return screen;
    }
}
