// Preklady Memorie — návod (karta „Pomoc“) a odkazy z „Ask Memoria“.

const e = (en, es, fr, de) => ({ en, es, fr, de });

export const helpDict = {
  tabHelp: e('Help', 'Ayuda', 'Aide', 'Hilfe'),
  helpButton: e('❓ Help', '❓ Ayuda', '❓ Aide', '❓ Hilfe'),
  helpIntro: e(
    'Step-by-step guides for everything in Memoria. Type your question in your own words, for example “where are the quotes for pool cleaning?”.',
    'Guías paso a paso para todo lo que hay en Memoria. Escriba su pregunta con sus propias palabras, por ejemplo «¿dónde están las ofertas de limpieza de piscinas?».',
    'Des guides pas à pas pour tout ce que contient Memoria. Tapez votre question avec vos propres mots, par exemple « où sont les devis pour le nettoyage de la piscine ? ».',
    'Schritt-für-Schritt-Anleitungen für alles in Memoria. Stellen Sie Ihre Frage in eigenen Worten, z. B. „Wo sind die Angebote für die Poolreinigung?“.'
  ),
  helpSearchPlaceholder: e('What do you want to do or find?', '¿Qué quiere hacer o encontrar?', 'Que voulez-vous faire ou trouver ?', 'Was möchten Sie tun oder finden?'),
  helpPopular: e('Frequent questions', 'Preguntas frecuentes', 'Questions fréquentes', 'Häufige Fragen'),
  helpAllGuides: e('All guides', 'Todas las guías', 'Tous les guides', 'Alle Anleitungen'),
  helpResults: e('Guides that match', 'Guías que coinciden', 'Guides correspondants', 'Passende Anleitungen'),
  helpNoResults: e('No guide matches these words. Try other words, or ask Memoria.', 'Ninguna guía coincide con estas palabras. Pruebe con otras o pregunte a Memoria.', 'Aucun guide ne correspond à ces mots. Essayez d’autres mots ou demandez à Memoria.', 'Keine Anleitung passt zu diesen Wörtern. Versuchen Sie andere Wörter oder fragen Sie Memoria.'),
  helpAskInstead: e('💬 Ask Memoria this question', '💬 Preguntar esto a Memoria', '💬 Poser cette question à Memoria', '💬 Diese Frage Memoria stellen'),
  helpBack: e('← All guides', '← Todas las guías', '← Tous les guides', '← Alle Anleitungen'),
  helpSteps: e('Step by step', 'Paso a paso', 'Étape par étape', 'Schritt für Schritt'),
  helpTips: e('Good to know', 'Conviene saber', 'Bon à savoir', 'Gut zu wissen'),
  helpOpenScreen: e('Open this screen →', 'Abrir esta pantalla →', 'Ouvrir cet écran →', 'Diesen Bildschirm öffnen →'),
  helpSeeAlso: e('See also', 'Vea también', 'Voir aussi', 'Siehe auch'),
  helpPrint: e('🖨 Print this guide', '🖨 Imprimir esta guía', '🖨 Imprimer ce guide', '🖨 Anleitung drucken'),
  helpScreenshot: e('How it looks (sample data)', 'Así se ve (datos de ejemplo)', 'À quoi cela ressemble (données d’exemple)', 'So sieht es aus (Beispieldaten)'),
  helpSectionStart: e('Getting started', 'Primeros pasos', 'Premiers pas', 'Erste Schritte'),
  helpSectionGovernance: e('Governance: tasks, deadlines, meetings, decisions', 'Gobierno: tareas, plazos, reuniones, acuerdos', 'Gouvernance : tâches, échéances, réunions, décisions', 'Verwaltung: Aufgaben, Fristen, Sitzungen, Beschlüsse'),
  helpSectionMoney: e('Suppliers and spending', 'Proveedores y gastos', 'Fournisseurs et dépenses', 'Lieferanten und Ausgaben'),
  helpSectionReports: e('Reports and backup', 'Informes y copia de seguridad', 'Rapports et sauvegarde', 'Berichte und Sicherung'),
  askOpenScreen: e('Open: {name} →', 'Abrir: {name} →', 'Ouvrir : {name} →', 'Öffnen: {name} →'),
  askShowGuide: e('📖 Guide: {name}', '📖 Guía: {name}', '📖 Guide : {name}', '📖 Anleitung: {name}'),
};
