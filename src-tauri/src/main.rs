// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod db;
mod drive_sync;

use db::{
    add_credit, add_expense, add_invoice, add_lease, add_maintenance_request, add_payment,
    add_property, add_tenant, add_unit, add_vendor, db_backup_file, db_delete_invoice_cascading,
    db_delete_item, db_delete_property_cascading, db_delete_tenant_cascading,
    db_delete_unit_cascading, db_export_all, db_get_item, db_get_table, db_import_all, db_init,
    db_insert_item, db_update_item, delete_expense, delete_invoice, delete_lease,
    delete_maintenance_request, delete_property, delete_tenant, delete_unit, delete_vendor,
    get_app_data_path, get_credits, get_data_path, get_expenses, get_invoices, get_leases,
    get_maintenance_requests, get_payments, get_properties, get_settings, get_tenants, get_units,
    get_vendors, migrate_database, record_deduction_transaction, record_payment_transaction,
    resolve_data_dir, save_setting, save_settings, set_data_path, update_expense, update_invoice,
    update_lease, update_maintenance_request, update_property, update_tenant, update_unit,
    update_vendor, wipe_all_local_data, DatabaseManager,
};
use drive_sync::{drive_pull_backup, drive_push_backup, get_backup_list, restore_from_snapshot};
use auth::{
    google_get_current_user, google_login, google_oauth, google_oauth_logout, hydrate_auth_state,
    AuthState,
};
use std::fs;
use tauri::Manager;

#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(120));
        app.restart();
    });
}

fn main() {
    eprintln!("[RentFlow Tauri] Starting main() application entrypoint...");
    dotenvy::dotenv().ok();

    let run_result = tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            if let Some(main_window) = app.get_webview_window("main") {
                if let Some(icon) = app.default_window_icon() {
                    if let Err(err) = main_window.set_icon(icon.clone()) {
                        eprintln!("[RentFlow Tauri] Warning: failed to apply main window icon: {}", err);
                    }
                }
            }

            if let Err(e) = (|| -> Result<(), Box<dyn std::error::Error>> {
                eprintln!("[RentFlow Tauri] Initializing SQLite DB & Store...");
                let data_dir = resolve_data_dir(app.handle())
                    .map_err(|e| format!("Failed to resolve data directory: {}", e))?;

                fs::create_dir_all(&data_dir)
                    .map_err(|e| format!("Failed to create data directory: {}", e))?;

                let db_path = data_dir.join("rentflow.db");
                eprintln!("[RentFlow Tauri] Opening database at {:?}...", db_path);
                let db_manager = DatabaseManager::new(db_path)
                    .map_err(|e| format!("Failed to initialize database: {}", e))?;

                let auth_state = AuthState::default();
                hydrate_auth_state(app.handle(), &auth_state);

                app.manage(db_manager);
                app.manage(auth_state);

                eprintln!("[RentFlow Tauri] SQLite database & Store OAuth state initialized.");
                Ok(())
            })() {
                eprintln!("FATAL SETUP ERROR: {}", e);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Generic Database operations (SQLite)
            db_init,
            db_get_table,
            db_get_item,
            db_insert_item,
            db_update_item,
            db_delete_item,
            db_delete_property_cascading,
            db_delete_unit_cascading,
            db_delete_invoice_cascading,
            db_delete_tenant_cascading,
            db_export_all,
            db_import_all,
            db_backup_file,
            wipe_all_local_data,
            // Properties CRUD
            get_properties,
            add_property,
            update_property,
            delete_property,
            // Units CRUD
            get_units,
            add_unit,
            update_unit,
            delete_unit,
            // Tenants CRUD
            get_tenants,
            add_tenant,
            update_tenant,
            delete_tenant,
            // Leases CRUD
            get_leases,
            add_lease,
            update_lease,
            delete_lease,
            // Invoices CRUD
            get_invoices,
            add_invoice,
            update_invoice,
            delete_invoice,
            // Payments & Deposit Deductions Transactions
            get_payments,
            add_payment,
            record_payment_transaction,
            record_deduction_transaction,
            // Expenses CRUD
            get_expenses,
            add_expense,
            update_expense,
            delete_expense,
            // Maintenance Requests CRUD
            get_maintenance_requests,
            add_maintenance_request,
            update_maintenance_request,
            delete_maintenance_request,
            // Vendors CRUD
            get_vendors,
            add_vendor,
            update_vendor,
            delete_vendor,
            // Credits CRUD
            get_credits,
            add_credit,
            // Settings & Data Path
            get_settings,
            save_setting,
            save_settings,
            get_app_data_path,
            get_data_path,
            set_data_path,
            migrate_database,
            // Google OAuth Loopback Desktop Flow
            google_login,
            google_oauth,
            google_oauth_logout,
            google_get_current_user,
            // Google Drive Rust Sync (Versioned Snapshots & Manifest)
            drive_push_backup,
            drive_pull_backup,
            get_backup_list,
            restore_from_snapshot,
            // App Lifecycle
            restart_app,
        ])
        .run({
            eprintln!("[RentFlow Tauri] Running Tauri window builder and event loop...");
            tauri::generate_context!()
        });

    if let Err(e) = run_result {
        eprintln!("FATAL RUNTIME ERROR while running RentFlow desktop application: {}", e);
    }
}
