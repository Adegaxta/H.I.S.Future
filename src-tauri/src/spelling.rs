#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SpellingResult {
    pub supported: bool,
    pub misspelled: bool,
    pub suggestions: Vec<String>,
}
fn validate(word: &str, locale: &str) -> Result<&'static str, String> {
    if word.is_empty()
        || word.encode_utf16().count() > 256
        || word.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        return Err("Invalid spelling word".into());
    }
    match locale {
        "es" => Ok("es-ES"),
        "en" => Ok("en-US"),
        _ => Err("Unsupported vault locale".into()),
    }
}
#[cfg(windows)]
mod native {
    use windows::{
        core::{PCWSTR, PWSTR},
        Win32::{
            Globalization::{ISpellChecker, ISpellCheckerFactory, SpellCheckerFactory},
            System::Com::{
                CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize,
                CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
            },
        },
    };
    struct Apartment(bool);
    impl Drop for Apartment {
        fn drop(&mut self) {
            if self.0 {
                unsafe { CoUninitialize() };
            }
        }
    }
    pub fn with_checker<T>(
        language: &str,
        run: impl FnOnce(Option<ISpellChecker>) -> Result<T, String>,
    ) -> Result<T, String> {
        unsafe {
            let status = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            if status.is_err() && status.0 != 0x80010106u32 as i32 {
                return Err(status.to_string());
            }
            let _apartment = Apartment(status.is_ok());
            let factory: ISpellCheckerFactory =
                CoCreateInstance(&SpellCheckerFactory, None, CLSCTX_INPROC_SERVER)
                    .map_err(|e| e.to_string())?;
            let language: Vec<u16> = language.encode_utf16().chain(Some(0)).collect();
            let language = PCWSTR(language.as_ptr());
            if !factory
                .IsSupported(language)
                .map_err(|e| e.to_string())?
                .as_bool()
            {
                return run(None);
            }
            run(Some(
                factory
                    .CreateSpellChecker(language)
                    .map_err(|e| e.to_string())?,
            ))
        }
    }
    pub fn check(word: &str, language: &str) -> Result<super::SpellingResult, String> {
        with_checker(language, |checker| unsafe {
            let Some(checker) = checker else {
                return Ok(super::SpellingResult {
                    supported: false,
                    misspelled: false,
                    suggestions: vec![],
                });
            };
            let wide: Vec<u16> = word.encode_utf16().chain(Some(0)).collect();
            let errors = checker
                .Check(PCWSTR(wide.as_ptr()))
                .map_err(|e| e.to_string())?;
            let mut error = None;
            errors.Next(&mut error).ok().map_err(|e| e.to_string())?;
            let misspelled = error.is_some();
            let mut suggestions = Vec::new();
            if misspelled {
                let values = checker
                    .Suggest(PCWSTR(wide.as_ptr()))
                    .map_err(|e| e.to_string())?;
                for _ in 0..8 {
                    let mut value = [PWSTR::null()];
                    let mut fetched = 0;
                    values
                        .Next(&mut value, Some(&mut fetched))
                        .ok()
                        .map_err(|e| e.to_string())?;
                    if fetched == 0 {
                        break;
                    }
                    let text = value[0].to_string();
                    CoTaskMemFree(Some(value[0].0.cast()));
                    let text = text.map_err(|e| e.to_string())?;
                    if text != word && !suggestions.contains(&text) {
                        suggestions.push(text);
                    }
                }
            }
            Ok(super::SpellingResult {
                supported: true,
                misspelled,
                suggestions,
            })
        })
    }
    pub fn add(word: &str, language: &str) -> Result<(), String> {
        with_checker(language, |checker| {
            let checker = checker.ok_or("Spelling language is not installed")?;
            let word: Vec<u16> = word.encode_utf16().chain(Some(0)).collect();
            unsafe { checker.Add(PCWSTR(word.as_ptr())) }.map_err(|e| e.to_string())
        })
    }
}
#[tauri::command]
pub fn get_spelling_suggestions(word: String, locale: String) -> Result<SpellingResult, String> {
    let language = validate(&word, &locale)?;
    #[cfg(windows)]
    {
        native::check(&word, language)
    }
    #[cfg(not(windows))]
    {
        let _ = language;
        Ok(SpellingResult {
            supported: false,
            misspelled: false,
            suggestions: vec![],
        })
    }
}
/// The Windows personal dictionary belongs to the user, independently of vaults.
#[tauri::command]
pub fn add_spelling_word(word: String, locale: String) -> Result<(), String> {
    let language = validate(&word, &locale)?;
    #[cfg(windows)]
    {
        native::add(&word, language)
    }
    #[cfg(not(windows))]
    {
        let _ = language;
        Err("Personal dictionary requires Windows".into())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_words_and_vault_languages() {
        assert_eq!(validate("ortografía", "es").unwrap(), "es-ES");
        assert_eq!(validate("hello", "en").unwrap(), "en-US");
        assert!(validate("two words", "en").is_err());
        assert!(validate("", "es").is_err());
        assert!(validate("word", "other").is_err());
    }
    #[test]
    #[cfg(windows)]
    fn native_suggestions_follow_each_locale() {
        for (locale, good, bad, expected) in [
            ("es", "ortografía", "ortgrafía", "ortografía"),
            ("en", "hello", "helo", "hello"),
        ] {
            let correct = get_spelling_suggestions(good.into(), locale.into()).unwrap();
            if !correct.supported {
                eprintln!(
                    "{locale} Windows dictionary unavailable; frontend uses its bundled dictionary"
                );
                continue;
            }
            assert!(!correct.misspelled);
            let incorrect = get_spelling_suggestions(bad.into(), locale.into()).unwrap();
            assert!(incorrect.misspelled);
            assert!(
                incorrect.suggestions.iter().any(|item| item == expected),
                "{incorrect:?}"
            );
        }
    }
}
