//! TypeSQL for Zed: runs `@typesql/language-server`, TypeScript 7's language server with
//! completions for tables and columns inside `sql()` strings, on TypeScript and JavaScript files.
//!
//! The server comes from npm, unless `lsp.typesql.binary.path` names another command; it gets
//! `binary.arguments` and then the worktree's root. `lsp.typesql.initialization_options` and
//! `lsp.typesql.settings` go to TypeScript's server as they are.
use std::{env, fs};

use zed_extension_api::{
    self as zed, LanguageServerId, LanguageServerInstallationStatus, Result, Worktree,
    serde_json::Value, settings::LspSettings,
};

const SERVER_ID: &str = "typesql";
const PACKAGE: &str = "@typesql/language-server";
const SCRIPT: &str = "node_modules/@typesql/language-server/dist/bin.js";

struct TypeSql {
    /// Whether this session checked the installed package against npm.
    checked: bool,
}

impl TypeSql {
    /// The installed server's script, installed or updated first when this session has not checked.
    fn script(&mut self, id: &LanguageServerId) -> Result<String> {
        let installed = || fs::metadata(SCRIPT).is_ok_and(|m| m.is_file());
        if self.checked && installed() {
            return Ok(SCRIPT.into());
        }
        zed::set_language_server_installation_status(
            id,
            &LanguageServerInstallationStatus::CheckingForUpdate,
        );
        match zed::npm_package_latest_version(PACKAGE) {
            Ok(latest) => {
                if zed::npm_package_installed_version(PACKAGE)?.as_deref() != Some(&*latest) {
                    zed::set_language_server_installation_status(
                        id,
                        &LanguageServerInstallationStatus::Downloading,
                    );
                    // offline or failed: keep using an installed version
                    if let Err(e) = zed::npm_install_package(PACKAGE, &latest)
                        && !installed()
                    {
                        return Err(e);
                    }
                }
            }
            Err(e) if !installed() => return Err(e),
            Err(_) => {}
        }
        if !installed() {
            return Err(format!("{PACKAGE}: {SCRIPT} is missing after installing"));
        }
        self.checked = true;
        Ok(SCRIPT.into())
    }
}

impl zed::Extension for TypeSql {
    fn new() -> Self {
        TypeSql { checked: false }
    }

    fn language_server_command(
        &mut self,
        id: &LanguageServerId,
        worktree: &Worktree,
    ) -> Result<zed::Command> {
        let binary = LspSettings::for_worktree(SERVER_ID, worktree)
            .ok()
            .and_then(|s| s.binary);
        let env = worktree.shell_env();
        if let Some(path) = binary.as_ref().and_then(|b| b.path.clone()) {
            let mut args = binary.and_then(|b| b.arguments).unwrap_or_default();
            args.push(worktree.root_path());
            return Ok(zed::Command {
                command: path,
                args,
                env,
            });
        }
        let script = env::current_dir()
            .map_err(|e| e.to_string())?
            .join(self.script(id)?);
        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args: vec![script.to_string_lossy().into_owned(), worktree.root_path()],
            env,
        })
    }

    fn language_server_initialization_options(
        &mut self,
        _id: &LanguageServerId,
        worktree: &Worktree,
    ) -> Result<Option<Value>> {
        Ok(LspSettings::for_worktree(SERVER_ID, worktree)
            .ok()
            .and_then(|s| s.initialization_options))
    }

    fn language_server_workspace_configuration(
        &mut self,
        _id: &LanguageServerId,
        worktree: &Worktree,
    ) -> Result<Option<Value>> {
        Ok(LspSettings::for_worktree(SERVER_ID, worktree)
            .ok()
            .and_then(|s| s.settings))
    }
}

zed::register_extension!(TypeSql);
