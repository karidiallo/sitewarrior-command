# SITEWARRIOR / GROWTH OS v6 — GitHub Pages + Supabase

**Stan:** gotowy katalog statyczny do GitHub Pages, z podłączonym publicznym adresem i publishable key Supabase. **Backend jeszcze NIE działa**, dopóki nie wykonasz SQL i nie dodasz kont. To nie jest potwierdzony produkcyjnie CRM — przed wprowadzeniem prawdziwych danych klientów wykonaj testy dwóch kont, konfliktów i odzyskiwania danych.

## Co jest skonfigurowane

- URL projektu Supabase: `https://fwmfvgnrabucwdyczbcg.supabase.co`.
- Klucz w `config.js` jest **publicznym publishable key**, nie sekretem. Nie umieszczaj tutaj `service_role`, `sb_secret_...`, hasła bazy ani tokenów kont.
- `cloud-v6.js` zapisuje osobno rekordy, sprawdza wersję przy zmianie, zachowuje kopię lokalną przy nieudanym zapisie i wyświetla `CLOUD / SAVED` wyłącznie po potwierdzeniu serwera.
- Dziennik `sw_audit` zapamiętuje zmianę, poprzednią i nową zawartość rekordu oraz operatora.
- Jeśli projekt jest skonfigurowany, ale biblioteka Supabase nie ładuje się, wejście w niezabezpieczony tryb lokalny jest blokowane.
- Zawiera wbudowane tło SiteWarrior i moduły CRM, zadań, ofert, płatności, kalendarza, projektów, marketingu, rynków, administracji i XP.

## A. Supabase — najpierw baza

1. Wejdź na https://supabase.com/dashboard i otwórz projekt z podanym adresem.
2. Jeśli to **nowy, pusty projekt**, przejdź do **SQL Editor → New query**, skopiuj całą zawartość `supabase/001_initial.sql` i kliknij **Run**. Jeżeli uruchamiałaś wcześniej skrypty v4/v5, **nie rób resetu ani nie wykonuj ślepo tego pliku** — potrzebna będzie kontrola istniejącego schematu i migracja.
3. W **Authentication → Users → Add user** utwórz dwa konta, każde z innym prywatnym adresem e-mail i hasłem. Skopiuj UUID Kari i UUID Adiego. Nigdy nie wysyłaj tu haseł.
4. Otwórz `supabase/002_members_TEMPLATE.sql`, zastąp dwa napisy `REPLACE-WITH-...-UUID` rzeczywistymi UUID, wklej do Supabase SQL Editor i kliknij **Run**. W `public.members` muszą być dokładnie: `Kari` i `Adi`.
5. W **Authentication → Providers → Email** sprawdź, czy logowanie e-mail/hasło działa. W **Authentication → Settings** (nazwa może się różnić) wyłącz publiczne tworzenie kont, ponieważ to prywatny system dwuosobowy.
6. W **Table Editor** sprawdź obecność tabel `members`, `sw_records`, `sw_audit`. RLS powinno być włączone dla wszystkich trzech. Polityki muszą blokować osoby spoza `members`.

## B. GitHub Pages — publikacja

1. Na GitHub utwórz repozytorium `sitewarrior-command-center`. Na GitHub Free użyj repozytorium **Public**, jeśli chcesz standardowe Pages z gałęzi. Repozytorium i kod strony są wtedy publiczne — **baza danych nie**, pod warunkiem poprawnego RLS.
2. Wgraj **zawartość tego folderu**, nie dodatkowy folder nadrzędny. `index.html` musi znajdować się w katalogu głównym repozytorium. **Nie wysyłaj ZIP-a jako jedynego pliku.**
3. Otwórz **Settings → Pages → Build and deployment** i ustaw **Deploy from a branch**, branch `main`, folder `/(root)`. Zapisz.
4. Adres będzie zbliżony do `https://TWOJ_LOGIN.github.io/sitewarrior-command-center/` — użyj dokładnego adresu pokazanego w GitHub Pages.
5. W Supabase otwórz **Authentication → URL Configuration**, ustaw **Site URL** na ten adres. Dodaj ten sam dokładny adres w **Redirect URLs**; przy logowaniu e-mail/hasło przekierowania nie są zawsze wymagane, ale są ważne dla linków mailowych i przyszłego resetu hasła.
6. Przetestuj HTTPS z dwóch różnych przeglądarek / urządzeń.

## C. Testy akceptacyjne — zrób zanim użyjesz prawdziwych leadów

- Kari loguje się do profilu Kari, Adi do profilu Adi; obce konto nie ma dostępu.
- Kari tworzy testowego leada, status potwierdza `CLOUD / SAVED`.
- Adi widzi tego leada po synchronizacji/odświeżeniu.
- Adi zapisuje wynik rozmowy i następny termin; Kari widzi historię.
- Kari i Adi jednocześnie edytują **ten sam rekord**: drugi zapis ma zostać odrzucony jako konflikt i zachować lokalną kopię zamiast cicho nadpisać zmiany.
- Rozłącz internet, zapisz edycję: oczekuj statusu błędu i kopii. Przywróć internet, ponów zapis.
- Przeglądarka zamknięta w trakcie zapisu: sprawdź kopię recovery i możliwość pobrania JSON.
- Użyj eksportu JSON i sprawdź odtworzenie w **osobnym środowisku testowym**, nie w działającej bazie.
- Zweryfikuj, że płatności, zadania, wyceny i filtr rynku nie zapisują się do niewłaściwej firmy.
- Sprawdź mobilną czytelność, klawiaturę i wszystkie formularze.

## Ważne ograniczenia i bezpieczeństwo

- To **nie jest backendowe realtime**; odświeżenie nowych danych z innego urządzenia działa przez polling ~20 sekund, kiedy brak niezapisanych zmian lokalnych. Nie ma automatycznego scalania konfliktów.
- Rekordy zapisują się oddzielnie, jednak operacje obejmujące kilka kolekcji mogą wymagać kilku batchy. Audyt pokazuje zapisane zmiany, a nie zastępuje pełnego systemu kopii zapasowych.
- Lokalna kopia niezapisanych rekordów przechowywana w przeglądarce (`localStorage`) nie jest zaszyfrowana. Korzystajcie wyłącznie z zaufanych urządzeń, unikajcie komputerów publicznych i rozważcie produkcyjny mechanizm backupu na serwerze.
- Po przekroczeniu limitów Supabase Free projekt może zostać ograniczony / wstrzymany. Wdróż niezależne kopie zanim system stanie się jedynym źródłem prawdy.
- Trzeba jeszcze przeprowadzić **realne testy z Supabase** i audyt użytkowy. Sam poprawny kod i test lokalny nie gwarantują gotowości produkcyjnej.
- Warianty rynków i cenniki lokalne inne niż EUR wymagają ręcznego zatwierdzenia; ceny nie są przeliczane automatycznie.

## Lokalny podgląd bez zapisywania do chmury

Żeby przetestować wyłącznie wygląd i funkcje **offline**, w osobnej kopii repo ustaw w `config.js` puste wartości URL i klucza, a potem uruchom `python -m http.server 8080`. **Nie publikuj takiej wersji** jako prywatnego CRM, ponieważ lokalny wybór Kari/Adi nie jest uwierzytelnianiem.

## Aktualizacje

Wprowadzaj zmiany w kodzie w repozytorium, nie bezpośrednio na Pages. Nie zmieniaj SQL bez migracji i testów. Nigdy nie wklejaj sekretów Supabase do publicznego repozytorium.
