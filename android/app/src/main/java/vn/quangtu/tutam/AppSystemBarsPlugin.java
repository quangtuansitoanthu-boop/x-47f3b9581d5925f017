package vn.quangtu.tutam;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppSystemBars")
public class AppSystemBarsPlugin extends Plugin {
    @PluginMethod
    public void setFullscreen(PluginCall call) {
        final boolean enabled = call.getBoolean("enabled", false);
        getActivity().runOnUiThread(() -> {
            try {
                android.view.Window window = getActivity().getWindow();
                WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
                // Giữ owner inset của MainActivity; chỉ ẩn/hiện thanh trạng thái.
                if (enabled) controller.hide(WindowInsetsCompat.Type.statusBars());
                else controller.show(WindowInsetsCompat.Type.statusBars());
                call.resolve();
            } catch (RuntimeException error) {
                call.reject("Unable to update fullscreen status", error);
            }
        });
    }

    @PluginMethod
    public void setStyle(PluginCall call) {
        final boolean dark = call.getBoolean("dark", false);
        final String backgroundColor = call.getString("backgroundColor");
        final int background;
        try {
            background = Color.parseColor(backgroundColor);
        } catch (IllegalArgumentException | NullPointerException error) {
            call.reject("Invalid system bar background color");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                android.view.Window window = getActivity().getWindow();
                SystemBarStyle style = dark ? SystemBarStyle.dark(background) : SystemBarStyle.light(background, background);
                EdgeToEdge.enable(getActivity(), style, style);
                WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
                controller.setAppearanceLightStatusBars(!dark);
                controller.setAppearanceLightNavigationBars(!dark);
                // Nền cửa sổ hiện dưới thanh trong suốt; không đổi màu thanh bằng API cũ.
                window.setBackgroundDrawable(new ColorDrawable(background));
                call.resolve();
            } catch (RuntimeException error) {
                call.reject("Unable to update system bar appearance", error);
            }
        });
    }
}
