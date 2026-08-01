package com.tomapp.gastos

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.print.PrintAttributes
import android.print.PrintManager
import android.provider.MediaStore
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.webkit.JavascriptInterface
import android.webkit.JsResult
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebChromeClient.FileChooserParams
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var filePickerCallback: ValueCallback<Array<Uri>>? = null
    private var speechRecognizer: SpeechRecognizer? = null
    private var tts: TextToSpeech? = null
    private var ttsReady = false

    // El permiso de micrófono se pide la primera vez que la web intenta
    // escuchar, no al abrir la app.
    private val micPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) beginListening()
        else jsVoice("onError", "Necesito permiso para usar el micrófono.")
    }

    // Debe registrarse como propiedad de la clase (antes de onCreate) para
    // cumplir con el ciclo de vida que exige ActivityResultRegistry.
    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val data = result.data
        val uris = if (result.resultCode == Activity.RESULT_OK && data?.data != null) {
            arrayOf(data.data!!)
        } else null
        filePickerCallback?.onReceiveValue(uris)
        filePickerCallback = null
    }

    // Puente JS <-> nativo: la web no puede descargar archivos ni imprimir
    // por sí sola dentro del WebView, así que expone estas dos operaciones.
    inner class AndroidBridge {
        @JavascriptInterface
        fun saveFile(filename: String, content: String, mime: String) {
            runOnUiThread {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        val values = ContentValues().apply {
                            put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                            put(MediaStore.MediaColumns.MIME_TYPE, mime)
                            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                        }
                        val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                            ?: throw Exception("No se pudo crear el archivo")
                        contentResolver.openOutputStream(uri)?.use { it.write(content.toByteArray()) }
                        Toast.makeText(this@MainActivity, "Guardado en Descargas: $filename", Toast.LENGTH_LONG).show()
                    } else {
                        val file = File(getExternalFilesDir(null), filename)
                        FileOutputStream(file).use { it.write(content.toByteArray()) }
                        Toast.makeText(this@MainActivity, "Guardado en: ${file.absolutePath}", Toast.LENGTH_LONG).show()
                    }
                } catch (e: Exception) {
                    Toast.makeText(this@MainActivity, "Error al guardar el archivo: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }

        @JavascriptInterface
        fun printPage() {
            runOnUiThread {
                try {
                    val printManager = getSystemService(Context.PRINT_SERVICE) as PrintManager
                    val adapter = webView.createPrintDocumentAdapter("TOM_reporte")
                    printManager.print("TOM_reporte", adapter, PrintAttributes.Builder().build())
                } catch (e: Exception) {
                    Toast.makeText(this@MainActivity, "No se pudo abrir la impresión: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }

        // --- Voz ---
        // El WebView de Android NO expone la Web Speech API (a diferencia de
        // Chrome), así que el reconocimiento se hace con el SpeechRecognizer
        // nativo y el resultado se devuelve a la web por evaluateJavascript.
        @JavascriptInterface
        fun startListening() {
            runOnUiThread {
                if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.RECORD_AUDIO)
                    == PackageManager.PERMISSION_GRANTED) {
                    beginListening()
                } else {
                    micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                }
            }
        }

        @JavascriptInterface
        fun stopListening() {
            runOnUiThread {
                try { speechRecognizer?.stopListening() } catch (e: Exception) { }
            }
        }

        @JavascriptInterface
        fun speak(text: String) {
            runOnUiThread {
                if (ttsReady) {
                    try { tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "tom-voice") } catch (e: Exception) { }
                }
            }
        }

        @JavascriptInterface
        fun voiceAvailable(): Boolean = SpeechRecognizer.isRecognitionAvailable(this@MainActivity)
    }

    // Envía un evento de voz a la web. JSONObject.quote escapa comillas y
    // saltos de línea para que el texto reconocido nunca rompa el JS.
    private fun jsVoice(fn: String, arg: String?) {
        val payload = if (arg == null) "" else JSONObject.quote(arg)
        webView.post {
            webView.evaluateJavascript(
                "window.__voiceNative && window.__voiceNative.$fn($payload)", null
            )
        }
    }

    private fun beginListening() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            jsVoice("onError", "Este dispositivo no tiene reconocimiento de voz instalado.")
            return
        }
        try {
            if (speechRecognizer == null) {
                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this).apply {
                    setRecognitionListener(object : RecognitionListener {
                        override fun onReadyForSpeech(params: Bundle?) {}
                        override fun onBeginningOfSpeech() {}
                        override fun onRmsChanged(rmsdB: Float) {}
                        override fun onBufferReceived(buffer: ByteArray?) {}
                        override fun onEndOfSpeech() {}
                        override fun onEvent(eventType: Int, params: Bundle?) {}

                        override fun onPartialResults(partialResults: Bundle?) {
                            val text = partialResults
                                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                                ?.firstOrNull()
                            if (!text.isNullOrEmpty()) jsVoice("onPartial", text)
                        }

                        override fun onResults(results: Bundle?) {
                            val text = results
                                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                                ?.firstOrNull()
                            if (!text.isNullOrEmpty()) jsVoice("onResult", text)
                            else jsVoice("onEnd", null)
                        }

                        override fun onError(error: Int) {
                            jsVoice("onError", speechErrorText(error))
                        }
                    })
                }
            }
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-CO")
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            }
            speechRecognizer?.startListening(intent)
        } catch (e: Exception) {
            jsVoice("onError", "No se pudo abrir el micrófono.")
        }
    }

    private fun speechErrorText(error: Int): String = when (error) {
        SpeechRecognizer.ERROR_NO_MATCH,
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No escuché nada. Toca el micrófono para intentar de nuevo."
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Necesito permiso para usar el micrófono."
        SpeechRecognizer.ERROR_NETWORK,
        SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "El reconocimiento de voz necesita conexión a internet."
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Un momento, todavía estoy procesando lo anterior."
        else -> "No pude escuchar bien. Intenta otra vez."
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            allowFileAccess = true
        }
        webView.addJavascriptInterface(AndroidBridge(), "Android")

        // Voz hablada (opcional, la web decide si la usa).
        tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                try {
                    // setLanguage devuelve int, así que se llama como método
                    // (Kotlin no lo expone como propiedad asignable).
                    tts?.setLanguage(Locale("es", "CO"))
                    ttsReady = true
                } catch (e: Exception) {
                    ttsReady = false
                }
            }
        }

        webView.webViewClient = WebViewClient()
        webView.webChromeClient = object : WebChromeClient() {
            override fun onJsAlert(view: WebView?, url: String?, message: String?, result: JsResult?): Boolean {
                AlertDialog.Builder(this@MainActivity)
                    .setMessage(message)
                    .setPositiveButton("OK") { _, _ -> result?.confirm() }
                    .setOnCancelListener { result?.cancel() }
                    .show()
                return true
            }

            override fun onJsConfirm(view: WebView?, url: String?, message: String?, result: JsResult?): Boolean {
                AlertDialog.Builder(this@MainActivity)
                    .setMessage(message)
                    .setPositiveButton("Aceptar") { _, _ -> result?.confirm() }
                    .setNegativeButton("Cancelar") { _, _ -> result?.cancel() }
                    .setOnCancelListener { result?.cancel() }
                    .show()
                return true
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                filePickerCallback = filePathCallback
                return try {
                    filePickerLauncher.launch(fileChooserParams?.createIntent())
                    true
                } catch (e: Exception) {
                    filePickerCallback = null
                    false
                }
            }

            // Si en el futuro la web pide el micrófono directamente, se
            // concede solo cuando la app ya tiene el permiso del sistema.
            override fun onPermissionRequest(request: PermissionRequest?) {
                runOnUiThread {
                    val wantsAudio = request?.resources?.any {
                        it == PermissionRequest.RESOURCE_AUDIO_CAPTURE
                    } == true
                    val granted = ContextCompat.checkSelfPermission(
                        this@MainActivity, Manifest.permission.RECORD_AUDIO
                    ) == PackageManager.PERMISSION_GRANTED
                    if (wantsAudio && granted) {
                        request?.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                    } else {
                        request?.deny()
                    }
                }
            }
        }
        webView.loadUrl("file:///android_asset/www/index.html")
    }

    override fun onDestroy() {
        try { speechRecognizer?.destroy() } catch (e: Exception) { }
        speechRecognizer = null
        try { tts?.stop(); tts?.shutdown() } catch (e: Exception) { }
        tts = null
        super.onDestroy()
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            AlertDialog.Builder(this)
                .setTitle("Salir de TOM")
                .setMessage("¿Seguro que quieres salir de la app?")
                .setPositiveButton("Sí") { _, _ -> super.onBackPressed() }
                .setNegativeButton("Cancelar", null)
                .show()
        }
    }
}
