#![cfg(windows)]

use std::sync::mpsc;
use std::time::Instant;
use tauri::WebviewWindow;
use webview2_com::{
    Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Environment6, ICoreWebView2_16, COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE,
        COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
    },
    PrintToPdfStreamCompletedHandler,
};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfPrintSettings {
    page_size: String,
    orientation: String,
}
use windows::{
    core::Interface,
    Win32::System::Com::{IStream, STREAM_SEEK_SET},
};

fn log_pdf(started: Instant, message: impl AsRef<str>) {
    eprintln!(
        "[PDF][{:>6}ms] {}",
        started.elapsed().as_millis(),
        message.as_ref()
    );
}

pub async fn print_webview_to_pdf(
    window: WebviewWindow,
    print_settings: PdfPrintSettings,
) -> Result<Vec<u8>, String> {
    let started = Instant::now();
    let (sender, receiver) = mpsc::channel::<Result<Vec<u8>, String>>();
    log_pdf(started, "entered Rust command");
    window
        .with_webview(move |webview| {
            log_pdf(started, "entered with_webview");
            let result = (|| unsafe {
                let controller = webview.controller();
                let core = controller
                    .CoreWebView2()
                    .map_err(|error| error.to_string())?;
                log_pdf(started, "WebView2 acquired");
                let printable = core
                    .cast::<ICoreWebView2_16>()
                    .map_err(|error| format!("WebView2 no admite PrintToPdfStream: {error}"))?;
                let environment = webview
                    .environment()
                    .cast::<ICoreWebView2Environment6>()
                    .map_err(|error| format!("WebView2 no admite ajustes de impresión: {error}"))?;
                let settings = environment.CreatePrintSettings().map_err(|error| {
                    format!("No se pudieron crear los ajustes de impresión: {error}")
                })?;
                let landscape = print_settings.orientation == "landscape";
                let (portrait_width, portrait_height) = match print_settings.page_size.as_str() {
                    "a3" => (11.69, 16.54),
                    "a4" => (8.27, 11.69),
                    "letter" => (8.5, 11.0),
                    other => return Err(format!("Tamaño de papel no válido: {other}")),
                };
                let (page_width, page_height) = if landscape {
                    (portrait_height, portrait_width)
                } else {
                    (portrait_width, portrait_height)
                };
                settings
                    .SetOrientation(if landscape {
                        COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE
                    } else {
                        COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT
                    })
                    .map_err(|error| {
                        format!("No se pudo configurar orientación de impresión: {error}")
                    })?;
                settings
                    .SetPageWidth(page_width)
                    .map_err(|error| format!("No se pudo configurar ancho de página: {error}"))?;
                settings
                    .SetPageHeight(page_height)
                    .map_err(|error| format!("No se pudo configurar alto de página: {error}"))?;
                settings
                    .SetShouldPrintBackgrounds(true)
                    .map_err(|error| format!("No se pudieron activar fondos: {error}"))?;
                settings
                    .SetShouldPrintHeaderAndFooter(false)
                    .map_err(|error| format!("No se pudieron desactivar cabeceras: {error}"))?;

                let callback_sender = sender.clone();
                let callback = PrintToPdfStreamCompletedHandler::create(Box::new(
                    move |error, stream: Option<IStream>| {
                        log_pdf(started, "callback received");
                        let result = match (error, stream) {
                            (Ok(()), Some(stream)) => {
                                log_pdf(started, "stream read started");
                                let result = read_stream(stream);
                                if let Ok(bytes) = &result {
                                    log_pdf(
                                        started,
                                        format!("stream read finished: {} bytes", bytes.len()),
                                    );
                                }
                                result
                            }
                            (Ok(()), None) => {
                                Err("WebView2 devolvió un stream PDF vacío.".to_owned())
                            }
                            (Err(error), _) => {
                                log_pdf(started, format!("callback error: {error:?}"));
                                Err(format!("WebView2 no pudo generar el PDF: {error:?}"))
                            }
                        };
                        callback_sender
                            .send(result)
                            .map_err(|_| windows::core::Error::from_win32())
                    },
                ));
                log_pdf(started, "PrintToPdfStream called");
                printable
                    .PrintToPdfStream(&settings, &callback)
                    .map_err(|error| format!("No se pudo iniciar PrintToPdfStream: {error}"))?;
                Ok::<(), String>(())
            })();
            if let Err(error) = result {
                log_pdf(started, format!("with_webview error: {error}"));
                let _ = sender.send(Err(error));
            }
        })
        .map_err(|error| format!("No se pudo acceder al WebView2 de impresión: {error}"))?;

    let result = tauri::async_runtime::spawn_blocking(move || {
        receiver
            .recv()
            .map_err(|_| "El proceso de impresión terminó sin respuesta.".to_owned())?
    })
    .await
    .map_err(|error| format!("Falló la tarea de espera de impresión: {error}"))??;
    log_pdf(started, "Rust command returning");
    Ok(result)
}

unsafe fn read_stream(stream: IStream) -> Result<Vec<u8>, String> {
    stream
        .Seek(0, STREAM_SEEK_SET, None)
        .map_err(|error| format!("No se pudo reposicionar el stream PDF: {error}"))?;
    let mut bytes = Vec::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let mut read = 0_u32;
        stream
            .Read(
                buffer.as_mut_ptr().cast(),
                buffer.len() as u32,
                Some(&mut read),
            )
            .ok()
            .map_err(|error| format!("No se pudo leer el stream PDF: {error}"))?;
        if read == 0 {
            break;
        }
        bytes.extend_from_slice(&buffer[..read as usize]);
    }
    if bytes.starts_with(b"%PDF-") {
        Ok(bytes)
    } else {
        Err("WebView2 devolvió datos que no son un PDF válido.".to_owned())
    }
}
