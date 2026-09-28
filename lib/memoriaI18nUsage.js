// Preklady Memorie — používanie nástroja (návštevy, čas, zmeny) pre vyhodnotenie skúšky.

const e = (en, es, fr, de) => ({ en, es, fr, de });

export const usageDict = {
  tabUsage: e('Usage', 'Uso', 'Utilisation', 'Nutzung'),
  usageIntro: e(
    'How much each board member used Memoria: visits, days, time, records added or changed, and AI requests. Useful to evaluate the trial on facts.',
    'Cuánto ha usado Memoria cada miembro de la Junta: visitas, días, tiempo, registros creados o modificados y consultas a la IA. Sirve para evaluar la prueba con datos.',
    'Dans quelle mesure chaque membre du conseil a utilisé Memoria : visites, jours, temps, enregistrements ajoutés ou modifiés et requêtes IA. Utile pour évaluer l’essai sur des faits.',
    'Wie viel jedes Vorstandsmitglied Memoria genutzt hat: Besuche, Tage, Zeit, angelegte oder geänderte Einträge und KI-Anfragen. Hilft, die Testphase anhand von Fakten zu bewerten.'
  ),
  usageTransparency: e(
    'Memoria records when a board member has it open and is working in it. The time counts only while the window is visible and something is being done; after 10 minutes without activity the visit ends. All board members see the same figures, and nobody can change or delete them.',
    'Memoria registra cuándo un miembro de la Junta la tiene abierta y está trabajando. El tiempo solo cuenta mientras la ventana está visible y se hace algo; tras 10 minutos sin actividad la visita termina. Todos los miembros de la Junta ven las mismas cifras y nadie puede modificarlas ni borrarlas.',
    'Memoria enregistre quand un membre du conseil l’a ouverte et y travaille. Le temps ne compte que lorsque la fenêtre est visible et qu’une action est faite ; après 10 minutes sans activité la visite se termine. Tous les membres du conseil voient les mêmes chiffres, et personne ne peut les modifier ni les supprimer.',
    'Memoria erfasst, wann ein Vorstandsmitglied sie geöffnet hat und darin arbeitet. Die Zeit zählt nur, solange das Fenster sichtbar ist und etwas getan wird; nach 10 Minuten ohne Aktivität endet der Besuch. Alle Vorstandsmitglieder sehen dieselben Zahlen, und niemand kann sie ändern oder löschen.'
  ),
  usagePeriod: e('Period', 'Periodo', 'Période', 'Zeitraum'),
  usageFrom: e('From', 'Desde', 'Du', 'Von'),
  usageTo: e('To', 'Hasta', 'Au', 'Bis'),
  usagePresetTrial: e('Trial Oct–Dec 2026', 'Prueba oct–dic 2026', 'Essai oct.–déc. 2026', 'Test Okt.–Dez. 2026'),
  usagePresetMonth: e('This month', 'Este mes', 'Ce mois-ci', 'Dieser Monat'),
  usagePresetLast30: e('Last 30 days', 'Últimos 30 días', '30 derniers jours', 'Letzte 30 Tage'),
  usagePresetAll: e('Since the start', 'Desde el inicio', 'Depuis le début', 'Seit Beginn'),
  usageMember: e('Board member', 'Miembro de la Junta', 'Membre du conseil', 'Vorstandsmitglied'),
  usageVisits: e('Visits', 'Visitas', 'Visites', 'Besuche'),
  usageDays: e('Days used', 'Días de uso', 'Jours d’utilisation', 'Nutzungstage'),
  usageTime: e('Time (h:mm)', 'Tiempo (h:mm)', 'Temps (h:mm)', 'Zeit (h:mm)'),
  usageAdded: e('Added', 'Creados', 'Ajoutés', 'Angelegt'),
  usageUpdated: e('Changed', 'Modificados', 'Modifiés', 'Geändert'),
  usageDeleted: e('Deleted', 'Eliminados', 'Supprimés', 'Gelöscht'),
  usageAi: e('AI requests', 'Consultas IA', 'Requêtes IA', 'KI-Anfragen'),
  usageLastVisit: e('Last visit', 'Última visita', 'Dernière visite', 'Letzter Besuch'),
  usageTotal: e('Total', 'Total', 'Total', 'Gesamt'),
  usageFormer: e('no longer on the board', 'ya no está en la Junta', 'ne fait plus partie du conseil', 'nicht mehr im Vorstand'),
  usageNever: e('never', 'nunca', 'jamais', 'nie'),
  usageNotes: e(
    'Records marked DEMO are not counted. AI requests = questions to Ask Memoria and documents read by the AI. Time measurement starts with this version; earlier work appears only in the changes.',
    'Los registros DEMO no se cuentan. Consultas IA = preguntas a Memoria y documentos leídos por la IA. La medición del tiempo empieza con esta versión; el trabajo anterior solo aparece en los cambios.',
    'Les enregistrements DÉMO ne sont pas comptés. Requêtes IA = questions à Memoria et documents lus par l’IA. La mesure du temps commence avec cette version ; le travail antérieur n’apparaît que dans les modifications.',
    'DEMO-Einträge werden nicht gezählt. KI-Anfragen = Fragen an Memoria und von der KI gelesene Dokumente. Die Zeitmessung beginnt mit dieser Version; frühere Arbeit erscheint nur bei den Änderungen.'
  ),
  usageExport: e('⬇ Excel: summary, visits and all changes', '⬇ Excel: resumen, visitas y todos los cambios', '⬇ Excel : synthèse, visites et toutes les modifications', '⬇ Excel: Übersicht, Besuche und alle Änderungen'),
  usageSheetSummary: e('Summary', 'Resumen', 'Synthèse', 'Übersicht'),
  usageSheetVisits: e('Visits', 'Visitas', 'Visites', 'Besuche'),
  usageSheetChanges: e('Changes', 'Cambios', 'Modifications', 'Änderungen'),
  usageStarted: e('Started', 'Inicio', 'Début', 'Beginn'),
  usageEnded: e('Last activity', 'Última actividad', 'Dernière activité', 'Letzte Aktivität'),
  usageMinutes: e('Minutes', 'Minutos', 'Minutes', 'Minuten'),
  usageTabs: e('Screens used', 'Pantallas usadas', 'Écrans utilisés', 'Genutzte Bildschirme'),
  usageWhen: e('When', 'Cuándo', 'Quand', 'Wann'),
  usageWho: e('Who', 'Quién', 'Qui', 'Wer'),
  usageAction: e('Action', 'Acción', 'Action', 'Aktion'),
  usageRecordType: e('Record type', 'Tipo de registro', 'Type d’enregistrement', 'Eintragsart'),
  usageRecord: e('Record', 'Registro', 'Enregistrement', 'Eintrag'),
  usageFields: e('Changed fields', 'Campos modificados', 'Champs modifiés', 'Geänderte Felder'),
  usageLoadError: e('Could not load the usage figures: {error}', 'No se pudieron cargar los datos de uso: {error}', 'Impossible de charger les chiffres d’utilisation : {error}', 'Nutzungsdaten konnten nicht geladen werden: {error}'),
};
