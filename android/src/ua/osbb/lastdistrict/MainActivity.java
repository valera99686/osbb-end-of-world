package ua.osbb.lastdistrict;

import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.graphics.Color;
import android.graphics.Insets;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.widget.FrameLayout;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;

/** Bundled offline game. No network permission, analytics, or JavaScript bridge. */
public final class MainActivity extends Activity {
  private static final String HOST = "appassets.androidplatform.net";
  private WebView game;
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    FrameLayout root = new FrameLayout(this);
    root.setBackgroundColor(Color.rgb(12,20,26));
    if (Build.VERSION.SDK_INT >= 30) {
      getWindow().setDecorFitsSystemWindows(false);
      root.setOnApplyWindowInsetsListener((view,insets) -> {
        Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
        view.setPadding(i.left,i.top,i.right,i.bottom);
        return insets;
      });
    }
    game = new WebView(this);
    game.setBackgroundColor(Color.rgb(12,20,26));
    game.getSettings().setJavaScriptEnabled(true);
    game.getSettings().setDomStorageEnabled(true);
    game.getSettings().setAllowFileAccess(false);
    game.getSettings().setAllowContentAccess(false);
    game.getSettings().setMediaPlaybackRequiresUserGesture(true);
    game.getSettings().setUserAgentString(game.getSettings().getUserAgentString() + " OSBBAndroid/0.1");
    game.setOverScrollMode(View.OVER_SCROLL_NEVER);
    game.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        return !"https".equals(request.getUrl().getScheme()) || !HOST.equals(request.getUrl().getHost());
      }
      @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        if (!"https".equals(request.getUrl().getScheme()) || !HOST.equals(request.getUrl().getHost())) return missing();
        String path = request.getUrl().getPath();
        if (path == null || path.equals("/")) path = "/index.html";
        if (path.contains("..") || path.contains("\\") || !path.startsWith("/") || path.startsWith("/downloads/")) return missing();
        try {
          InputStream stream = getAssets().open("game" + path);
          String lower = path.toLowerCase(Locale.ROOT);
          String mime = lower.endsWith(".html")?"text/html":lower.endsWith(".js")?"text/javascript":lower.endsWith(".css")?"text/css":lower.endsWith(".json")||lower.endsWith(".webmanifest")?"application/json":lower.endsWith(".svg")?"image/svg+xml":lower.endsWith(".png")?"image/png":lower.endsWith(".webp")?"image/webp":lower.endsWith(".woff2")?"font/woff2":"application/octet-stream";
          HashMap<String,String> headers = new HashMap<>();
          headers.put("X-Content-Type-Options","nosniff");
          headers.put("Cache-Control","no-cache");
          return new WebResourceResponse(mime,"UTF-8",200,"OK",headers,stream);
        } catch (Exception ignored) { return missing(); }
      }
    });
    root.addView(game,new FrameLayout.LayoutParams(-1,-1));
    setContentView(root);
    if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, () -> handleBack());
    if (state != null) game.restoreState(state); else game.loadUrl("https://" + HOST + "/index.html");
  }
  private WebResourceResponse missing() { return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",null,new ByteArrayInputStream(new byte[0])); }
  @Override protected void onSaveInstanceState(Bundle state) { if(game!=null)game.saveState(state);super.onSaveInstanceState(state); }
  @Override protected void onPause() { if(game!=null){game.evaluateJavascript("document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('blur'));",null);game.onPause();game.pauseTimers();}super.onPause(); }
  @Override protected void onResume() { super.onResume();if(game!=null){game.onResume();game.resumeTimers();} }
  private void handleBack() { if(game!=null)game.evaluateJavascript("document.dispatchEvent(new CustomEvent('osbb-back',{cancelable:true}))",value -> { if("true".equals(value)) finish(); }); }
  @Override public void onBackPressed() { handleBack(); }
  @Override protected void onDestroy() { if(game!=null){game.destroy();game=null;}super.onDestroy(); }
}
