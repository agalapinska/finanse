# Finanse domowe — notatki dla Claude

## Zasady, których nie wolno złamać

- **Repozytorium i strona są publiczne.** Nigdy nie commituj jawnych danych finansowych: eksportów JSON, paczek przed zaszyfrowaniem, kwot w komunikatach commitów, README ani testach. Pliki robocze z danymi trzymaj poza repozytorium.
- **Push do `main` to wdrożenie.** GitHub Pages publikuje `main` po ok. 1–2 minutach, a użytkowniczka trzyma w tej aplikacji prawdziwe dane (localStorage, klucz `finanse-domowe-v1`).
- **`migrate()` musi przyjąć każdy starszy zapis i nie może rzucić wyjątkiem.** Przy błędzie `load()` startuje z pustymi danymi, a autozapis je utrwala. Każde nowe pole dodaj do `defaults()` i do `migrate()`.
- Przed pushem uruchom `node tools/smoke.mjs` (Playwright + Chrome; `CHROME=/usr/bin/google-chrome`, jeśli trzeba wskazać przeglądarkę).

## Budowa

Cała aplikacja to `index.html` (CSS i JS w środku), bez builda i bez zależności.

- Stan: obiekt `S` — `settings`, `debts`, `categories`, `items` (pozycje budżetu: `fix` / `var` / `res`), `expenses`, `months[RRRR-MM]` (`extras`, `fixed`, `paid`, `inc`), `debtEvents`, `goalEvents`, `reservePays`, `goals`, `card`, `cardPays`, `sync`.
- Widoki to funkcje zwracające HTML (`vStart`, `vBudzet`, …); akcje w `ACT` / `CHG` przez `data-act` / `data-change`; formularze przez `sheet()`.
- Teksty po polsku, krótkie, w 2. osobie. Kwoty zawsze przez `zl()` / `fmt()`.

## Karta kredytowa

Tryb „płacę kartą i co miesiąc spłacam cały wyciąg” (`S.card`, `S.cardPays`).

- Wydatek z `card:true` i stała pozycja budżetu z `card:true` liczą się do obrotu karty. Do budżetu wchodzą w dniu zakupu; spłata wyciągu to przelew, nie wydatek.
- Cykl wyciągu nosi nazwę miesiąca, w którym się zamyka (`card.close`, puste = koniec miesiąca). Termin spłaty: pierwszy dzień `card.due` po zamknięciu.
- Stałe pozycje „kartą” liczą się od `card.since` (dzień włączenia trybu) i są wliczane z góry.
- Wpis w `cardPays` z `full:true` zamyka wyciąg; bez niego to wcześniejsza spłata zmniejszająca kwotę do zapłaty.

## Tabela miesiąca

Budżet → „Pobierz tabelę miesiąca” zapisuje `finanse-RRRR-MM-tabela.csv` (średnik, przecinek dziesiętny, UTF-8 z BOM): każdy zakup, koszt stały, rezerwa, rata, nadpłata, wpłata i wpływ w osobnym wierszu, z pustymi kolumnami „Powtarzalne (tak/nie)” i „Uwagi” oraz `ID` wpisu.

Rytm ustalony z użytkowniczką: co miesiąc poprawia tabelę w arkuszu i wgrywa ją w rozmowie. Cel analizy to wyłapanie powtarzalnych zakupów (np. chemia domowa), zaplanowanie ich z góry i rozłożenie kosztów w czasie. Poprawki do istniejących wpisów odsyłaj paczką po `ID`. Wgrana tabela to jawne dane — nie trafia do repozytorium.

## Synchronizacja urządzeń

Dwukierunkowa, między urządzeniami użytkowniczki (`CLOUD`, `cloudSync()`). Cały stan `S` jest szyfrowany AES-GCM kluczem z hasła (PBKDF2) i zapisywany jako `dane.json` w jej **osobnym, prywatnym repozytorium** przez GitHub API. Token, klucz i znacznik `base` leżą w localStorage pod `finanse-domowe-v1-chmura`, poza plikiem z danymi.

- Claude nie zna hasła i nie czyta tych danych — tak wybrała użytkowniczka. Nie proś o hasło ani token.
- Reguła: stan z drugiej strony jest przyjmowany tylko wtedy, gdy lokalny nie zmienił się od ostatniej zgodności (`S.updatedAt === base`). Gdy zmieniły się obie strony, aplikacja pyta, którą wersję zostawić, a drugą zapisuje pod `finanse-domowe-v1-kopia-sync`.
- Nieudane odszyfrowanie nigdy nie może kończyć się zapisem do repozytorium.
- `save(false)` nie zmienia `updatedAt`, więc nie wyzwala wysyłki. Formularz, który nie powinien oznaczać danych jako zmienione, musi zwrócić `false` z `onSubmit` i zamknąć się sam.

## Zmiany od Claude (`sync/`)

Kanał jednokierunkowy: Claude → aplikacja. Aplikacja przy otwarciu pobiera `sync/index.json`, odszyfrowuje paczki o numerze wyższym niż `S.sync.last` i wykonuje ich operacje. Paczka to lista operacji, nie cały stan, więc lokalne zmiany użytkowniczki zostają.

Żeby poznać aktualny stan danych, poproś o niego (Ustawienia → „Kopiuj dane” lub plik) — aplikacja niczego nie wysyła sama.

### Praca z kanałem

1. Parowanie (raz na urządzenie): użytkowniczka wkleja kod `finanse-klucz:…` → `node tools/sync.mjs device '<kod>' <nazwa>` → commit `sync/index.json`.
2. Wysyłka: zapisz paczkę **poza repozytorium**, np. `{"note":"3 wydatki z 12.11","ops":[…]}` → `node tools/sync.mjs push /ścieżka/paczka.json` → commit i push katalogu `sync/`.
3. `note` pokazuje się w aplikacji jako komunikat „Od Claude: …” z przyciskiem „Cofnij”.

Wadliwa paczka (np. ścieżka do nieistniejącego elementu) nie zostanie zastosowana i zablokuje kolejne. Naprawa: usuń jej numer z `updates` w `sync/index.json` i wyślij poprawioną.

### Operacje

Każda operacja musi dać ten sam wynik przy ponownym wykonaniu (stary plik danych + te same paczki). Dlatego nowe elementy zawsze dostają stałe, unikalne `id` (np. `cl` + data + numer).

| Operacja | Przykład |
| --- | --- |
| `upsert` — dodaje lub aktualizuje element listy po `id` | `{"op":"upsert","path":"expenses","value":{"id":"cl261112a","date":"2026-11-12","amount":10,"cat":"zycie","note":"…","card":true}}` |
| | nadwyżka: `"path":"months.2026-11.extras"`, wartość `{id,amount,src,date,note}` |
| `set` — ustawia pole | `{"op":"set","path":"card.due","value":14}`, `"path":"items[p19].card"`, `"path":"debts[revolut].payment"`, `"path":"months.2026-12.inc.uop"` |
| `remove` — usuwa pole lub element listy | `{"op":"remove","path":"expenses[cl261112a]"}` |
| `debtEvent` — rata lub nadpłata; zmienia saldo długu | `{"op":"debtEvent","id":"cl261112b","debt":"revolut","kind":"nadplata","amount":100,"date":"2026-11-12"}` (`"kind":"rata"` wymaga `"ym"`; `"del":true` cofa) |
| `goalEvent` — wpłata/wypłata poduszki (`cushion`) lub słoika (`jar`) | `{"op":"goalEvent","id":"cl261112c","goal":"jar","amount":50,"date":"2026-11-12","note":"…"}` |

W ścieżce `lista[id]` wskazuje element listy po jego `id`. Sald długów i celów nie ustawiaj przez `set`, jeśli zmiana wynika z wpłaty — użyj `debtEvent` / `goalEvent`, żeby została w historii.
