# Migration História — vysvetlenie

Tento priečinok (`supabase/migrations/`) je usporiadaná verzia predtým roztrúsených
`.sql` súborov z koreňa repozitára (`migration-*.sql`, `extra-policies.sql`).

## Dôležité upozornenie

**Presné historické dátumy sa nedali obnoviť** — pôvodný zip export appky
neobsahoval git históriu (žiadny `.git` priečinok), takže neexistuje záznam
o tom, kedy presne bol ktorý súbor commitnutý. Dátumy v názvoch súborov
(`20260601000000_...`) sú preto **umelé, len sekvenčné** (1. jún, 2. jún, ...) —
neznamenajú skutočný dátum vytvorenia.

Poradie súborov ALE **rešpektuje reálne závislosti** medzi nimi (napr. súbor,
ktorý mení stĺpec `directory_visible`, je zaradený až PO súbore, ktorý ten
stĺpec vytvoril) — zistené analýzou obsahu každého súboru. V tomto zmysle je
poradie spoľahlivé, aj keď dátumy nie sú skutočné.

## Zaujímavý nález počas triedenia

`20260610000000_poll_closing_date_attempt_superseded.sql` a
`20260611000000_polls_closing_date_and_autoclose.sql` obsahujú **rovnaký**
príkaz `alter table polls add column closes_at timestamptz;`. Vyzerá to na
prvý pokus (bez `if not exists`), ktorý bol nahradený kompletnejšou verziou
s automatickým uzatváraním hlasovania po termíne. Ak si pamätáš, že si prvý
súbor v skutočnosti nikdy nespustil (len si ho omylom nechal v repozitári),
môžeš ho pokojne vynechať/zmazať — je tu ponechaný len pre úplnosť záznamu.

## Čo s pôvodnými súbormi v koreni repozitára?

Tieto pôvodné `.sql` súbory (`migration-blockA.sql` a pod.) môžeš z koreňa
repozitára zmazať, keď budeš mať tento `supabase/migrations/` priečinok
nahratý — obsahovo sú identické, len usporiadané a premenované. Nič sa tým
nestratí.

## Do budúcna

Odteraz odporúčam pri KAŽDEJ novej DB zmene rovno vytvárať súbor priamo v
`supabase/migrations/` s časovou pečiatkou vo formáte `YYYYMMDDHHMMSS_popis.sql`
(napr. cez `supabase migration new nazov_zmeny`, ak niekedy budeš používať
Supabase CLI), namiesto voľne pohodených súborov v koreni. Uľahčí to budúci
audit aj prípadné zapojenie ďalšieho vývojára.
