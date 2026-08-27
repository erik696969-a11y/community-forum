We have completed a small regression test suite after the previous `puedo` stopword fix.

Current results:

A. Pool rules query → PASS
B. Water leak incident → PASS
C. Neutral community events query → FAIL

The failing standalone query was:

`¿Qué eventos hay próximamente en la comunidad?`

The main LLM answer was reasonable, but the structured deterministic payload incorrectly attached what appears to be a power/network outage scenario:

**Haz esto ahora**

* Notify 952 80 80 17 / +34 655 095 844.
* Check the contact for this is not yet set up in the app - check with the Community Administrator if configured for a network outage.
* Use stairs rather than relying on elevators until power is stable.
* Keep access routes clear and use battery lighting where available.

**No**

* Do not enter electrical plant rooms.
* Do not attempt to operate communal switchgear.

**Contactos**

* Maintenance/Security
* Electricity utility

This confirms that the previous `puedo` collision was a real bug, but not the only source of false-positive scenario retrieval.

I do NOT want another narrow patch that simply adds one more stopword for the word that happened to trigger this query.

Please review and harden the retrieval/scoring logic generically.

## 1. First, diagnose this exact failure

Before changing the algorithm, report:

* which scenario ID became `primary` for
  `¿Qué eventos hay próximamente en la comunidad?`
* all candidate scenario IDs considered,
* the tokens/keywords that matched each candidate,
* the raw and final score of each candidate,
* why the winning scenario crossed the threshold or became primary,
* whether the false match came from single-token overlap, translated keywords, substring matching, phrase tokenization, or another mechanism.

I want the diagnosis first so we can verify the fix addresses the architecture, not only the symptom.

## 2. Retrieval design principle

The core rule should be:

**No deterministic scenario match is better than a wrong deterministic scenario match.**

If the system has low confidence that the current query describes one of the known deterministic incident/safety scenarios, it should return:

`primary: null`

and allow the normal knowledge / information response path to handle the question.

The retrieval engine must not force the “best available” scenario when all candidates are weak.

## 3. Harden scenario selection

Please evaluate and implement the appropriate combination of safeguards rather than relying only on stopwords.

Consider:

### Minimum confidence threshold

A scenario should only become `primary` if its score is meaningfully above a defined threshold.

### Minimum meaningful evidence

Do not allow an incident scenario to become primary because of one generic matching token.

Require either:

* multiple meaningful token matches,
* a strong phrase match,
* or an explicit high-value anchor concept.

### Phrase weighting

Specific multi-word phrases should score substantially higher than individual words.

Examples:

`fuga de agua`
`water leak`
`sin electricidad`
`power outage`

should be much stronger evidence than generic terms like:

`apartamento`
`comunidad`
`puedo`
`problema`
`contacto`

### Generic-term down-weighting

Common residential/community vocabulary should have little or no ability to trigger an incident scenario by itself.

### Required / anchor concepts

For high-impact scenarios, consider requiring at least one scenario-specific anchor concept.

Example:

A power outage scenario should require evidence related to:

* electricity,
* power,
* blackout,
* lights,
* electrical supply,
  etc.

It should never activate because of unrelated community words.

Similarly:

A water-leak scenario should require concepts related to:

* water,
* leak,
* flooding,
* dripping,
* ceiling,
* pipe,
  etc.

### Incident-intent gating

If useful, introduce a lightweight intent gate before deterministic incident scenarios are eligible.

Queries clearly about:

* events,
* documents,
* rules,
* recommendations,
* bookings,
* general community information

should normally remain on the knowledge path unless they explicitly describe an incident.

Do not overcomplicate this with a large new LLM classifier unless needed. A robust deterministic gate is preferable if it is sufficient.

## 4. Preserve correct existing behavior

Do not break queries that currently work.

At minimum preserve:

### Water leak

`Tengo una fuga de agua que parece venir del apartamento de arriba. ¿Qué debo hacer?`

Expected:

* WAT-01 remains primary,
* relevant immediate actions,
* contacts,
* safety guidance.

### Genuine power outage

A genuine power outage query should still select the correct power scenario.

### Pool rules

`¿Dónde puedo encontrar las normas sobre el uso de las piscinas?`

Expected:

* no emergency scenario,
* normal knowledge answer.

## 5. Add regression tests

Please add tests for all of these as separate fresh queries:

### Neutral / knowledge queries — must NOT trigger incident scenarios

1.

`¿Qué eventos hay próximamente en la comunidad?`

Expected:
`primary: null` or appropriate non-incident knowledge handling.

2.

`Where can I find the community documents?`

Expected:
no emergency scenario.

3.

`¿Puedo reservar una zona común?`

Expected:
no emergency scenario.

4.

`Can anyone recommend a plumber?`

Expected:
no water-leak scenario merely because `plumber` appears.

5.

`¿Dónde puedo encontrar las normas de la piscina?`

Expected:
no emergency scenario.

6.

`Who is the administrator of the community?`

Expected:
no incident scenario.

### Genuine incident queries — must still match

7.

`Tengo una fuga de agua del apartamento de arriba.`

Expected:
WAT-01 primary.

8.

`There is water coming through my ceiling.`

Expected:
correct water-related scenario.

9.

`No tenemos electricidad en las zonas comunes.`

Expected:
correct power outage scenario.

10.

`There is smoke coming from an electrical panel.`

Expected:
appropriate electrical/fire safety scenario.

## 6. Test multilingual retrieval

Because the previous bug originated from multilingual keyword additions, verify retrieval behavior independently in:

* EN
* ES
* DE
* FR

The same semantic query should lead to the same scenario intent regardless of language.

The translated keyword sets must not introduce common grammatical words that create false positives.

## 7. Do not address the structured-field translation yet

We already know that `immediate_actions`, `do_not`, `contact_route`, etc. are stored in English and therefore appear in English under ES preferredLanguage.

Treat that as a separate task.

For THIS task focus only on:

* correct scenario retrieval,
* confidence,
* false-positive prevention,
* correct primary selection,
* preserving genuine incident detection.

## 8. After implementation, report

Please tell me:

1. exact root cause of the Events false-positive;
2. the retrieval/scoring change you made;
3. any new thresholds or anchor rules introduced;
4. files changed;
5. tests added;
6. results of the complete regression suite;
7. whether there are any remaining known classes of false-positive risk.

Do not stop after making the Events query pass. I want the retrieval layer to be materially more robust across the whole assistant.
