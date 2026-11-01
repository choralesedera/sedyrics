use std::{fs, sync::Mutex};
use serde_json::{json, Value};
use tauri::{Emitter, Manager, State, PhysicalPosition, PhysicalSize};
struct ProjectionState(Mutex<Value>);
fn songs_path() -> std::path::PathBuf {
    let root = dirs::data_local_dir().unwrap_or_else(std::env::temp_dir).join("LyriCSED Projection");
    let _ = fs::create_dir_all(&root);
    root.join("songs.json")
}
#[tauri::command]
fn read_songs() -> Value {
    let path = songs_path();
    let fallback = include_str!("../../songs.json");
    let content = fs::read_to_string(path).unwrap_or_else(|_| fallback.into());
    serde_json::from_str(&content).unwrap_or_else(|_| json!([]))
}
#[tauri::command]
fn save_songs(songs: Value) -> Result<(), String> {
    if !songs.is_array() { return Err("Liste de chants invalide".into()); }
    fs::write(songs_path(), serde_json::to_vec_pretty(&songs).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}
#[tauri::command]
fn choose_media() -> Option<String> {
    rfd::FileDialog::new()
      .add_filter("Image ou vidéo", &["png","jpg","jpeg","webp","gif","mp4","webm"])
      .pick_file().map(|p| p.to_string_lossy().into_owned())
}
#[tauri::command]
fn import_songs() -> Vec<Value> {
    let mut out = vec![];
    if let Some(paths) = rfd::FileDialog::new().add_filter("Chants", &["txt","json"]).pick_files() {
      for path in paths {
        if let Ok(text) = fs::read_to_string(&path) {
          let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
          out.push(json!({"name":name,"text":text}));
        }
      }
    }
    out
}
#[tauri::command]
fn export_songs(songs: Value) -> Result<(), String> {
    if let Some(path) = rfd::FileDialog::new().set_file_name("lyricsed-chants.json").save_file() {
       fs::write(path, serde_json::to_vec_pretty(&songs).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
fn send_state(app: tauri::AppHandle, state: State<'_, ProjectionState>, data: Value) -> Result<(), String> {
    *state.0.lock().map_err(|e|e.to_string())? = data.clone();
    app.emit("projection-state", data).map_err(|e| e.to_string())
}
#[tauri::command]
fn get_state(state: State<'_, ProjectionState>) -> Value {
    state.0.lock().map(|x| x.clone()).unwrap_or_else(|_| json!({}))
}
#[tauri::command]
async fn open_projection(app: tauri::AppHandle) -> Result<usize, String> {
    if let Some(w) = app.get_webview_window("projection") {
        let _=w.show(); let _=w.set_focus();
        return Ok(w.available_monitors().map(|m|m.len()).unwrap_or(1));
    }
    let main = app.get_webview_window("main").ok_or("Fenêtre principale introuvable")?;
    let monitors = main.available_monitors().map_err(|e| e.to_string())?;
    let other = monitors.iter().find(|m| {
      let primary=main.current_monitor().ok().flatten();
      primary.as_ref().map(|p|p.position()!=m.position()).unwrap_or(false)
    }).or_else(||monitors.get(1));
    let w = tauri::WebviewWindowBuilder::new(&app, "projection", tauri::WebviewUrl::App("projection.html".into()))
      .title("LyriCSED Projection - Écran public").inner_size(1000.0,650.0)
      .build().map_err(|e|e.to_string())?;
    if let Some(m) = other {
      w.set_position(tauri::Position::Physical(PhysicalPosition::new(m.position().x,m.position().y))).map_err(|e|e.to_string())?;
      w.set_size(tauri::Size::Physical(PhysicalSize::new(m.size().width,m.size().height))).map_err(|e|e.to_string())?;
      w.set_decorations(false).map_err(|e|e.to_string())?;
    }
    Ok(monitors.len())
}
#[tauri::command]
fn close_projection(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("projection") { let _=w.close(); }
}
fn main() {
    tauri::Builder::default()
      .manage(ProjectionState(Mutex::new(json!({}))))
      .invoke_handler(tauri::generate_handler![read_songs,save_songs,choose_media,import_songs,export_songs,send_state,get_state,open_projection,close_projection])
      .run(tauri::generate_context!()).expect("LyriCSED Projection a échoué");
}
