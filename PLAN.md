# Plan: app för väckning och kö till Claude Code

Nov 14, 2026 · @Simpa

## MVP: det som byggs nu

MVP:n är en macOS-app i menyraden med en enda lista. Användaren lägger till rader med "+ Add", och varje rad startar Claude på en vald tid.

Det finns två typer av rader. De ligger i samma lista men är olika funktioner.

|  | Wake | Körning |
| --- | --- | --- |
| Syfte | Starta ett 5-timmarsfönster | Köra arbete utan tillsyn |
| Projekt (mapp) | Nej, körs i en tom mapp | Ja |
| Prompt | Nej, appen skickar ett tecken | Ja |
| Behörighetsläge | Behövs inte | Auto eller Hoppa över alla frågor |
| Modell | Billigaste | Väljs per rad |
| Starttid | Now eller klockslag | Now eller klockslag |

### Flödet "+ Add"

1. Välj typ: Wake (kryssruta) eller körning.
2. För en körning: välj projekt, behörighetsläge och modell. Skriv prompten.
3. Välj starttid: Now eller ett klockslag.
4. Raden hamnar i listan med status "väntar".

### Regler

| Regel | Beskrivning |
| --- | --- |
| En körning i taget | Pågår en körning väntar nästa tills den är klar. Två agenter skriver då aldrig i samma filer. |
| Wake väntar inte | En Wake skickas alltid på sin tid, även när en körning pågår. |
| Fönstrets slut | Användaren kan fylla i när nuvarande fönster slutar. Ska en rad starta på samma tid lägger appen på 1 minut. |
| Gräns nådd | Körningen stannar med status "gräns nådd". Den fortsätter inte själv i MVP:n. |
| Stopp | Varje körning har en stoppknapp och en hård stopptid. |
| Status | Väntar, kör, klar, gräns nådd, stoppad, fel. |
| Logg | En rad per händelse: tid, projekt, status, sista raden från Claude. |
| Vaken dator | Datorn hålls vaken så länge en rad väntar eller kör. Laddare och öppet lock krävs. |
| Menyrad | Appen lever kvar i menyraden när fönstret stängs. |
| Sparas | Projekt och rader finns kvar mellan omstarter. |

## Två exempel

Exemplen visar hur de två radtyperna används i MVP:n.

### Exempel 1: Wake kl. 10:00

Användaren är borta från datorn kl. 10 och vill att ett nytt fönster startar ändå.

1. "+ Add", kryssa i Wake, välj 10:00.
2. Kl. 10:00 startar appen Claude i bakgrunden och skickar ett tecken.
3. Fönstret gäller från 10:00. Slutade ett fönster just 10:00 skickar appen 10:01.

Tidig start ger fler fönster. Start 05:00 ger 05–10, 10–15 och 15–20. Start 09:00 ger 09–14 och 14–19.

### Exempel 2: Nattkörning före veckoreset

Veckan nollställs kl. 05:00 nästa morgon. Klockan är 23:00 och det finns tokens kvar. Projektet har en plan och en lista med issues.

1. "+ Add", körning, välj projekt, läge Auto, modell Opus, starttid Now. Prompt: "Starta från där du var, lös ett issue, rapportera och avsluta."
2. "+ Add" igen med samma inställningar och samma prompt, starttid 04:00.

Resultat: ett issue löses kl. 23:00 och ett kl. 04:00. Fler issues kräver fler rader, eller en prompt som säger "lös alla, ett i taget".

## Byggordning

Appen byggs i fyra vertikala skivor. Varje skiva fungerar från UI till körning.

1. **Wake.** "+ Add", Wake, tid. Appen skickar ett tecken och loggar resultatet.
2. **En körning.** "+ Add" med projekt, prompt, läge, modell och tid. Status och logg visas.
3. **Flera rader.** Listan klarar flera rader. En körning i taget.
4. **Menyrad och vaken dator.** Appen lever kvar när fönstret stängs och håller datorn vaken.

Wake byggs först. Den är minst och använder samma start av Claude som körningarna.

## Senare

Det här ingår inte i MVP:n.

| Sak | När | Beskrivning |
| --- | --- | --- |
| Resume | v2 | Tar tokens slut fortsätter appen samma körning i nästa fönster, tills Claude avslutar själv. Tekniskt: `--resume <session-id>`. |
| Upprepa | Senare | Samma prompt startar om tills ett klockslag. Appen kan inte veta när alla issues är slut, så det behöver lösas först. |
| Läsa fönstrets slut automatiskt | Senare | Appen läser sluttiden från Claude i stället för att användaren fyller i den. Kräver ett test, se Öppet. |
| Push-spärr | Senare | En teknisk spärr så att Claude aldrig pushar i en obevakad körning. |
| Sista starttid | Senare | Listan slutar starta nya körningar efter ett klockslag. Det skyddar dagens fönster. |

## Utanför appen

Tre saker sköter användaren själv, och tre risker är kända.

| Sak | Hantering |
| --- | --- |
| Veckoreset | Användaren håller koll själv. Appen känner inte till den. |
| Inloggning | Användaren ser till att Claude Code är inloggat. Appen varnar när en körning stoppas av inloggningen. |
| Design | UI:t ritas separat i Claude Design. |

### Kända risker

| Risk | Läge |
| --- | --- |
| `claude -p` kan flyttas från abonnemanget | Anthropic planerade det i maj 2026 och pausade planen i juni. I dag drar `-p` från abonnemanget. Inget byggs för risken nu. |
| `--bare` kan bli standard för `-p` | Dokumentationen säger att det sker i en framtida version. Bare-läget använder inte abonnemangets inloggning. |
| Usage credits | Är usage credits påslaget stannar inte en körning vid gränsen. Den fortsätter på betalda krediter. |

## Teknik

Appen byggs med Electron, React, TypeScript och Vite, med Vitest för tester.

| Del | Val |
| --- | --- |
| Start av Claude | `claude -p`. Claude kör prompten och avslutar sig själv. |
| Utdata | `--output-format stream-json --verbose` ger en JSON-rad per händelse. Status läses därifrån, inte från text. |
| Klart tecken | Sista raden är en `result`-händelse. Slutkod 0 betyder att körningen lyckades. |
| Behörighet | `--permission-mode` anges alltid för en körning. `--permission-prompts none` säger att ingen kan svara på frågor. |
| Nekade åtgärder | Resultatet listar dem i `permission_denials`. Kräver Claude Code v2.1.259 eller senare. |
| Stopp | Stoppknappen skickar SIGINT (avbryt) och sedan SIGTERM (avsluta). |
| Klocka | Listan jämförs med datorns klocka var 30:e sekund. En lång timer stannar när datorn sover. |
| Sökväg | Hela sökvägen till `claude` sparas vid första start. En app startad från Finder får inte terminalens PATH. |
| Vaken dator | Electron `powerSaveBlocker`. Ingen terminal och inget caffeinate behövs. |
| Data | JSON i appens datamapp. |
| Mapp | `~/dev/<namn>`. Namnet är inte bestämt. Det ska vara på engelska. |

### Kommandon

```bash
# Wake, i en tom mapp
claude -p "!" --model haiku --output-format stream-json --verbose

# Körning, i projektets mapp
claude -p "<prompt>" --permission-mode auto --permission-prompts none --model <modell> --output-format stream-json --verbose
```

Läget "Hoppa över alla frågor" byter `--permission-mode auto` mot `--dangerously-skip-permissions`.

Wake får inte använda `--bare`. Bare-läget använder inte abonnemangets inloggning och startar då inget fönster.

## Fakta som planen bygger på

Alla rader utom den sista kommer från Anthropics egna sidor. Den sista är inte testad.

| Fakta | Källa |
| --- | --- |
| Ett 5-timmarsfönster startar vid första meddelandet och nollställs 5 timmar senare. | [Anthropic support: usage limits](https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work) |
| Veckogränsen nollställs på en fast tid som hör till kontot. | [Anthropic support: usage limits](https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work) |
| `claude -p` drar från abonnemangets gränser vid inloggning med en plan. | [Anthropic support: Agent SDK och plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) |
| Usage credits gör att arbetet fortsätter på betalda krediter efter gränsen. | [Anthropic support: usage credits](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans) |
| `claude -p` kör utan chatt. Sista raden i `stream-json` är en `result`-händelse. Slutkod 0 betyder lyckad körning. | [Claude Code: headless](https://code.claude.com/docs/en/headless) |
| `--resume <session-id>` fortsätter en bestämd konversation. `--continue` fortsätter den senaste. | [Claude Code: headless](https://code.claude.com/docs/en/headless) |
| `--permission-prompts none` är avsett för obevakade körningar. | [Claude Code: headless](https://code.claude.com/docs/en/headless) |
| En `-p`-körning utan valt läge startar i Manual. Åtgärder som kräver godkännande nekas. | [Claude Code: permission modes](https://code.claude.com/docs/en/permission-modes) |
| I auto mode bedömer en granskande modell varje åtgärd. Force push stoppas, vanlig push tillåts. Deny-regler gäller i alla lägen. | [Claude Code: permission modes](https://code.claude.com/docs/en/permission-modes) |
| Claude Desktop har egna schemalagda uppgifter. De känner inte till fönstren och hoppar över en uppgift som krockar. | [Claude Code: desktop scheduled tasks](https://code.claude.com/docs/en/desktop-scheduled-tasks) |
| Händelsen `rate_limit_event` finns i `stream-json` och bär status och sluttid. | Felrapporter från användare. Finns inte i Anthropics dokumentation. Inte testat. |

## Öppet

Två saker ska testas och en ska beslutas.

| Fråga | Avgörs genom |
| --- | --- |
| Hur syns "gräns nådd" i utdatat? | Syns första gången en körning når gränsen. Felrapporter nämner händelsen `rate_limit_event`. |
| Innehåller utdatat fönstrets sluttid? | Läs utdatat efter en Wake i skiva 1. |
| Namn på appen | Beslut. Engelska. |

## Arbetssätt

Appen byggs med Claude Code enligt fyra regler.

- TDD red-green-refactor. Tidslogiken skrivs först, som rena funktioner som går att testa utan Claude.
- Vertikala skivor: varje steg ger något som fungerar från UI till körning.
- Claude står aldrig som författare eller medförfattare i commits och pushar aldrig. Användaren godkänner commits och pushar själv.
- Behörighetsfrågor i Claude Code svarar användaren på själv.
