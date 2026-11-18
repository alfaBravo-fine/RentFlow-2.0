use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_store::StoreExt;

// Native Desktop OAuth Credentials (strictly scoped to Rust backend)
const CLIENT_ID: &str = "509114057579-hujt8mv20tj4vbul7f9ae4ua73j87eeq.apps.googleusercontent.com";
const CLIENT_SECRET: &str = "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";

const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const TOKEN_STORE_FILENAME: &str = "oauth_tokens.json";
const SESSION_STORE_KEY: &str = "google_oauth_session";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuthResponse {
    pub id: String,
    pub email: String,
    pub name: String,
    pub picture: Option<String>,
}

pub type UserProfile = AuthResponse;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct PersistedSession {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub user_profile: AuthResponse,
    pub drive_file_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GoogleTokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GoogleApiErrorBody {
    pub error: Option<String>,
    pub error_description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GoogleUserInfoResponse {
    pub sub: String,
    pub email: String,
    pub name: Option<String>,
    pub picture: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GoogleRefreshResponse {
    pub access_token: String,
}

// In-memory token store - RAW TOKENS NEVER EXPOSED TO REACT FRONTEND
pub struct AuthState {
    pub access_token: Mutex<Option<String>>,
    pub refresh_token: Mutex<Option<String>>,
    pub user_profile: Mutex<Option<AuthResponse>>,
    pub drive_file_id: Mutex<Option<String>>,
    pub store_dir: Mutex<Option<PathBuf>>,
}

impl Default for AuthState {
    fn default() -> Self {
        Self {
            access_token: Mutex::new(None),
            refresh_token: Mutex::new(None),
            user_profile: Mutex::new(None),
            drive_file_id: Mutex::new(None),
            store_dir: Mutex::new(None),
        }
    }
}

fn save_persisted_session(app: &AppHandle, state: &AuthState) -> Result<(), String> {
    let profile = state
        .user_profile
        .lock()
        .map_err(|e| format!("Failed to lock user_profile: {}", e))?
        .clone();
    let access_token = state
        .access_token
        .lock()
        .map_err(|e| format!("Failed to lock access_token: {}", e))?
        .clone();
    let refresh_token = state
        .refresh_token
        .lock()
        .map_err(|e| format!("Failed to lock refresh_token: {}", e))?
        .clone();
    let drive_file_id = state
        .drive_file_id
        .lock()
        .map_err(|e| format!("Failed to lock drive_file_id: {}", e))?
        .clone();

    let store = app
        .store(TOKEN_STORE_FILENAME)
        .map_err(|e| format!("Failed to open OAuth token store: {}", e))?;

    let (Some(user_profile), Some(access_token)) = (profile, access_token) else {
        store.delete(SESSION_STORE_KEY);
        store
            .save()
            .map_err(|e| format!("Failed to persist cleared OAuth store: {}", e))?;
        return Ok(());
    };

    let session = PersistedSession {
        access_token,
        refresh_token,
        user_profile,
        drive_file_id,
    };

    let json_val = serde_json::to_value(&session)
        .map_err(|e| format!("Failed to serialize OAuth session: {}", e))?;
    store.set(SESSION_STORE_KEY, json_val);
    store
        .save()
        .map_err(|e| format!("Failed to save OAuth tokens to store: {}", e))?;

    Ok(())
}

pub fn hydrate_auth_state(app: &AppHandle, state: &AuthState) {
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        if let Ok(mut dir_guard) = state.store_dir.lock() {
            *dir_guard = Some(app_data_dir);
        }
    }

    let Ok(store) = app.store(TOKEN_STORE_FILENAME) else {
        return;
    };

    let Some(val) = store.get(SESSION_STORE_KEY) else {
        return;
    };

    if let Ok(session) = serde_json::from_value::<PersistedSession>(val) {
        if let Ok(mut guard) = state.access_token.lock() {
            *guard = Some(session.access_token);
        }
        if let Ok(mut guard) = state.refresh_token.lock() {
            *guard = session.refresh_token;
        }
        if let Ok(mut guard) = state.user_profile.lock() {
            *guard = Some(session.user_profile);
        }
        if let Ok(mut guard) = state.drive_file_id.lock() {
            *guard = session.drive_file_id;
        }
    }
}

pub fn clear_auth_state_and_store(app: Option<&AppHandle>, state: &AuthState) {
    if let Ok(mut guard) = state.access_token.lock() {
        *guard = None;
    }
    if let Ok(mut guard) = state.refresh_token.lock() {
        *guard = None;
    }
    if let Ok(mut guard) = state.user_profile.lock() {
        *guard = None;
    }
    if let Ok(mut guard) = state.drive_file_id.lock() {
        *guard = None;
    }

    if let Some(app_handle) = app {
        if let Ok(store) = app_handle.store(TOKEN_STORE_FILENAME) {
            store.delete(SESSION_STORE_KEY);
            let _ = store.save();
        }
        if let Ok(dir) = app_handle.path().app_data_dir() {
            let _ = fs::remove_file(dir.join(TOKEN_STORE_FILENAME));
            let _ = fs::remove_file(dir.join("oauth_stronghold.bin"));
            let _ = fs::remove_file(dir.join("stronghold.hold"));
        }
    } else if let Ok(guard) = state.store_dir.lock() {
        if let Some(dir) = guard.as_ref() {
            let _ = fs::remove_file(dir.join(TOKEN_STORE_FILENAME));
            let _ = fs::remove_file(dir.join("oauth_stronghold.bin"));
            let _ = fs::remove_file(dir.join("stronghold.hold"));
        }
    }
}

pub async fn refresh_google_access_token(
    app: Option<&AppHandle>,
    state: &AuthState,
) -> Result<String, String> {
    let refresh_token = state
        .refresh_token
        .lock()
        .map_err(|e| format!("Failed to lock refresh_token: {}", e))?
        .clone()
        .ok_or_else(|| "Session expired. Please sign in with Google again.".to_string())?;

    let http_client = reqwest::Client::new();
    let res = http_client
        .post(GOOGLE_TOKEN_URL)
        .form(&[
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
            ("refresh_token", refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| format!("Network error refreshing Google token: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_body = res.text().await.unwrap_or_default();
        return Err(format!(
            "Failed to refresh Google session ({}): {}",
            status, err_body
        ));
    }

    let data: GoogleRefreshResponse = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

    {
        let mut guard = state
            .access_token
            .lock()
            .map_err(|e| format!("Failed to lock access_token: {}", e))?;
        *guard = Some(data.access_token.clone());
    }

    if let Some(app_handle) = app {
        let _ = save_persisted_session(app_handle, state);
    }

    Ok(data.access_token)
}

pub async fn get_valid_access_token(
    app: Option<&AppHandle>,
    state: &AuthState,
) -> Result<String, String> {
    let existing = state
        .access_token
        .lock()
        .map_err(|e| format!("Failed to lock access_token: {}", e))?
        .clone();

    if let Some(token) = existing {
        if !token.is_empty() {
            return Ok(token);
        }
    }

    refresh_google_access_token(app, state).await
}

fn generate_pkce_pair() -> (String, String) {
    let mut verifier_bytes = [0u8; 48];
    rand::thread_rng().fill_bytes(&mut verifier_bytes);
    let verifier = URL_SAFE_NO_PAD.encode(verifier_bytes);

    let digest = Sha256::digest(verifier.as_bytes());
    let challenge = URL_SAFE_NO_PAD.encode(digest);
    (verifier, challenge)
}

fn generate_csrf_state() -> String {
    let mut state_bytes = [0u8; 24];
    rand::thread_rng().fill_bytes(&mut state_bytes);
    URL_SAFE_NO_PAD.encode(state_bytes)
}

/// Pure loopback callback parser — never touches UI threads or Tauri windows directly.
fn google_callback(
    url: String,
    tx_arc: &Arc<Mutex<Option<tokio::sync::oneshot::Sender<Result<String, String>>>>>,
) {
    let result = match reqwest::Url::parse(&url) {
        Ok(parsed_url) => {
            let mut auth_code: Option<String> = None;
            let mut oauth_error: Option<String> = None;
            let mut oauth_error_desc: Option<String> = None;

            for (k, v) in parsed_url.query_pairs() {
                if k == "code" {
                    auth_code = Some(v.to_string());
                } else if k == "error" {
                    oauth_error = Some(v.to_string());
                } else if k == "error_description" {
                    oauth_error_desc = Some(v.to_string());
                }
            }

            if let Some(err) = oauth_error {
                let detail = oauth_error_desc.unwrap_or(err);
                Err(format!("Google sign-in denied: {}", detail))
            } else if let Some(code) = auth_code {
                Ok(code)
            } else {
                Err("No authorization code returned from Google callback.".to_string())
            }
        }
        Err(e) => Err(format!("Failed to parse OAuth callback URL: {}", e)),
    };

    if let Ok(mut guard) = tx_arc.lock() {
        if let Some(sender) = guard.take() {
            let _ = sender.send(result);
        }
    }
}

#[tauri::command]
pub async fn google_login(
    app: AppHandle,
    state: State<'_, AuthState>,
) -> Result<AuthResponse, String> {
    if let Ok(dir) = app.path().app_data_dir() {
        if let Ok(mut dir_guard) = state.store_dir.lock() {
            *dir_guard = Some(dir);
        }
    }

    let (port_tx, port_rx) = tokio::sync::oneshot::channel::<Result<u16, String>>();
    let (code_tx, code_rx) = tokio::sync::oneshot::channel::<Result<String, String>>();
    let code_tx_arc = Arc::new(Mutex::new(Some(code_tx)));

    // 1. Spawn the OAuth loopback server in a separate Tokio task to avoid blocking Tauri's main event loop
    let callback_tx_arc = Arc::clone(&code_tx_arc);
    tokio::spawn(async move {
        let start_result = tauri_plugin_oauth::start(move |url| {
            google_callback(url, &callback_tx_arc);
        })
        .map_err(|e| format!("Failed to start local OAuth loopback server: {}", e));

        let _ = port_tx.send(start_result);
    });

    let port = port_rx
        .await
        .map_err(|_| "OAuth loopback server task terminated unexpectedly.".to_string())??;

    let redirect_uri = format!("http://127.0.0.1:{}/callback", port);

    // 2. Build Google OAuth authorization URL with PKCE
    let (code_verifier, code_challenge) = generate_pkce_pair();
    let csrf_state = generate_csrf_state();

    let authorize_url = reqwest::Url::parse_with_params(
        GOOGLE_AUTH_URL,
        &[
            ("client_id", CLIENT_ID),
            ("redirect_uri", redirect_uri.as_str()),
            ("response_type", "code"),
            (
                "scope",
                "openid email profile https://www.googleapis.com/auth/drive.appdata",
            ),
            ("code_challenge", code_challenge.as_str()),
            ("code_challenge_method", "S256"),
            ("access_type", "offline"),
            ("prompt", "consent"),
            ("state", csrf_state.as_str()),
        ],
    )
    .map_err(|e| format!("Failed to build Google authorization URL: {}", e))?;

    // 3. Open system default browser
    open::that(authorize_url.as_str())
        .map_err(|e| format!("Failed to open system browser for Google Login: {}", e))?;

    // 4. Await callback authorization code from the spawned oneshot channel (5 minute timeout)
    let code_result = tokio::time::timeout(std::time::Duration::from_secs(300), code_rx)
        .await
        .map_err(|_| "Google OAuth login timed out waiting for browser authorization.".to_string())?
        .map_err(|_| "Google OAuth loopback channel closed before receiving authorization code.".to_string())?;

    let auth_code = code_result?;

    // 5. Exchange authorization code for tokens via reqwest POST including client_secret
    let http_client = reqwest::Client::new();
    let token_res = http_client
        .post(GOOGLE_TOKEN_URL)
        .form(&[
            ("code", auth_code.as_str()),
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
            ("redirect_uri", redirect_uri.as_str()),
            ("grant_type", "authorization_code"),
            ("code_verifier", code_verifier.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("Network error during Google token exchange: {}", e))?;

    if !token_res.status().is_success() {
        let status = token_res.status();
        let raw_err = token_res.text().await.unwrap_or_default();
        if let Ok(parsed_err) = serde_json::from_str::<GoogleApiErrorBody>(&raw_err) {
            let api_msg = parsed_err
                .error_description
                .or(parsed_err.error)
                .unwrap_or_else(|| raw_err.clone());
            return Err(format!("Google OAuth token exchange failed ({}): {}", status, api_msg));
        }
        return Err(format!(
            "Google OAuth token exchange failed ({}): {}",
            status, raw_err
        ));
    }

    let token_data: GoogleTokenResponse = token_res
        .json()
        .await
        .map_err(|e| format!("Failed to parse Google token response: {}", e))?;

    // 6. Fetch authenticated Google user profile
    let userinfo_res = http_client
        .get("https://www.googleapis.com/oauth2/v3/userinfo")
        .header("Authorization", format!("Bearer {}", token_data.access_token))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Google user profile: {}", e))?;

    if !userinfo_res.status().is_success() {
        let status = userinfo_res.status();
        let err_body = userinfo_res.text().await.unwrap_or_default();
        return Err(format!(
            "Failed to retrieve Google user profile ({}): {}",
            status, err_body
        ));
    }

    let userinfo: GoogleUserInfoResponse = userinfo_res
        .json()
        .await
        .map_err(|e| format!("Invalid Google userinfo JSON response: {}", e))?;

    let fallback_name = userinfo
        .email
        .split('@')
        .next()
        .unwrap_or("RentFlow User")
        .to_string();

    let profile = AuthResponse {
        id: userinfo.sub,
        email: userinfo.email,
        name: userinfo.name.unwrap_or(fallback_name),
        picture: userinfo.picture,
    };

    // 7. Store tokens in AuthState and persist to tauri-plugin-store JSON in app_data_dir
    {
        let mut guard = state
            .access_token
            .lock()
            .map_err(|e| format!("Failed to lock access_token: {}", e))?;
        *guard = Some(token_data.access_token);
    }
    if token_data.refresh_token.is_some() {
        let mut guard = state
            .refresh_token
            .lock()
            .map_err(|e| format!("Failed to lock refresh_token: {}", e))?;
        *guard = token_data.refresh_token;
    }
    {
        let mut guard = state
            .user_profile
            .lock()
            .map_err(|e| format!("Failed to lock user_profile: {}", e))?;
        *guard = Some(profile.clone());
    }

    save_persisted_session(&app, &state)?;

    Ok(profile)
}

#[tauri::command]
pub async fn google_oauth(
    app: AppHandle,
    state: State<'_, AuthState>,
) -> Result<AuthResponse, String> {
    google_login(app, state).await
}

#[tauri::command]
pub async fn google_oauth_logout(
    app: AppHandle,
    state: State<'_, AuthState>,
) -> Result<(), String> {
    let token = state
        .access_token
        .lock()
        .map_err(|e| format!("Failed to lock access_token: {}", e))?
        .take();

    if let Some(t) = token {
        let client = reqwest::Client::new();
        let _ = client
            .post("https://oauth2.googleapis.com/revoke")
            .form(&[("token", t)])
            .send()
            .await;
    }

    clear_auth_state_and_store(Some(&app), &state);
    Ok(())
}

#[tauri::command]
pub async fn google_get_current_user(
    state: State<'_, AuthState>,
) -> Result<Option<AuthResponse>, String> {
    let user = state
        .user_profile
        .lock()
        .map_err(|e| format!("Failed to lock user_profile: {}", e))?
        .clone();
    Ok(user)
}
