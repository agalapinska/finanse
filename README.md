# Finanse domowe

Osobisty dashboard finansów domowych: budżet, długi metodą lawiny, poduszka i cele, tryb karty kredytowej ze spłatą całego wyciągu.

Jeden plik HTML, bez backendu. Dane zapisują się w przeglądarce użytkownika (localStorage) i w plikach JSON, które sam zapisuje i wczytuje — w tym repozytorium nie ma żadnych jawnych danych finansowych.

Opcjonalna synchronizacja urządzeń zapisuje cały stan w osobnym, prywatnym repozytorium użytkownika — zaszyfrowany hasłem, którego nie ma nigdzie poza jego urządzeniami.

Opcjonalny kanał „Zmiany od Claude” (katalog `sync/`) zawiera wyłącznie paczki zaszyfrowane kluczem publicznym sparowanego urządzenia; klucz prywatny nie opuszcza przeglądarki. Szczegóły: `CLAUDE.md`.

Strona: https://agalapinska.github.io/finanse/
