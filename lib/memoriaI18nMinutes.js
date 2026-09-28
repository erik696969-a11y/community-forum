// Preklady Memorie — import zápisnice (AI prečíta zápisnicu, board potvrdí).

const e = (en, es, fr, de) => ({ en, es, fr, de });

export const minutesDict = {
  minImportButton: e('Import minutes (AI)', 'Importar acta (IA)', 'Importer un procès-verbal (IA)', 'Protokoll importieren (KI)'),
  minImportTitle: e('Import the minutes of a meeting', 'Importar el acta de una reunión', 'Importer le procès-verbal d’une réunion', 'Sitzungsprotokoll importieren'),
  minImportIntro: e(
    'Upload the approved minutes (PDF, Word or photo) or paste their text. The AI reads them and proposes the agenda points, decisions, tasks with deadlines and progress on existing tasks. Nothing is saved until you check and confirm it.',
    'Suba el acta aprobada (PDF, Word o foto) o pegue su texto. La IA la lee y propone los puntos del orden del día, los acuerdos, las tareas con plazos y el avance de tareas existentes. No se guarda nada hasta que usted lo revise y confirme.',
    'Téléversez le procès-verbal approuvé (PDF, Word ou photo) ou collez son texte. L’IA le lit et propose les points de l’ordre du jour, les décisions, les tâches avec échéances et l’avancement des tâches existantes. Rien n’est enregistré avant votre vérification.',
    'Laden Sie das genehmigte Protokoll hoch (PDF, Word oder Foto) oder fügen Sie den Text ein. Die KI liest es und schlägt Tagesordnungspunkte, Beschlüsse, Aufgaben mit Fristen und den Stand bestehender Aufgaben vor. Gespeichert wird erst nach Ihrer Prüfung.'
  ),
  minChooseFile: e('Choose file (PDF, Word or photo)', 'Elegir archivo (PDF, Word o foto)', 'Choisir un fichier (PDF, Word ou photo)', 'Datei wählen (PDF, Word oder Foto)'),
  minOrPaste: e('…or paste the text of the minutes', '…o pegue el texto del acta', '…ou collez le texte du procès-verbal', '…oder den Protokolltext einfügen'),
  minReadText: e('Read the pasted text', 'Leer el texto pegado', 'Lire le texte collé', 'Eingefügten Text lesen'),
  minReading: e('AI is reading the minutes… (up to a minute)', 'La IA está leyendo el acta… (hasta un minuto)', 'L’IA lit le procès-verbal… (jusqu’à une minute)', 'Die KI liest das Protokoll… (bis zu einer Minute)'),
  minNotMinutes: e('This does not look like the minutes of a meeting. Check the file.', 'Esto no parece el acta de una reunión. Revise el archivo.', 'Cela ne ressemble pas à un procès-verbal. Vérifiez le fichier.', 'Das sieht nicht wie ein Sitzungsprotokoll aus. Bitte Datei prüfen.'),
  minReviewTitle: e('Check what the AI found', 'Revise lo que encontró la IA', 'Vérifiez ce que l’IA a trouvé', 'Prüfen Sie, was die KI gefunden hat'),
  minReviewHint: e(
    'Untick anything that should not be saved and correct any field. Only what is ticked is saved, all at once.',
    'Desmarque lo que no deba guardarse y corrija cualquier campo. Solo se guarda lo marcado, todo a la vez.',
    'Décochez ce qui ne doit pas être enregistré et corrigez les champs. Seul ce qui est coché est enregistré, en une fois.',
    'Entfernen Sie Häkchen bei allem, was nicht gespeichert werden soll, und korrigieren Sie Felder. Gespeichert wird nur Angehaktes, alles auf einmal.'
  ),
  minSectionMeeting: e('Meeting', 'Reunión', 'Réunion', 'Sitzung'),
  minSectionItems: e('Agenda points and decisions', 'Puntos del orden del día y acuerdos', 'Points de l’ordre du jour et décisions', 'Tagesordnungspunkte und Beschlüsse'),
  minSectionActions: e('New tasks with deadlines', 'Nuevas tareas con plazos', 'Nouvelles tâches avec échéances', 'Neue Aufgaben mit Fristen'),
  minSectionUpdates: e('Progress on existing tasks', 'Avance de tareas existentes', 'Avancement des tâches existantes', 'Stand bestehender Aufgaben'),
  minSectionUncertain: e('Please check', 'Revise por favor', 'À vérifier', 'Bitte prüfen'),
  minMatchedMeeting: e('Adds to the existing meeting: {name}', 'Se añade a la reunión existente: {name}', 'Complète la réunion existante : {name}', 'Ergänzt die bestehende Sitzung: {name}'),
  minNewMeeting: e('A new meeting will be created', 'Se creará una nueva reunión', 'Une nouvelle réunion sera créée', 'Eine neue Sitzung wird angelegt'),
  minUseExisting: e('Add to existing meeting', 'Añadir a una reunión existente', 'Ajouter à une réunion existante', 'Zu bestehender Sitzung hinzufügen'),
  minCreateNew: e('— create a new meeting —', '— crear una nueva reunión —', '— créer une nouvelle réunion —', '— neue Sitzung anlegen —'),
  minRecordDecision: e('Record as a decision', 'Registrar como acuerdo', 'Enregistrer comme décision', 'Als Beschluss erfassen'),
  minDecisionText: e('Decision', 'Acuerdo', 'Décision', 'Beschluss'),
  minRationale: e('Reason', 'Motivo', 'Motif', 'Begründung'),
  minVotes: e('Votes for / against / abstain', 'Votos a favor / en contra / abstenciones', 'Voix pour / contre / abstentions', 'Stimmen dafür / dagegen / Enthaltungen'),
  minUnanimous: e('unanimous', 'unanimidad', 'unanimité', 'einstimmig'),
  minLinkedTo: e('Linked to', 'Vinculado a', 'Lié à', 'Verknüpft mit'),
  minPage: e('p. {n}', 'pág. {n}', 'p. {n}', 'S. {n}'),
  minFromPoint: e('From point {n}', 'Del punto {n}', 'Du point {n}', 'Aus Punkt {n}'),
  minDueAsWritten: e('As written: “{text}” – date calculated, please check', 'Según el acta: «{text}» – fecha calculada, revísela', 'Selon le PV : « {text} » – date calculée, à vérifier', 'Laut Protokoll: „{text}“ – Datum berechnet, bitte prüfen'),
  minNoDue: e('No deadline in the minutes', 'El acta no indica plazo', 'Pas d’échéance dans le PV', 'Keine Frist im Protokoll'),
  minNewStatus: e('New status', 'Nuevo estado', 'Nouveau statut', 'Neuer Status'),
  minKeepStatus: e('— only add the note —', '— solo añadir la nota —', '— ajouter seulement la note —', '— nur Notiz hinzufügen —'),
  minNoActions: e('The minutes contain no new tasks.', 'El acta no contiene tareas nuevas.', 'Le PV ne contient pas de nouvelles tâches.', 'Das Protokoll enthält keine neuen Aufgaben.'),
  minNextMeeting: e('Next meeting in the minutes: {date}', 'Próxima reunión según el acta: {date}', 'Prochaine réunion selon le PV : {date}', 'Nächste Sitzung laut Protokoll: {date}'),
  minCreateNextMeeting: e('Also plan the next meeting', 'Planificar también la próxima reunión', 'Planifier aussi la prochaine réunion', 'Nächste Sitzung ebenfalls planen'),
  minSaveAll: e('Save the ticked items', 'Guardar lo marcado', 'Enregistrer les éléments cochés', 'Angehakte Einträge speichern'),
  minSaving: e('Saving…', 'Guardando…', 'Enregistrement…', 'Speichern…'),
  minSaved: e(
    'Saved: {items} agenda points, {decisions} decisions, {tasks} tasks, {updates} task updates. The minutes are attached to the meeting.',
    'Guardado: {items} puntos, {decisions} acuerdos, {tasks} tareas, {updates} actualizaciones. El acta queda adjunta a la reunión.',
    'Enregistré : {items} points, {decisions} décisions, {tasks} tâches, {updates} mises à jour. Le PV est joint à la réunion.',
    'Gespeichert: {items} Punkte, {decisions} Beschlüsse, {tasks} Aufgaben, {updates} Aktualisierungen. Das Protokoll ist der Sitzung beigefügt.'
  ),
  minWhereNext: e(
    'Tasks now appear in Follow-up, in the Calendar, in alerts and in the weekly board e-mail. Unfinished ones are suggested for the next agenda.',
    'Las tareas aparecen ahora en Seguimiento, en el Calendario, en los avisos y en el e-mail semanal de la Junta. Las pendientes se proponen para el próximo orden del día.',
    'Les tâches apparaissent maintenant dans Suivi, dans le Calendrier, dans les alertes et dans l’e-mail hebdomadaire. Les tâches non terminées sont proposées pour le prochain ordre du jour.',
    'Die Aufgaben erscheinen jetzt in Umsetzung, im Kalender, in den Hinweisen und in der wöchentlichen Vorstands-E-Mail. Offene werden für die nächste Tagesordnung vorgeschlagen.'
  ),
  minDiscard: e('Discard', 'Descartar', 'Abandonner', 'Verwerfen'),
  minAsDemo: e('Mark as DEMO (sample data)', 'Marcar como DEMO (datos de ejemplo)', 'Marquer comme DÉMO (exemple)', 'Als DEMO markieren (Beispieldaten)'),
  minPrinciple: e(
    'AI proposes, the board decides: the AI only transcribes what the minutes say; it does not add, judge or decide anything.',
    'La IA propone, la Junta decide: la IA solo transcribe lo que dice el acta; no añade, valora ni decide nada.',
    'L’IA propose, le conseil décide : l’IA ne fait que reprendre le PV ; elle n’ajoute, ne juge et ne décide rien.',
    'Die KI schlägt vor, der Vorstand entscheidet: Die KI überträgt nur, was im Protokoll steht; sie ergänzt, bewertet und entscheidet nichts.'
  ),
  minMeetingDateRequired: e('The meeting date is required.', 'La fecha de la reunión es obligatoria.', 'La date de la réunion est obligatoire.', 'Das Sitzungsdatum ist erforderlich.'),
  minTextTooLong: e('The text is too long. Upload the PDF instead.', 'El texto es demasiado largo. Suba el PDF.', 'Le texte est trop long. Téléversez le PDF.', 'Der Text ist zu lang. Bitte das PDF hochladen.'),
  minPastedTitle: e('Minutes (pasted text)', 'Acta (texto pegado)', 'PV (texte collé)', 'Protokoll (eingefügter Text)'),
};
